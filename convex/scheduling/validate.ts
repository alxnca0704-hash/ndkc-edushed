import { DAY_PATTERN_DAY_INDEXES } from "../../constants/dayPatterns";
import type { PlacedSession, SchedulingInput } from "./types";
import { courseYearKey } from "./types";
import { blockedByDayFor, intervalsOverlap } from "./util";

export interface ScheduleValidationResult {
  valid: boolean;
  violations: readonly string[];
}

interface DayInterval {
  startMinutes: number;
  endMinutes: number;
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

export function validateSolution(
  input: SchedulingInput,
  solution: readonly PlacedSession[],
): ScheduleValidationResult {
  const violations: string[] = [];

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
      violations.push(
        `"${subject.name}" was scheduled ${sessions.length} of 2 required sessions`,
      );
      continue;
    }

    for (const dayIndex of patternDays) {
      if (!sessions.some((session) => session.dayIndex === dayIndex)) {
        violations.push(
          `"${subject.name}" has no session on pattern day ${dayIndex}`,
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
      violations.push(
        `"${subject.name}" sessions are at different times on its two pattern days`,
      );
    }
    if (first.roomId !== second.roomId) {
      violations.push(
        `"${subject.name}" sessions use different rooms on its two pattern days`,
      );
    }
  }

  const teacherDays = new Map<string, Map<number, DayInterval[]>>();
  const roomDays = new Map<string, Map<number, DayInterval[]>>();
  const courseYearDays = new Map<string, Map<number, DayInterval[]>>();

  for (const placement of solution) {
    const subject = subjectById.get(placement.subjectId);
    if (!subject) {
      violations.push(
        `placement references unknown subject "${placement.subjectId}"`,
      );
      continue;
    }

    const room = roomById.get(placement.roomId);
    if (!room) {
      violations.push(
        `"${subject.name}" was placed in unknown room "${placement.roomId}"`,
      );
    } else if (room.type !== subject.requiredRoomType) {
      violations.push(
        `"${subject.name}" was placed in a ${room.type} room but requires ${subject.requiredRoomType}`,
      );
    }

    if (placement.endMinutes - placement.startMinutes !== subject.durationMinutes) {
      violations.push(
        `"${subject.name}" session spans ${placement.endMinutes - placement.startMinutes} minutes, expected ${subject.durationMinutes}`,
      );
    }

    if (!firstSlot || !lastSlot) {
      violations.push("time grid is empty");
    } else if (
      placement.startMinutes < firstSlot.startMinutes ||
      placement.endMinutes > lastSlot.endMinutes
    ) {
      violations.push(`"${subject.name}" session falls outside working hours`);
    }

    if (!validDayIndexes.has(placement.dayIndex)) {
      violations.push(`"${subject.name}" session uses invalid day ${placement.dayIndex}`);
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
          violations.push(
            `"${subject.name}" is scheduled during teacher-unavailable time`,
          );
          break;
        }
      }
    }

    const teacherOverlap = dayIntervalsFor(
      teacherDays,
      placement.teacherId,
      placement.dayIndex,
    ).some((interval) =>
      intervalsOverlap(
        interval.startMinutes,
        interval.endMinutes,
        placement.startMinutes,
        placement.endMinutes,
      ),
    );
    if (teacherOverlap) {
      violations.push(
        `teacher "${placement.teacherId}" is double-booked on day ${placement.dayIndex}`,
      );
    }

    const roomOverlap = dayIntervalsFor(
      roomDays,
      placement.roomId,
      placement.dayIndex,
    ).some((interval) =>
      intervalsOverlap(
        interval.startMinutes,
        interval.endMinutes,
        placement.startMinutes,
        placement.endMinutes,
      ),
    );
    if (roomOverlap) {
      violations.push(
        `room "${placement.roomId}" is double-booked on day ${placement.dayIndex}`,
      );
    }

    const courseYear = courseYearKey(subject);
    const courseYearOverlap = dayIntervalsFor(
      courseYearDays,
      courseYear,
      placement.dayIndex,
    ).some((interval) =>
      intervalsOverlap(
        interval.startMinutes,
        interval.endMinutes,
        placement.startMinutes,
        placement.endMinutes,
      ),
    );
    if (courseYearOverlap) {
      violations.push(
        `"${subject.name}" overlaps another class of the same course and year (${subject.courseId}, year ${subject.year}) on day ${placement.dayIndex}`,
      );
    }

    dayIntervalsFor(teacherDays, placement.teacherId, placement.dayIndex).push({
      startMinutes: placement.startMinutes,
      endMinutes: placement.endMinutes,
    });
    dayIntervalsFor(roomDays, placement.roomId, placement.dayIndex).push({
      startMinutes: placement.startMinutes,
      endMinutes: placement.endMinutes,
    });
    dayIntervalsFor(courseYearDays, courseYear, placement.dayIndex).push({
      startMinutes: placement.startMinutes,
      endMinutes: placement.endMinutes,
    });
  }

  return { valid: violations.length === 0, violations };
}