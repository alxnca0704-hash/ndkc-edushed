import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  AVAILABILITY_DAYS,
  AVAILABILITY_TIME_SLOTS,
  parseAvailabilityPatternKey,
} from "../constants/availability";
import { asSubjectColorToken } from "../constants/subjectColors";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  SOFT_CONSTRAINT_KEYS,
} from "../constants/scheduleSettings";
import type {
  OptimizationResult,
  ScheduleSettings,
  SoftConstraintKey,
} from "../types/scheduleSettings";
import { gaGenerate } from "./scheduling/gaGenerate";
import { repair, type RepairStats } from "./scheduling/repair";
import { isDean, roleOf } from "./roles";
import type {
  InfeasibilityReason,
  PlacedSession,
  SchedulingAvailability,
  SchedulingInput,
  SoftConstraintWeights,
} from "./scheduling/types";

const yearValidator = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
);

const sessionValidator = v.object({
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  subjectColor: v.string(),
  courseId: v.id("courses"),
  courseCode: v.string(),
  courseName: v.string(),
  year: yearValidator,
  teacherId: v.string(),
  teacherName: v.string(),
  roomId: v.id("rooms"),
  roomName: v.string(),
  roomType: v.union(v.literal("lecture"), v.literal("lab")),
  dayPattern: v.union(v.literal("MW"), v.literal("TTh")),
  dayIndex: v.number(),
  startMinutes: v.number(),
  endMinutes: v.number(),
});

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

/**
 * A stored row as the app reads it, with the color made definite.
 *
 * `schedules.subjectColor` is optional in the schema (see the note there), so a
 * row generated before subjects had colors reads as `undefined`. Normalizing
 * here — at the query, not at each caller — is what lets
 * `ScheduleSession.subjectColor` stay a plain `string`: the legacy case is
 * handled once, and no component has to know "a schedule might have no color".
 */
function asSession(row: Doc<"schedules">) {
  return { ...row, subjectColor: asSubjectColorToken(row.subjectColor) };
}

type AvailabilityPayload = {
  teacherId: string;
  blockedSlots: string[];
};

type AvailabilityQueryResult =
  | { ok: true; data: AvailabilityPayload[] }
  | { ok: false; error: string };

type GenerateActionResult =
  | {
      ok: true;
      count: number;
      /**
       * The GA's soft score for the week it built. Never `null`: the GA *is* the
       * generator now, so there is always a score, and it is 0 when every
       * preference is switched off.
       */
      optimization: OptimizationResult;
    }
  | {
      ok: false;
      error: string;
      infeasibleSubjects?: readonly InfeasibilityReason[];
      /**
       * The conflicts left in the best week the GA could find. Present when the
       * search ran but could not reach a conflict-free arrangement — the
       * thesis's third output, a conflict report, rather than a broken schedule
       * written to the database.
       */
      conflicts?: readonly string[];
    };

type ScheduleSettingsResult =
  | { ok: true; data: ScheduleSettings }
  | { ok: false; error: string };

/**
 * A switched-off constraint contributes nothing to the fitness function, so it
 * passes a weight of 0 rather than being omitted.
 */
function weightsFromSettings(
  settings: ScheduleSettings,
): SoftConstraintWeights {
  const weights: SoftConstraintWeights = {
    workloadBalance: 0,
    daySpread: 0,
    gapMinimization: 0,
  };
  for (const key of SOFT_CONSTRAINT_KEYS) {
    const constraint = settings[key];
    weights[key] = constraint.enabled ? constraint.weight : 0;
  }
  return weights;
}

function activeConstraintKeys(
  weights: SoftConstraintWeights,
): SoftConstraintKey[] {
  return SOFT_CONSTRAINT_KEYS.filter((key) => weights[key] > 0);
}

export const listAvailability = internalQuery({
  args: {},
  handler: async (ctx): Promise<AvailabilityQueryResult> => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isDean(identity)) {
        return { ok: true, data: [] };
      }

      const docs = await ctx.db.query("availability").collect();

      return {
        ok: true,
        data: docs.map((doc) => ({
          teacherId: doc.teacherId,
          blockedSlots: doc.blockedSlots,
        })),
      };
    } catch (error) {
      return { ok: false, error: toErrorString(error) };
    }
  },
});

export const saveGenerated = internalMutation({
  args: { sessions: v.array(sessionValidator) },
  handler: async (ctx, args): Promise<number> => {
    const now = Date.now();
    const existing = await ctx.db.query("schedules").collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    let inserted = 0;
    for (const session of args.sessions) {
      await ctx.db.insert("schedules", {
        ...session,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }

    return inserted;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isDean(identity)) {
        return { ok: true as const, data: [] };
      }

      const sessions = await ctx.db.query("schedules").order("asc").collect();

      return { ok: true as const, data: sessions.map(asSession) };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

/**
 * The caller's own schedule rows, read through the `by_teacherId` index.
 *
 * The teacher is resolved from the verified Clerk identity on the server, never
 * from an argument — a client cannot ask for another teacher's rows (Invariant
 * 3), and a Dean (or anonymous caller) gets the same empty result `rooms.listAll`
 * gives instead of a throw, so a failed page load surfaces through `error`.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity || roleOf(identity) !== "teacher") {
        return { ok: true as const, data: [] };
      }

      const sessions = await ctx.db
        .query("schedules")
        .withIndex("by_teacherId", (q) => q.eq("teacherId", identity.subject))
        .collect();

      return { ok: true as const, data: sessions.map(asSession) };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

interface SubjectRow {
  _id: string;
  name: string;
  teacherId: string;
  roomId: string;
  roomType: "lecture" | "lab";
  teacherName: string;
  durationMinutes: number;
  courseId: string;
  courseCode: string;
  courseName: string;
  year: 1 | 2 | 3 | 4;
  /**
   * The subject's palette token. Typed as a plain string because it is validated
   * as one and normalized with `asSubjectColorToken` on the way into a generated
   * row — a doc written before colors existed reads as `undefined` at runtime,
   * and the grid still has to paint it.
   */
  color?: string;
}

interface RoomRow {
  _id: string;
  name: string;
  type: "lecture" | "lab";
}

function buildSchedulingInput(
  subjects: readonly SubjectRow[],
  rooms: readonly RoomRow[],
  availability: readonly AvailabilityPayload[],
): SchedulingInput {
  const roomById = new Map(rooms.map((room) => [room._id, room]));

  const normalizedAvailability: SchedulingAvailability[] = availability.map(
    (entry) => {
      const slotsByPattern = new Map<"MW" | "TTh", number[]>();
      for (const key of entry.blockedSlots) {
        const parsed = parseAvailabilityPatternKey(key);
        if (!parsed) {
          continue;
        }
        const list = slotsByPattern.get(parsed.dayPattern) ?? [];
        slotsByPattern.set(parsed.dayPattern, list);
        list.push(parsed.timeSlotIndex);
      }
      return {
        teacherId: entry.teacherId,
        blockedByPattern: [...slotsByPattern.entries()].map(
          ([dayPattern, slotIndexes]) => ({
            dayPattern,
            slotIndexes,
          }),
        ),
      };
    },
  );

  return {
    days: AVAILABILITY_DAYS.map((day) => ({ ...day })),
    timeSlots: AVAILABILITY_TIME_SLOTS.map((slot) => ({ ...slot })),
    rooms: rooms.map((room) => ({
      id: room._id,
      name: room.name,
      type: room.type,
    })),
    subjects: subjects.map((subject) => {
      const room = roomById.get(subject.roomId);
      return {
        id: subject._id,
        name: subject.name,
        teacherId: subject.teacherId,
        teacherName: subject.teacherName,
        roomId: subject.roomId,
        requiredRoomType: room?.type ?? subject.roomType,
        durationMinutes: subject.durationMinutes,
        courseId: subject.courseId,
        year: subject.year,
      };
    }),
    availability: normalizedAvailability,
  };
}

/**
 * One stored schedule row, built from a placement and the snapshots the two
 * views need to draw the class.
 *
 * Shared by generation and by repair so a row written by either carries
 * identical fields — a repair that rebuilt rows its own way would quietly
 * produce a schedule the grid cannot draw.
 */
function toSessionRow(
  placement: PlacedSession,
  subjectById: ReadonlyMap<string, SubjectRow>,
  roomById: ReadonlyMap<string, RoomRow>,
) {
  const subject = subjectById.get(placement.subjectId);
  const room = roomById.get(placement.roomId);

  // Every placement comes from the subject rows the engine was given, so a miss
  // means the input changed mid-run. Fail loudly instead of writing a row with an
  // empty course reference.
  if (!subject) {
    throw new Error("A scheduled subject is missing from the scheduling input");
  }

  return {
    subjectId: placement.subjectId as Id<"subjects">,
    subjectName: subject.name,
    // Snapshotted, like the course/year below it, so a schedule row carries
    // everything either view needs to draw a class — and so a subject repainted
    // after a generate only reaches the timetable on the next one, with every
    // other snapshot moving at the same time.
    subjectColor: asSubjectColorToken(subject.color),
    courseId: subject.courseId as Id<"courses">,
    courseCode: subject.courseCode,
    courseName: subject.courseName,
    year: subject.year,
    teacherId: placement.teacherId,
    teacherName: subject.teacherName,
    roomId: placement.roomId as Id<"rooms">,
    roomName: room?.name ?? "Unknown",
    roomType: room?.type ?? ("lecture" as const),
    dayPattern: placement.dayPattern,
    dayIndex: placement.dayIndex,
    startMinutes: placement.startMinutes,
    endMinutes: placement.endMinutes,
  };
}

/**
 * The second half of the thesis's workflow (§7): a teacher's availability has
 * just changed, which can strand a class they were placed for, so the schedule
 * is repaired locally and automatically.
 *
 * There is no "repair" button and no confirmation step. The change is the
 * trigger; the engine moves the classes the new blocks actually broke — and only
 * those — and writes the result. A teacher who blocks one afternoon does not get
 * their Monday reshuffled.
 *
 * If the repair fails the schedule is left exactly as it was. A teacher is not
 * going to lose a class they already had because their new availability made the
 * week impossible; they are told instead, and a Dean can regenerate.
 */
export const repairAfterAvailabilityChange = internalMutation({
  args: { teacherId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    outcome: "repaired" | "not-needed" | "no-schedule" | "failed";
    movedSubjects: number;
    reason?: string;
    stats?: RepairStats;
  }> => {
    const scheduleRows = await ctx.db.query("schedules").collect();
    if (scheduleRows.length === 0) {
      return { outcome: "no-schedule", movedSubjects: 0 };
    }

    const availabilityDocs = await ctx.db.query("availability").collect();
    const availability: AvailabilityPayload[] = availabilityDocs.map((doc) => ({
      teacherId: doc.teacherId,
      blockedSlots: doc.blockedSlots,
    }));

    const roomDocs = await ctx.db.query("rooms").collect();
    const rooms: RoomRow[] = roomDocs.map((room) => ({
      _id: room._id,
      name: room.name,
      type: room.type,
    }));

    const subjectDocs = await ctx.db.query("subjects").collect();
    const courseDocs = await ctx.db.query("courses").collect();
    const courseById = new Map(courseDocs.map((course) => [course._id, course]));
    const roomTypeById = new Map(rooms.map((room) => [room._id, room.type]));
    const subjects: SubjectRow[] = subjectDocs.map((subject) => {
      const course = courseById.get(subject.courseId);
      return {
        _id: subject._id,
        name: subject.name,
        durationMinutes: subject.durationMinutes,
        roomId: subject.roomId,
        roomType: roomTypeById.get(subject.roomId) ?? "lecture",
        courseId: subject.courseId,
        courseCode: course?.code ?? "",
        courseName: course?.name ?? "",
        year: subject.year,
        teacherId: subject.teacherId,
        teacherName: subject.teacherId,
        color: subject.color,
      };
    });

    const input = buildSchedulingInput(subjects, rooms, availability);
    const current: PlacedSession[] = scheduleRows.map((row) => ({
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      roomId: row.roomId,
      dayPattern: row.dayPattern,
      dayIndex: row.dayIndex,
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes,
    }));

    const result = repair({
      input,
      schedule: current,
      trigger: { kind: "teacher-availability-changed", teacherId: args.teacherId },
    });

    if (result.stats?.outcome === "not-needed") {
      return { outcome: "not-needed", movedSubjects: 0, stats: result.stats };
    }
    if (!result.success) {
      return {
        outcome: "failed",
        movedSubjects: 0,
        reason: result.reason,
        stats: result.stats,
      };
    }

    const movedSubjectIds = new Set(
      result.changes.map((change) => change.subjectId),
    );
    const subjectById = new Map(subjects.map((subject) => [subject._id, subject]));
    const roomById = new Map(rooms.map((room) => [room._id, room]));
    const now = Date.now();

    // Replace only the rows for the classes that moved. Every other row is left
    // untouched, which is what makes the repair local in storage as well as in
    // the search.
    for (const row of scheduleRows) {
      if (movedSubjectIds.has(row.subjectId)) {
        await ctx.db.delete(row._id);
      }
    }
    for (const placement of result.repairedSessions) {
      await ctx.db.insert("schedules", {
        ...toSessionRow(placement, subjectById, roomById),
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      outcome: "repaired",
      movedSubjects: movedSubjectIds.size,
      stats: result.stats,
    };
  },
});

export const generate = action({
  args: {},
  handler: async (ctx): Promise<GenerateActionResult> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity || !isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const roomsResult: { ok: true; data: RoomRow[] } | { ok: false; error: string } =
      await ctx.runQuery(api.rooms.listAll);
    if (!roomsResult.ok) {
      return { ok: false as const, error: roomsResult.error };
    }

    const subjectsResult: { ok: true; data: SubjectRow[] } | { ok: false; error: string } =
      await ctx.runQuery(api.subjects.listAll);
    if (!subjectsResult.ok) {
      return { ok: false as const, error: subjectsResult.error };
    }

    const availabilityResult: AvailabilityQueryResult = await ctx.runQuery(
      internal.schedule.listAvailability,
    );
    if (!availabilityResult.ok) {
      return { ok: false as const, error: availabilityResult.error };
    }

    const input = buildSchedulingInput(
      subjectsResult.data,
      roomsResult.data,
      availabilityResult.data,
    );

    // The GA builds the whole week from nothing (§7). The old pipeline built it
    // with the CSP and then polished it with `runGA`, which is the ordering the
    // thesis rejects — and it meant the schedule existed before any optimization
    // was attempted, so the search could only ever rearrange a finished answer.
    //
    // Soft constraints are not a separate pass any more: they are the fitness
    // function the GA maximizes while it searches.
    const settingsResult: ScheduleSettingsResult = await ctx.runQuery(
      api.scheduleSettings.get,
    );
    // If the settings record cannot be read the week is still worth building —
    // with every preference off the search is simply a hunt for the fewest
    // conflicts, which is a valid, if plain, schedule.
    const settings = settingsResult.ok
      ? settingsResult.data
      : DEFAULT_SCHEDULE_SETTINGS;
    const weights = weightsFromSettings(settings);

    const result = gaGenerate(input, { weights });
    if (!result.ok) {
      if ("reason" in result) {
        return { ok: false as const, error: result.reason.message };
      }
      const single = result.reasons[0];
      const summary =
        result.reasons.length === 1
          ? `"${single.subjectName}" (${single.durationMinutes} min) can't be placed on either MW or TTh — each pattern is explained below.`
          : `${result.reasons.length} subjects could not be scheduled on either day pattern. Review each one below to see what's blocking its MW and TTh options.`;
      return {
        ok: false as const,
        error: summary,
        infeasibleSubjects: result.reasons,
      };
    }

    // The GA is allowed to propose invalid weeks while it searches — that is what
    // the 1001 penalty is for — but the best one it ends with is still a broken
    // week, and a broken week is not a schedule. Storing it would hand the Dean a
    // timetable with clashes in it and no indication of which, which is strictly
    // worse than the old pipeline's guaranteed-valid output. So the conflicts are
    // reported instead, and the database keeps whatever it had.
    if (!result.valid) {
      return {
        ok: false as const,
        error: `The Genetic Algorithm could not find a conflict-free week. The closest it got still had ${result.hardViolations} ${result.hardViolations === 1 ? "conflict" : "conflicts"} — see the list below. Nothing was saved.`,
        conflicts: result.violations,
      };
    }

    const solution = result.schedule;
    const optimization: OptimizationResult = {
      fitness: result.softScore,
      constraints: activeConstraintKeys(weights),
    };

    const subjectById = new Map(subjectsResult.data.map((subject) => [subject._id, subject]));
    const roomById = new Map(roomsResult.data.map((room) => [room._id, room]));

    const sessions = solution.map((placement) =>
      toSessionRow(placement, subjectById, roomById),
    );

    const saved: number = await ctx.runMutation(
      internal.schedule.saveGenerated,
      { sessions },
    );

    return { ok: true as const, count: saved, optimization };
  },
});