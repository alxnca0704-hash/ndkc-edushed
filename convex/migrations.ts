import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

import { AVAILABILITY_TIME_SLOTS } from "../constants/availability";
import { DEFAULT_COURSES } from "../constants/courses";
import {
  DAY_PATTERN_DAY_INDEXES,
  type DayPattern,
} from "../constants/dayPatterns";

type LegacySubject = Omit<Doc<"subjects">, "courseId" | "year"> & {
  roomType?: "lecture" | "lab";
  courseId?: Id<"courses">;
  year?: 1 | 2 | 3 | 4;
};

export const backfillSubjectRoomIds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    // Subjects written back under the current schema must carry every
    // required field, so a doc that also predates Course/Year is left to
    // `backfillSubjectCourseAndYear` (run this one first).
    const legacySubjects = subjects.filter(
      (subject) =>
        !(subject as LegacySubject).roomId &&
        Boolean((subject as LegacySubject).courseId) &&
        Boolean((subject as LegacySubject).year),
    ) as LegacySubject[];

    if (legacySubjects.length === 0) {
      return { backfilled: 0 };
    }

    const rooms = await ctx.db.query("rooms").collect();
    const roomIdByType: Partial<Record<"lecture" | "lab", Id<"rooms">>> = {};
    for (const room of rooms) {
      roomIdByType[room.type] ??= room._id;
    }

    const now = Date.now();
    let backfilled = 0;

    for (const subject of legacySubjects) {
      const type = subject.roomType ?? "lecture";
      let roomId = roomIdByType[type];

      if (!roomId) {
        roomId = await ctx.db.insert("rooms", {
          name: type === "lab" ? "Legacy Lab" : "Legacy Lecture",
          type,
          createdAt: now,
          updatedAt: now,
        });
        roomIdByType[type] = roomId;
      }

      await ctx.db.replace(subject._id, {
        name: subject.name,
        durationMinutes: subject.durationMinutes,
        roomId,
        courseId: subject.courseId as Id<"courses">,
        year: subject.year as 1 | 2 | 3 | 4,
        teacherId: subject.teacherId,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      });
      backfilled += 1;
    }

    return { backfilled };
  },
});

/**
 * Day patterns moved from the Subject (Dean-chosen input) to the generated
 * Schedule (algorithm-chosen output), so existing subject docs that still
 * carry a stored `dayPattern` are rewritten without it. Idempotent: a second
 * run reports 0.
 */
export const backfillSubjectRemoveDayPattern = internalMutation({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    const legacySubjects = subjects.filter(
      (subject) =>
        Object.prototype.hasOwnProperty.call(subject, "dayPattern") &&
        Boolean((subject as LegacySubject).courseId) &&
        Boolean((subject as LegacySubject).year),
    ) as LegacySubject[];
    let cleaned = 0;

    for (const subject of legacySubjects) {
      await ctx.db.replace(subject._id, {
        name: subject.name,
        durationMinutes: subject.durationMinutes,
        roomId: subject.roomId as Id<"rooms">,
        courseId: subject.courseId as Id<"courses">,
        year: subject.year as 1 | 2 | 3 | 4,
        teacherId: subject.teacherId,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      });
      cleaned += 1;
    }

    return { cleaned };
  },
});

/**
 * `dayPattern` is now an algorithm output stored on each generated session,
 * so older schedule rows (generated before this field existed) get one
 * derived from the actual days they landed on ({0,2} → MW, {1,3} → TTh).
 * Idempotent: rows that already carry `dayPattern` are left untouched.
 */
export const backfillScheduleDayPatterns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("schedules").collect();
    const daysBySubject = new Map<string, Set<number>>();
    for (const session of sessions) {
      if (Object.prototype.hasOwnProperty.call(session, "dayPattern")) {
        continue;
      }
      let set = daysBySubject.get(session.subjectId);
      if (!set) {
        set = new Set();
        daysBySubject.set(session.subjectId, set);
      }
      set.add(session.dayIndex);
    }

    const patternBySubject = new Map<string, "MW" | "TTh">();
    for (const [subjectId, daySet] of daysBySubject) {
      const detected =
        (
          ["MW", "TTh"] as const
        ).find((pattern) => {
          const expected = DAY_PATTERN_DAY_INDEXES[pattern];
          return (
            expected.length === daySet.size &&
            expected.every((dayIndex) => daySet.has(dayIndex))
          );
        }) ?? "MW";
      patternBySubject.set(subjectId, detected);
    }

    let backfilled = 0;
    for (const session of sessions) {
      const pattern = patternBySubject.get(session.subjectId);
      if (pattern) {
        await ctx.db.patch(session._id, {
          dayPattern: pattern,
          updatedAt: Date.now(),
        });
        backfilled += 1;
      }
    }

    return { backfilled };
  },
});

const OLD_SLOT_KEY = /^(\d)-(\d+)$/;
const NEW_SLOT_KEY = /^(MW|TTh)-(\d+)$/;

function patternForDayIndex(dayIndex: number): DayPattern | null {
  for (const pattern of ["MW", "TTh"] as const) {
    if (DAY_PATTERN_DAY_INDEXES[pattern].includes(dayIndex)) {
      return pattern;
    }
  }
  return null;
}

export const backfillAvailabilityDayPairs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("availability").collect();
    let converted = 0;

    for (const doc of docs) {
      const oldKeys = doc.blockedSlots.filter((key) => OLD_SLOT_KEY.test(key));
      if (oldKeys.length === 0) {
        continue;
      }

      // Union: a time is blocked on the pair if the teacher blocked it on
      // EITHER of the two pattern days. This preserves the old per-day intent
      // (never schedule a blocked day) instead of riskily clearing a block
      // whose counterpart day was left free.
      const slotsByPattern: { MW: Set<number>; TTh: Set<number> } = {
        MW: new Set(),
        TTh: new Set(),
      };
      for (const key of oldKeys) {
        const match = OLD_SLOT_KEY.exec(key);
        if (!match) {
          continue;
        }
        const dayIndex = Number(match[1]);
        const slotIndex = Number(match[2]);
        if (
          slotIndex < 0 ||
          slotIndex >= AVAILABILITY_TIME_SLOTS.length
        ) {
          continue;
        }
        const pattern = patternForDayIndex(dayIndex);
        if (pattern) {
          slotsByPattern[pattern].add(slotIndex);
        }
      }

      const patternKeys = [
        ...[...slotsByPattern.MW].sort((a, b) => a - b).map((slot) => `MW-${slot}`),
        ...[...slotsByPattern.TTh].sort((a, b) => a - b).map((slot) => `TTh-${slot}`),
      ];
      const alreadyPatternKeys = doc.blockedSlots.filter((key) =>
        NEW_SLOT_KEY.test(key),
      );

      await ctx.db.patch(doc._id, {
        blockedSlots: [...new Set([...alreadyPatternKeys, ...patternKeys])],
        updatedAt: Date.now(),
      });
      converted += 1;
    }

    return { converted };
  },
});

/**
 * The Dean schedule is grouped by Course + Year, so every generated session
 * now snapshots the course it belongs to alongside the subject/teacher/room
 * names it already denormalizes. Rows generated before this change are
 * rewritten from their subject. Idempotent: rows that already carry
 * `courseId` are left untouched, so a second run reports 0.
 */
export const backfillScheduleCourseAndYear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("schedules").collect();
    const legacySessions = sessions.filter(
      (session) =>
        !session.courseId ||
        !session.courseCode ||
        !session.courseName ||
        !session.year,
    );

    if (legacySessions.length === 0) {
      return { backfilled: 0 };
    }

    const subjectById = new Map(
      (await ctx.db.query("subjects").collect()).map((subject) => [
        subject._id,
        subject,
      ]),
    );
    const courseById = new Map(
      (await ctx.db.query("courses").collect()).map((course) => [
        course._id,
        course,
      ]),
    );

    let backfilled = 0;
    let skipped = 0;

    for (const session of legacySessions) {
      const subject = subjectById.get(session.subjectId);

      if (!subject) {
        skipped += 1;
        continue;
      }

      const course = courseById.get(subject.courseId);

      await ctx.db.patch(session._id, {
        courseId: subject.courseId,
        courseCode: course?.code ?? "—",
        courseName: course?.name ?? "—",
        year: subject.year,
        updatedAt: Date.now(),
      });
      backfilled += 1;
    }

    return { backfilled, skipped, needsRegenerate: skipped > 0 };
  },
});

/**
 * Seeds the two prototype programs (BSCS, BSIT) so a fresh setup has courses
 * to assign subjects to. Idempotent: a course whose code already exists is
 * left alone, so a second run reports 0 seeded.
 */
export const seedCourses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let seeded = 0;

    for (const course of DEFAULT_COURSES) {
      const existing = await ctx.db
        .query("courses")
        .withIndex("by_code", (q) => q.eq("code", course.code))
        .unique();

      if (existing) {
        continue;
      }

      await ctx.db.insert("courses", {
        name: course.name,
        code: course.code,
        createdAt: now,
        updatedAt: now,
      });
      seeded += 1;
    }

    return { seeded };
  },
});

/**
 * Subjects now require a Course and a Year level. Existing subject docs were
 * created before either field existed, so each one is attached to the first
 * seeded course and year 1. Idempotent: docs that already carry both fields
 * are left untouched, so a second run reports 0.
 */
export const backfillSubjectCourseAndYear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").order("asc").collect();
    const fallbackCourse = courses[0];

    if (!fallbackCourse) {
      throw new Error("No courses exist — run migrations:seedCourses first");
    }

    const subjects = await ctx.db.query("subjects").collect();
    const legacySubjects = subjects.filter(
      (subject) =>
        !(subject as LegacySubject).courseId || !(subject as LegacySubject).year,
    ) as LegacySubject[];

    if (legacySubjects.length === 0) {
      return { backfilled: 0, courseCode: fallbackCourse.code };
    }

    const now = Date.now();
    let backfilled = 0;

    for (const subject of legacySubjects) {
      await ctx.db.replace(subject._id, {
        name: subject.name,
        durationMinutes: subject.durationMinutes,
        roomId: subject.roomId as Id<"rooms">,
        courseId: subject.courseId ?? fallbackCourse._id,
        year: subject.year ?? 1,
        teacherId: subject.teacherId,
        createdAt: subject.createdAt,
        updatedAt: now,
      });
      backfilled += 1;
    }

    return { backfilled, courseCode: fallbackCourse.code };
  },
});