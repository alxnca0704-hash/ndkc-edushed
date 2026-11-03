import { DAY_PATTERN_DAY_INDEXES } from "../../constants/dayPatterns";
import type { PlacedSession, SchedulingInput } from "./types";
import { courseYearKey } from "./types";
import { blockedByDayFor, intervalsOverlap } from "./util";

export interface ScheduleValidationResult {
  valid: boolean;
  violations: readonly string[];
}

/**
 * Which rule a violation breaks.
 *
 * The same pass is read three ways: as a boolean plus messages
 * (`validateSolution`), as a count per rule — that count is `P_H(X)`, the hard
 * term of the GA's fitness (`countHardViolations`) — and as the identity of the
 * classes involved, which is what tells a local repair which subjects it is
 * allowed to move (`collectHardViolations`).
 */
export type ViolationKind =
  | "incomplete-session-pair"
  | "missing-pattern-day"
  | "pattern-time-mismatch"
  | "pattern-room-mismatch"
  | "unknown-subject"
  | "unknown-room"
  | "room-type-mismatch"
  | "duration-mismatch"
  | "outside-working-hours"
  | "invalid-day"
  | "teacher-unavailable"
  | "teacher-double-booked"
  | "room-double-booked"
  | "course-year-overlap";

/** Every kind, in declaration order, so a zeroed count object can be built. */
export const VIOLATION_KINDS: readonly ViolationKind[] = [
  "incomplete-session-pair",
  "missing-pattern-day",
  "pattern-time-mismatch",
  "pattern-room-mismatch",
  "unknown-subject",
  "unknown-room",
  "room-type-mismatch",
  "duration-mismatch",
  "outside-working-hours",
  "invalid-day",
  "teacher-unavailable",
  "teacher-double-booked",
  "room-double-booked",
  "course-year-overlap",
];

/** One broken rule: what it is, how to say it, and whose classes it involves. */
export interface RecordedViolation {
  kind: ViolationKind;
  message: string;
  /**
   * The subjects this violation is about. A double-booking names both sides, so
   * a caller can find a whole conflict without re-deriving what overlaps what.
   */
  subjectIds: readonly string[];
}

/** `P_H(X)`, the hard-constraint half of the GA's fitness, as a count. */
export interface HardViolationCounts {
  total: number;
  byKind: Readonly<Record<ViolationKind, number>>;
}

interface DayInterval {
  startMinutes: number;
  endMinutes: number;
  subjectId: string;
}

function slotDurationOf(input: SchedulingInput): number {
  if (input.timeSlots.length === 0) {
    return 0;
  }
  const first = input.timeSlots[0];
  if (input.timeSlots.length > 1) {
    return input.timeSlots[1].startMinutes - first.startMinutes;
  }
  return first.endMinutes - first.startMinutes;
}

function dayIntervalsFor(
  map: Map<string, Map<number, DayInterval[]>>,
  key: string,
  dayIndex: number,
): DayInterval[] {
  let byDay = map.get(key);
  if (!byDay) {
    byDay = new Map();
    map.set(key, byDay);
  }
  let list = byDay.get(dayIndex);
  if (!list) {
    list = [];
    byDay.set(dayIndex, list);
  }
  return list;
}

function overlapping(
  list: readonly DayInterval[],
  startMinutes: number,
  endMinutes: number,
): DayInterval | undefined {
  return list.find((interval) =>
    intervalsOverlap(
      interval.startMinutes,
      interval.endMinutes,
      startMinutes,
      endMinutes,
    ),
  );
}

/**
 * Every hard-constraint breach in one pass, in the order they are found.
 *
 * This is the single definition of "broken" in the engine: `validateSolution`
 * reads it as a boolean, `countHardViolations` as a count, and a local repair as
 * a set of subjects. Keeping one collector is what stops the three from ever
 * disagreeing about what counts as a conflict.
 */
export function collectHardViolations(
  input: SchedulingInput,
  solution: readonly PlacedSession[],
): readonly RecordedViolation[] {
  const violations: RecordedViolation[] = [];
  const record = (
    kind: ViolationKind,
    message: string,
    subjectIds: readonly string[],
  ): void => {
    violations.push({ kind, message, subjectIds });
  };

  const subjectById = new Map(input.subjects.map((subject) => [subject.id, subject]));
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));
  const firstSlot = input.timeSlots[0];
  const lastSlot = input.timeSlots[input.timeSlots.length - 1];
  const slotDuration = slotDurationOf(input);
  const validDayIndexes = new Set(input.days.map((day) => day.index));

  const sessionsBySubject = new Map<string, PlacedSession[]>();
  for (const placement of solution) {
    const list = sessionsBySubject.get(placement.subjectId) ?? [];
    sessionsBySubject.set(placement.subjectId, list);
    list.push(placement);
  }

  for (const subject of input.subjects) {
    const sessions = sessionsBySubject.get(subject.id) ?? [];
    const patternDays =
      sessions.length > 0 && sessions[0].dayPattern
        ? DAY_PATTERN_DAY_INDEXES[sessions[0].dayPattern] ?? []
        : [];

    if (sessions.length !== 2) {
      record(
        "incomplete-session-pair",
        `"${subject.name}" was scheduled ${sessions.length} of 2 required sessions`,
        [subject.id],
      );
      continue;
    }

    for (const dayIndex of patternDays) {
      if (!sessions.some((session) => session.dayIndex === dayIndex)) {
        record(
          "missing-pattern-day",
          `"${subject.name}" has no session on pattern day ${dayIndex}`,
          [subject.id],
        );
      }
    }

    const [first, second] = [...sessions].sort(
      (a, b) => a.dayIndex - b.dayIndex,
    );
    if (
      first.startMinutes !== second.startMinutes ||
      first.endMinutes !== second.endMinutes
    ) {
      record(
        "pattern-time-mismatch",
        `"${subject.name}" sessions are at different times on its two pattern days`,
        [subject.id],
      );
    }
    if (first.roomId !== second.roomId) {
      record(
        "pattern-room-mismatch",
        `"${subject.name}" sessions use different rooms on its two pattern days`,
        [subject.id],
      );
    }
  }

  const teacherDays = new Map<string, Map<number, DayInterval[]>>();
  const roomDays = new Map<string, Map<number, DayInterval[]>>();
  const courseYearDays = new Map<string, Map<number, DayInterval[]>>();

  for (const placement of solution) {
    const subject = subjectById.get(placement.subjectId);
    if (!subject) {
      record(
        "unknown-subject",
        `placement references unknown subject "${placement.subjectId}"`,
        [placement.subjectId],
      );
      continue;
    }

    const room = roomById.get(placement.roomId);
    if (!room) {
      record(
        "unknown-room",
        `"${subject.name}" was placed in unknown room "${placement.roomId}"`,
        [subject.id],
      );
    } else if (room.type !== subject.requiredRoomType) {
      record(
        "room-type-mismatch",
        `"${subject.name}" was placed in a ${room.type} room but requires ${subject.requiredRoomType}`,
        [subject.id],
      );
    }

    if (placement.endMinutes - placement.startMinutes !== subject.durationMinutes) {
      record(
        "duration-mismatch",
        `"${subject.name}" session spans ${placement.endMinutes - placement.startMinutes} minutes, expected ${subject.durationMinutes}`,
        [subject.id],
      );
    }

    if (!firstSlot || !lastSlot) {
      record("outside-working-hours", "time grid is empty", [subject.id]);
    } else if (
      placement.startMinutes < firstSlot.startMinutes ||
      placement.endMinutes > lastSlot.endMinutes
    ) {
      record(
        "outside-working-hours",
        `"${subject.name}" session falls outside working hours`,
        [subject.id],
      );
    }

    if (!validDayIndexes.has(placement.dayIndex)) {
      record(
        "invalid-day",
        `"${subject.name}" session uses invalid day ${placement.dayIndex}`,
        [subject.id],
      );
    }

    if (slotDuration > 0) {
      const blocked = blockedByDayFor(subject.teacherId, input.availability);
      const startSlot = Math.round(
        (placement.startMinutes - (firstSlot?.startMinutes ?? 0)) / slotDuration,
      );
      const meetingSlotCount =
        subject.durationMinutes / slotDuration;
      for (let step = 0; step < meetingSlotCount; step++) {
        if (blocked.get(placement.dayIndex)?.has(startSlot + step)) {
          record(
            "teacher-unavailable",
            `"${subject.name}" is scheduled during teacher-unavailable time`,
            [subject.id],
          );
          break;
        }
      }
    }

    const teacherClash = overlapping(
      dayIntervalsFor(teacherDays, placement.teacherId, placement.dayIndex),
      placement.startMinutes,
      placement.endMinutes,
    );
    if (teacherClash) {
      record(
        "teacher-double-booked",
        `teacher "${placement.teacherId}" is double-booked on day ${placement.dayIndex}`,
        [placement.subjectId, teacherClash.subjectId],
      );
    }

    const roomClash = overlapping(
      dayIntervalsFor(roomDays, placement.roomId, placement.dayIndex),
      placement.startMinutes,
      placement.endMinutes,
    );
    if (roomClash) {
      record(
        "room-double-booked",
        `room "${placement.roomId}" is double-booked on day ${placement.dayIndex}`,
        [placement.subjectId, roomClash.subjectId],
      );
    }

    const courseYear = courseYearKey(subject);
    const courseYearClash = overlapping(
      dayIntervalsFor(courseYearDays, courseYear, placement.dayIndex),
      placement.startMinutes,
      placement.endMinutes,
    );
    if (courseYearClash) {
      record(
        "course-year-overlap",
        `"${subject.name}" overlaps another class of the same course and year (${subject.courseId}, year ${subject.year}) on day ${placement.dayIndex}`,
        [placement.subjectId, courseYearClash.subjectId],
      );
    }

    dayIntervalsFor(teacherDays, placement.teacherId, placement.dayIndex).push({
      startMinutes: placement.startMinutes,
      endMinutes: placement.endMinutes,
      subjectId: subject.id,
    });
    dayIntervalsFor(roomDays, placement.roomId, placement.dayIndex).push({
      startMinutes: placement.startMinutes,
      endMinutes: placement.endMinutes,
      subjectId: subject.id,
    });
    dayIntervalsFor(courseYearDays, courseYear, placement.dayIndex).push({
      startMinutes: placement.startMinutes,
      endMinutes: placement.endMinutes,
      subjectId: subject.id,
    });
  }

  return violations;
}

export function validateSolution(
  input: SchedulingInput,
  solution: readonly PlacedSession[],
): ScheduleValidationResult {
  const violations = collectHardViolations(input, solution);
  return {
    valid: violations.length === 0,
    violations: violations.map((violation) => violation.message),
  };
}

/**
 * `P_H(X)`: how many hard rules the schedule breaks, counted per rule.
 *
 * The same pass `validateSolution` uses, exposed as a number because the
 * blank-slate GA needs a *magnitude* to weigh against the soft score, not a
 * pass/fail — it is allowed to pass through infeasible candidates and has to
 * prefer the least-broken one.
 */
export function countHardViolations(
  input: SchedulingInput,
  solution: readonly PlacedSession[],
): HardViolationCounts {
  const violations = collectHardViolations(input, solution);
  const byKind = Object.fromEntries(
    VIOLATION_KINDS.map((kind) => [kind, 0]),
  ) as Record<ViolationKind, number>;

  for (const violation of violations) {
    byKind[violation.kind] += 1;
  }

  return { total: violations.length, byKind };
}
