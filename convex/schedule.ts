import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  AVAILABILITY_DAYS,
  AVAILABILITY_TIME_SLOTS,
  parseAvailabilityPatternKey,
} from "../constants/availability";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  SOFT_CONSTRAINT_KEYS,
} from "../constants/scheduleSettings";
import type {
  OptimizationResult,
  ScheduleSettings,
  SoftConstraintKey,
} from "../types/scheduleSettings";
import { runCSP } from "./scheduling/csp";
import { hasActiveConstraint, runGA } from "./scheduling/ga";
import { validateSolution } from "./scheduling/validate";
import { isDean, roleOf } from "./roles";
import type {
  InfeasibilityReason,
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
       * `null` when the GA was skipped (no soft constraint enabled) — the
       * schedule is then the raw CSP output and there is no score to show.
       */
      optimization: OptimizationResult | null;
    }
  | {
      ok: false;
      error: string;
      infeasibleSubjects?: readonly InfeasibilityReason[];
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

      return { ok: true as const, data: sessions };
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

      return { ok: true as const, data: sessions };
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
      };
    }),
    availability: normalizedAvailability,
  };
}

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

    const result = runCSP(input);
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

    const validation = validateSolution(input, result.solution);
    if (!validation.valid) {
      return {
        ok: false as const,
        error: `Generated schedule failed internal validation: ${validation.violations.join("; ")}`,
      };
    }

    // Soft constraints are a best-effort refinement: if the settings record
    // can't be read we generate exactly as before (no GA) rather than failing a
    // generation that is otherwise perfectly good.
    const settingsResult: ScheduleSettingsResult = await ctx.runQuery(
      api.scheduleSettings.get,
    );
    const settings = settingsResult.ok
      ? settingsResult.data
      : DEFAULT_SCHEDULE_SETTINGS;
    const weights = weightsFromSettings(settings);

    let solution = result.solution;
    let optimization: OptimizationResult | null = null;

    // With every soft constraint off there is nothing to optimize, so the GA is
    // skipped entirely rather than burning compute on an all-zero fitness.
    if (hasActiveConstraint(weights)) {
      const gaResult = runGA(input, result.solution, { weights });
      const gaValidation = validateSolution(input, gaResult.schedule);
      if (gaValidation.valid) {
        solution = gaResult.schedule;
        optimization = {
          fitness: gaResult.fitness,
          constraints: activeConstraintKeys(weights),
        };
      }
      // A validation failure here is an engine bug, not a user error: the GA's
      // operators are supposed to be validity-preserving and its best member
      // starts as the CSP's own solution. The optimization is best effort, so
      // fall back to the untouched CSP schedule and report no score rather than
      // failing a generation that is otherwise perfectly good.
    }

    const subjectById = new Map(subjectsResult.data.map((subject) => [subject._id, subject]));
    const roomById = new Map(roomsResult.data.map((room) => [room._id, room]));

    const sessions = solution.map((placement) => {
      const subject = subjectById.get(placement.subjectId);
      const room = roomById.get(placement.roomId);

      // Every placement comes from the subject rows the CSP was given, so a
      // miss means the input changed mid-run. Fail loudly instead of writing a
      // row with an empty course reference.
      if (!subject) {
        throw new Error(
          "A scheduled subject is missing from the scheduling input",
        );
      }

      return {
        subjectId: placement.subjectId as Id<"subjects">,
        subjectName: subject.name,
        courseId: subject.courseId as Id<"courses">,
        courseCode: subject.courseCode,
        courseName: subject.courseName,
        year: subject.year,
        teacherId: placement.teacherId,
        teacherName: subject.teacherName,
        roomId: placement.roomId as Id<"rooms">,
        roomName: room?.name ?? "Unknown",
        roomType: room?.type ?? "lecture",
        dayPattern: placement.dayPattern,
        dayIndex: placement.dayIndex,
        startMinutes: placement.startMinutes,
        endMinutes: placement.endMinutes,
      };
    });

    const saved: number = await ctx.runMutation(
      internal.schedule.saveGenerated,
      { sessions },
    );

    return { ok: true as const, count: saved, optimization };
  },
});