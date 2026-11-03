import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
import { collectHardViolations } from "./scheduling/validate";
import { isAdmin, isDean, roleOf } from "./roles";
import { insertNotification } from "./notifications";
import { identityDisplayName, userDisplayName } from "./userNames";
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
  departmentId: v.optional(v.id("departments")),
  departmentCode: v.optional(v.string()),
  departmentName: v.optional(v.string()),
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

      if (!isDean(identity) && !isAdmin(identity)) {
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
  args: {
    sessions: v.array(sessionValidator),
    actorName: v.optional(v.string()),
  },
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

    const classCounts = new Map<string, number>();
    for (const session of args.sessions) {
      classCounts.set(
        session.teacherId,
        (classCounts.get(session.teacherId) ?? 0) + 1,
      );
    }

    for (const [teacherId, classCount] of classCounts) {
      const classes = `${classCount} ${
        classCount === 1 ? "class" : "classes"
      } this week`;
      await insertNotification(ctx, {
        recipientId: teacherId,
        kind: "schedule-generated",
        title: "Your schedule was updated",
        body: args.actorName?.trim()
          ? `${args.actorName.trim()} generated a new week — you have ${classes}.`
          : `A new week was generated for you — ${classes}.`,
        createdAt: now,
      });
    }

    return inserted;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isDean(identity) && !isAdmin(identity)) {
        return { ok: true as const, data: [] };
      }

      const sessions = await ctx.db.query("schedules").order("asc").collect();
      const teachers = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "teacher"))
        .collect();
      const teacherNames = new Map(
        teachers.map((teacher) => [teacher.clerkId, userDisplayName(teacher)]),
      );

      return {
        ok: true as const,
        data: sessions.map((session) => ({
          ...asSession(session),
          teacherName: teacherNames.get(session.teacherId) ?? "Teacher",
        })),
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

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
      const teachers = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "teacher"))
        .collect();
      const teacherNames = new Map(
        teachers.map((teacher) => [teacher.clerkId, userDisplayName(teacher)]),
      );

      return {
        ok: true as const,
        data: sessions.map((session) => ({
          ...asSession(session),
          teacherName: teacherNames.get(session.teacherId) ?? "Teacher",
        })),
      };
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
  departmentId?: string;
  departmentCode?: string;
  departmentName?: string;
  year: 1 | 2 | 3 | 4;
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

function toSessionRow(
  placement: PlacedSession,
  subjectById: ReadonlyMap<string, SubjectRow>,
  roomById: ReadonlyMap<string, RoomRow>,
) {
  const subject = subjectById.get(placement.subjectId);
  const room = roomById.get(placement.roomId);

  if (!subject) {
    throw new Error("A scheduled subject is missing from the scheduling input");
  }

  return {
    subjectId: placement.subjectId as Id<"subjects">,
    subjectName: subject.name,
    subjectColor: asSubjectColorToken(subject.color),
    courseId: subject.courseId as Id<"courses">,
    courseCode: subject.courseCode,
    courseName: subject.courseName,
    departmentId: subject.departmentId ? (subject.departmentId as Id<"departments">) : undefined,
    departmentCode: subject.departmentCode,
    departmentName: subject.departmentName,
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
    const departments = await ctx.db.query("departments").collect();
    const departmentMap = new Map(departments.map((d) => [d._id, d]));
    const teacherDocs = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "teacher"))
      .collect();
    const courseById = new Map(courseDocs.map((course) => [course._id, course]));
    const teacherNameById = new Map(
      teacherDocs.map((teacher) => [teacher.clerkId, userDisplayName(teacher)]),
    );
    const roomTypeById = new Map(rooms.map((room) => [room._id, room.type]));
    const subjects: SubjectRow[] = subjectDocs.map((subject) => {
      const course = courseById.get(subject.courseId);
      const dept = course?.departmentId ? departmentMap.get(course.departmentId) : undefined;
      return {
        _id: subject._id,
        name: subject.name,
        durationMinutes: subject.durationMinutes,
        roomId: subject.roomId,
        roomType: roomTypeById.get(subject.roomId) ?? "lecture",
        courseId: subject.courseId,
        courseCode: course?.code ?? "",
        courseName: course?.name ?? "",
        departmentId: course?.departmentId,
        departmentCode: dept?.code,
        departmentName: dept?.name,
        year: subject.year,
        teacherId: subject.teacherId,
        teacherName: teacherNameById.get(subject.teacherId) ?? "Teacher",
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

    const settingsResult: ScheduleSettingsResult = await ctx.runQuery(
      api.scheduleSettings.get,
    );
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
      { sessions, actorName: identityDisplayName(identity) },
    );

    return { ok: true as const, count: saved, optimization };
  },
});

export const listCompiled = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isAdmin(identity)) {
        return { ok: true as const, data: { sessions: [], conflicts: [], departments: [] } };
      }

      const sessions = await ctx.db.query("schedules").order("asc").collect();
      const teachers = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "teacher"))
        .collect();
      const teacherNames = new Map(
        teachers.map((teacher) => [teacher.clerkId, userDisplayName(teacher)]),
      );
      const departments = await ctx.db.query("departments").collect();
      const departmentMap = new Map(departments.map((d) => [d._id, d]));
      const courses = await ctx.db.query("courses").collect();
      const courseMap = new Map(courses.map((c) => [c._id, c]));

      const mappedSessions = sessions.map((session) => {
        const course = courseMap.get(session.courseId);
        const deptId = session.departmentId ?? course?.departmentId;
        const dept = deptId ? departmentMap.get(deptId) : undefined;
        return {
          ...asSession(session),
          departmentId: deptId,
          departmentName: session.departmentName ?? dept?.name ?? "General / Unassigned",
          departmentCode: session.departmentCode ?? dept?.code ?? "—",
          teacherName: teacherNames.get(session.teacherId) ?? session.teacherName ?? "Teacher",
        };
      });

      const rooms = await ctx.db.query("rooms").collect();
      const subjects = await ctx.db.query("subjects").collect();
      const availabilityDocs = await ctx.db.query("availability").collect();

      const availability: AvailabilityPayload[] = availabilityDocs.map((doc) => ({
        teacherId: doc.teacherId,
        blockedSlots: doc.blockedSlots,
      }));

      const roomRows: RoomRow[] = rooms.map((r) => ({ _id: r._id, name: r.name, type: r.type }));
      const subjectRows: SubjectRow[] = subjects.map((s) => {
        const c = courseMap.get(s.courseId);
        const d = c?.departmentId ? departmentMap.get(c.departmentId) : undefined;
        return {
          _id: s._id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          roomId: s.roomId,
          roomType: rooms.find((r) => r._id === s.roomId)?.type ?? "lecture",
          courseId: s.courseId,
          courseCode: c?.code ?? "",
          courseName: c?.name ?? "",
          departmentId: c?.departmentId,
          departmentCode: d?.code,
          departmentName: d?.name,
          year: s.year,
          teacherId: s.teacherId,
          teacherName: teacherNames.get(s.teacherId) ?? "Teacher",
          color: s.color,
        };
      });

      const input = buildSchedulingInput(subjectRows, roomRows, availability);
      const currentPlacements: PlacedSession[] = sessions.map((row) => ({
        subjectId: row.subjectId,
        teacherId: row.teacherId,
        roomId: row.roomId,
        dayPattern: row.dayPattern,
        dayIndex: row.dayIndex,
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
      }));

      const rawViolations = collectHardViolations(input, currentPlacements);
      const conflicts = rawViolations.map((v) => ({
        kind: v.kind,
        message: v.message,
        subjectIds: [...v.subjectIds],
      }));

      return {
        ok: true as const,
        data: {
          sessions: mappedSessions,
          conflicts,
          departments: departments.map((d) => ({
            id: d._id,
            name: d.name,
            code: d.code,
          })),
        },
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const saveRepairedSessions = internalMutation({
  args: {
    sessions: v.array(sessionValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const session of args.sessions) {
      const existing = await ctx.db
        .query("schedules")
        .filter((q) =>
          q.and(
            q.eq(q.field("subjectId"), session.subjectId),
            q.eq(q.field("dayIndex"), session.dayIndex),
          ),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...session,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("schedules", {
          ...session,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return args.sessions.length;
  },
});

export const compileAndResolveConflicts = action({
  args: {},
  handler: async (ctx): Promise<{
    ok: boolean;
    resolved: boolean;
    message: string;
    conflicts?: { kind: string; message: string; subjectIds: string[] }[];
    stats?: RepairStats;
    movedCount?: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can compile schedules and resolve conflicts");
    }

    const compiledResult = await ctx.runQuery(api.schedule.listCompiled);
    if (!compiledResult.ok) {
      return { ok: false, resolved: false, message: compiledResult.error };
    }

    const { sessions, conflicts } = compiledResult.data;
    if (sessions.length === 0) {
      return {
        ok: true,
        resolved: false,
        message: "No schedules found to compile. Department schedules must be generated first.",
      };
    }

    if (conflicts.length === 0) {
      return {
        ok: true,
        resolved: false,
        message: "Compiled schedule is already conflict-free across all departments.",
      };
    }

    const roomsResult = await ctx.runQuery(api.rooms.listAll);
    if (!roomsResult.ok) return { ok: false, resolved: false, message: roomsResult.error };

    const subjectsResult = await ctx.runQuery(api.subjects.listAll);
    if (!subjectsResult.ok) return { ok: false, resolved: false, message: subjectsResult.error };

    const availabilityResult = await ctx.runQuery(internal.schedule.listAvailability);
    if (!availabilityResult.ok) return { ok: false, resolved: false, message: availabilityResult.error };

    const input = buildSchedulingInput(
      subjectsResult.data,
      roomsResult.data,
      availabilityResult.data,
    );

    const currentPlacements: PlacedSession[] = sessions.map((row) => ({
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
      schedule: currentPlacements,
      trigger: { kind: "cross-department-conflict" },
    });

    if (!result.success) {
      return {
        ok: false,
        resolved: false,
        message: result.reason ?? "Failed to resolve conflicts with CSP",
        stats: result.stats,
      };
    }

    const subjectById = new Map(subjectsResult.data.map((s) => [s._id, s]));
    const roomById = new Map(roomsResult.data.map((r) => [r._id, r]));

    const repairedRows = result.repairedSessions.map((p) =>
      toSessionRow(p, subjectById, roomById),
    );

    await ctx.runMutation(internal.schedule.saveRepairedSessions, {
      sessions: repairedRows,
    });

    return {
      ok: true,
      resolved: true,
      movedCount: result.affectedCount,
      stats: result.stats,
      message: `CSP successfully resolved ${conflicts.length} conflict(s) across departments by repositioning ${result.affectedCount} class(es).`,
    };
  },
});

export const simulateCrossDepartmentConflict = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can simulate conflicts");
    }

    const sessions = await ctx.db.query("schedules").collect();
    if (sessions.length < 2) {
      throw new Error("Need at least 2 scheduled classes to simulate a cross-department conflict");
    }

    const sessionA = sessions[0];
    const sessionB = sessions.find((s) => s.subjectId !== sessionA.subjectId);

    if (!sessionB) {
      throw new Error("Could not find distinct subjects to conflict");
    }

    await ctx.db.patch(sessionB._id, {
      roomId: sessionA.roomId,
      roomName: sessionA.roomName,
      roomType: sessionA.roomType,
      dayPattern: sessionA.dayPattern,
      dayIndex: sessionA.dayIndex,
      startMinutes: sessionA.startMinutes,
      endMinutes: sessionA.endMinutes,
      updatedAt: Date.now(),
    });

    return {
      conflictedSubjectA: sessionA.subjectName,
      conflictedSubjectB: sessionB.subjectName,
      room: sessionA.roomName,
    };
  },
});
