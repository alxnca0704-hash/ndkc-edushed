import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

import { AVAILABILITY_TIME_SLOTS } from "../constants/availability";
import { DEFAULT_COURSES } from "../constants/courses";
import {
  DAY_PATTERN_DAY_INDEXES,
  type DayPattern,
} from "../constants/dayPatterns";
import {
  PRESSURE_TEST_BLOCKED_SLOTS,
  PRESSURE_TEST_ROOMS,
  PRESSURE_TEST_SUBJECTS,
} from "../constants/pressureTest";
import {
  asSubjectColorToken,
  isSubjectColorToken,
  subjectColorTokenForName,
} from "../constants/subjectColors";

type LegacySubject = Omit<Doc<"subjects">, "courseId" | "year" | "color"> & {
  roomType?: "lecture" | "lab";
  courseId?: Id<"courses">;
  year?: 1 | 2 | 3 | 4;
  color?: string;
};

/**
 * The color a `db.replace` has to carry for a doc that predates colors.
 *
 * Every migration below replaces whole documents, and the table requires a
 * `color`, so a legacy doc has to be given one rather than fail validation. It
 * gets the same deterministic default a fresh create would, and a doc that
 * already has a valid token keeps it untouched.
 */
function carriedColor(subject: LegacySubject): string {
  return isSubjectColorToken(subject.color)
    ? subject.color
    : subjectColorTokenForName(subject.name);
}

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
        color: carriedColor(subject),
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
        color: carriedColor(subject),
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
        color: carriedColor(subject),
        createdAt: subject.createdAt,
        updatedAt: now,
      });
      backfilled += 1;
    }

    return { backfilled, courseCode: fallbackCourse.code };
  },
});

/**
 * Subjects now carry a palette token, so every subject saved before this change
 * is given the deterministic default a fresh create would get. Idempotent: a
 * doc that already holds a token the palette still recognizes is left untouched,
 * so a second run reports 0 and a Dean's picked colors are never overwritten.
 */
export const backfillSubjectColors = internalMutation({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    const legacySubjects = subjects.filter(
      (subject) => !isSubjectColorToken((subject as LegacySubject).color),
    ) as LegacySubject[];

    if (legacySubjects.length === 0) {
      return { backfilled: 0 };
    }

    let backfilled = 0;
    for (const subject of legacySubjects) {
      await ctx.db.patch(subject._id, {
        color: carriedColor(subject),
        updatedAt: Date.now(),
      });
      backfilled += 1;
    }

    return { backfilled };
  },
});

/**
 * Generated rows snapshot the subject's color the same way they snapshot its
 * course and year, so rows written before this field existed are backfilled from
 * their subject. Run `backfillSubjectColors` first — a row whose subject had no
 * color yet would otherwise be painted with the default instead of the subject's
 * own. Idempotent: rows that already carry `subjectColor` are left untouched.
 */
export const backfillScheduleSubjectColor = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("schedules").collect();
    const legacySessions = sessions.filter(
      (session) =>
        !isSubjectColorToken(
          (session as { subjectColor?: string }).subjectColor,
        ),
    );

    if (legacySessions.length === 0) {
      return { backfilled: 0, skipped: 0 };
    }

    const colorBySubject = new Map(
      (await ctx.db.query("subjects").collect()).map((subject) => [
        subject._id,
        asSubjectColorToken((subject as LegacySubject).color),
      ]),
    );

    let backfilled = 0;
    let skipped = 0;

    for (const session of legacySessions) {
      const color = colorBySubject.get(session.subjectId);
      if (!color) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(session._id, {
        subjectColor: color,
        updatedAt: Date.now(),
      });
      backfilled += 1;
    }

    return { backfilled, skipped, needsRegenerate: skipped > 0 };
  },
});

/*
 * Soft-constraint pressure scenario — see `constants/pressureTest.ts` for what
 * this is for and why the numbers are what they are. Three small, idempotent
 * mutations in dependency order, matching the existing "run it with
 * `npx convex run 'migrations:…'`" mechanism (`seedCourses`).
 */

interface SeedTeacher {
  /** The Clerk `userId` that `subjects.teacherId` and `availability.teacherId` store. */
  clerkId: string;
  /** Human-readable, for the mutation's result so a re-run is legible. */
  label: string;
}

function seedTeacherLabel(teacher: {
  firstName?: string;
  lastName?: string;
  email: string;
}): string {
  const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(" ").trim();
  return name || teacher.email;
}

/**
 * The pressure subjects go to an **existing** seeded teacher, never a new one —
 * a subject's `teacherId` is a Clerk `userId` (Invariant 3), so a teacher that
 * only exists in Convex would be invisible to the Dean's dropdown and to the
 * teacher's own "My Schedule" view.
 *
 * Teacher accounts reach Convex either by the teacher logging in
 * (`users:upsertUser`) or by the Dean opening the Subjects page
 * (`teachers:syncFromClerk`), so resolution reads the `users` table. With no
 * `teacherEmail` it reuses the only teacher when there is exactly one, and
 * refuses to guess otherwise.
 */
async function resolveSeedTeacher(
  ctx: MutationCtx,
  teacherEmail: string | undefined,
): Promise<SeedTeacher> {
  const teachers = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "teacher"))
    .collect();

  if (teacherEmail) {
    const wanted = teacherEmail.trim().toLowerCase();
    const match = teachers.find(
      (teacher) => teacher.email.trim().toLowerCase() === wanted,
    );

    if (!match) {
      throw new Error(
        `No teacher account with the email "${teacherEmail}" has synced into Convex yet. Log in as that teacher, or open the Dean's Subjects page (which syncs teachers from Clerk), then re-run.`,
      );
    }

    return { clerkId: match.clerkId, label: seedTeacherLabel(match) };
  }

  if (teachers.length === 1) {
    const [only] = teachers;
    return { clerkId: only.clerkId, label: seedTeacherLabel(only) };
  }

  if (teachers.length === 0) {
    throw new Error(
      "No teacher accounts have synced into Convex yet. Log in as a teacher, or open the Dean's Subjects page (which syncs teachers from Clerk), then re-run.",
    );
  }

  throw new Error(
    `Found ${teachers.length} teacher accounts, so this seed cannot guess which one to use. Re-run with {"teacherEmail": "<the teacher's email>"}.`,
  );
}

function seedKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Adds the lecture rooms the pressure subjects need. The deployment already has
 * lab rooms, so only the missing type is seeded. Idempotent: a room whose name
 * already exists is left alone (case-insensitively, so a re-run can never leave
 * a near-duplicate behind), so a second run reports 0.
 */
export const seedPressureTestRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db.query("rooms").collect();
    const existingNames = new Set(existing.map((room) => seedKey(room.name)));
    const seeded: string[] = [];

    for (const room of PRESSURE_TEST_ROOMS) {
      if (existingNames.has(seedKey(room.name))) {
        continue;
      }

      await ctx.db.insert("rooms", {
        name: room.name,
        type: room.type,
        createdAt: now,
        updatedAt: now,
      });
      existingNames.add(seedKey(room.name));
      seeded.push(room.name);
    }

    return { seeded: seeded.length, rooms: seeded };
  },
});

/**
 * Adds the five concentrated subjects to the resolved teacher. Idempotent: a
 * subject already assigned to that teacher under the same name is left alone,
 * so a second run reports 0 and the four hand-entered subjects are untouched.
 *
 * Course and room are resolved by code/name rather than stored as ids, so the
 * seed is re-runnable against a deployment whose Ids differ. A missing course
 * or room throws with the mutation to run first, instead of writing a subject
 * that cannot be scheduled.
 */
export const seedPressureTestSubjects = internalMutation({
  args: { teacherEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const teacher = await resolveSeedTeacher(ctx, args.teacherEmail);

    const courses = await ctx.db.query("courses").collect();
    const courseByCode = new Map(
      courses.map((course) => [seedKey(course.code), course]),
    );
    const rooms = await ctx.db.query("rooms").collect();
    const roomByName = new Map(rooms.map((room) => [seedKey(room.name), room]));
    const existingSubjects = await ctx.db.query("subjects").collect();
    const existingNames = new Set(
      existingSubjects
        .filter((subject) => subject.teacherId === teacher.clerkId)
        .map((subject) => seedKey(subject.name)),
    );

    const now = Date.now();
    const seeded: string[] = [];
    let skipped = 0;

    for (const seed of PRESSURE_TEST_SUBJECTS) {
      if (existingNames.has(seedKey(seed.name))) {
        skipped += 1;
        continue;
      }

      const course = courseByCode.get(seedKey(seed.courseCode));
      if (!course) {
        throw new Error(
          `Seed references course "${seed.courseCode}", which does not exist. Run migrations:seedCourses first.`,
        );
      }

      const room = roomByName.get(seedKey(seed.roomName));
      if (!room) {
        throw new Error(
          `Seed references room "${seed.roomName}", which does not exist. Run migrations:seedPressureTestRooms first.`,
        );
      }

      // A Subject's category is derived from its room (spec 03), so a
      // type mismatch would silently relabel it.
      if (room.type !== seed.roomType) {
        throw new Error(
          `Seed expects room "${seed.roomName}" to be a ${seed.roomType} room, but it is registered as a ${room.type} room.`,
        );
      }

      await ctx.db.insert("subjects", {
        name: seed.name,
        durationMinutes: seed.durationMinutes,
        roomId: room._id,
        courseId: course._id,
        year: seed.year,
        teacherId: teacher.clerkId,
        // Same default a Dean-created subject gets, so the scenario's timetable
        // is as readable as a hand-built one.
        color: subjectColorTokenForName(seed.name),
        createdAt: now,
        updatedAt: now,
      });
      existingNames.add(seedKey(seed.name));
      seeded.push(seed.name);
    }

    return {
      seeded: seeded.length,
      skipped,
      teacher: teacher.label,
      teacherId: teacher.clerkId,
      subjects: seeded,
    };
  },
});

/**
 * Blocks the mid-day hour the scenario needs the scheduler to route around.
 * Idempotent, and **additive only** — it never clears a block the teacher
 * already set, so re-running it cannot quietly erase real availability. A
 * second run reports `updated: false`.
 */
export const seedPressureTestAvailability = internalMutation({
  args: { teacherEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const teacher = await resolveSeedTeacher(ctx, args.teacherEmail);
    const doc = await ctx.db
      .query("availability")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacher.clerkId))
      .unique();
    const current = doc?.blockedSlots ?? [];
    const added = PRESSURE_TEST_BLOCKED_SLOTS.filter(
      (slot) => !current.includes(slot),
    );

    if (added.length === 0) {
      return { updated: false, teacher: teacher.label, blockedSlots: current };
    }

    const blockedSlots = [...current, ...added];
    const now = Date.now();

    if (doc) {
      await ctx.db.patch(doc._id, { blockedSlots, updatedAt: now });
    } else {
      await ctx.db.insert("availability", {
        teacherId: teacher.clerkId,
        blockedSlots,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { updated: true, teacher: teacher.label, added, blockedSlots };
  },
});
