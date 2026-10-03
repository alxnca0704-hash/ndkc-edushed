import {
  DAY_PATTERN_DAY_INDEXES,
  DAY_PATTERN_OPTIONS,
} from "../../constants/dayPatterns";
import type {
  CspInfeasibleReason,
  InfeasibilityReason,
  SchedulingDayPattern,
  SchedulingInput,
  SchedulingSubject,
} from "./types";
import { blockedByDayFor } from "./util";
import { explainInfeasibility } from "./cspDiagnostics";

export interface TimeOption {
  startMinutes: number;
  endMinutes: number;
}

export interface SubjectUnit {
  unitKey: string;
  subject: SchedulingSubject;
  dayPattern: SchedulingDayPattern;
  days: readonly number[];
  candidates: readonly TimeOption[];
}

export interface SubjectDomain {
  subject: SchedulingSubject;
  options: readonly SubjectUnit[];
}

function slotDurationOf(
  timeSlots: readonly SchedulingInput["timeSlots"][number][],
): number {
  if (timeSlots.length === 0) {
    return 0;
  }
  const first = timeSlots[0];
  if (timeSlots.length > 1) {
    return timeSlots[1].startMinutes - first.startMinutes;
  }
  return first.endMinutes - first.startMinutes;
}

export function validateSchedulingInput(
  input: SchedulingInput,
): CspInfeasibleReason | null {
  if (input.subjects.length === 0) {
    return {
      code: "no-subjects",
      message: "No subjects to schedule. Add subjects first.",
    };
  }
  if (input.rooms.length === 0) {
    return {
      code: "no-rooms",
      message: "No rooms available. Add rooms before generating a schedule.",
    };
  }

  const slotDuration = slotDurationOf(input.timeSlots);
  if (slotDuration <= 0) {
    return {
      code: "invalid-duration",
      message: "The time grid is misconfigured.",
    };
  }

  for (const subject of input.subjects) {
    if (
      subject.durationMinutes <= 0 ||
      subject.durationMinutes % slotDuration !== 0
    ) {
      return {
        code: "invalid-duration",
        message: `"${subject.name}" runs ${subject.durationMinutes} minutes, which doesn't fit whole ${slotDuration}-minute blocks.`,
      };
    }
  }

  return null;
}

function unitCandidatesFor(
  subject: SchedulingSubject,
  dayPattern: SchedulingDayPattern,
  input: SchedulingInput,
  slotDuration: number,
): readonly TimeOption[] {
  const patternDays = DAY_PATTERN_DAY_INDEXES[dayPattern];
  const meetingsPerSlot = subject.durationMinutes / slotDuration;
  const blocked = blockedByDayFor(subject.teacherId, input.availability);
  const candidates: TimeOption[] = [];

  for (
    let start = 0;
    start + meetingsPerSlot <= input.timeSlots.length;
    start++
  ) {
    const covered = input.timeSlots.slice(start, start + meetingsPerSlot);
    const teacherUnavailableOnAnyPatternDay = covered.some((slot) =>
      patternDays.some(
        (dayIndex) => blocked.get(dayIndex)?.has(slot.index) ?? false,
      ),
    );
    if (teacherUnavailableOnAnyPatternDay) {
      continue;
    }
    candidates.push({
      startMinutes: covered[0].startMinutes,
      endMinutes: covered[covered.length - 1].endMinutes,
    });
  }

  return candidates;
}

/**
 * Splits each subject into a domain holding one unit per day pattern (MW
 * first, then TTh). Each unit carries its own candidate start times, so a
 * subject with both patterns free has one combined domain of up to twice the
 * size a single pattern would allow and the search simply picks whichever
 * pattern+time fits first.
 *
 * A subject is only infeasible when BOTH patterns fail (no candidates at
 * all), reported as a single `InfeasibilityReason` whose `patterns` array
 * explains each pattern separately.
 */
export function expandSubjectsIntoSessions(input: SchedulingInput): {
  domains: SubjectDomain[];
  reasons: InfeasibilityReason[];
  reason: CspInfeasibleReason | null;
} {
  const slotDuration = slotDurationOf(input.timeSlots);
  const domains: SubjectDomain[] = [];
  const reasons: InfeasibilityReason[] = [];

  for (const subject of input.subjects) {
    const roomMatches = input.rooms.some(
      (room) =>
        room.id === subject.roomId && room.type === subject.requiredRoomType,
    );
    if (!roomMatches) {
      return {
        domains: [],
        reasons: [],
        reason: {
          code: "no-matching-room",
          message: `"${subject.name}" has no ${subject.requiredRoomType} room assigned. The assigned room is missing or the wrong type.`,
        },
      };
    }

    const options: SubjectUnit[] = [];
    for (const dayPattern of DAY_PATTERN_OPTIONS) {
      const candidates = unitCandidatesFor(
        subject,
        dayPattern,
        input,
        slotDuration,
      );
      if (candidates.length === 0) {
        continue;
      }
      options.push({
        unitKey: `${subject.id}-${dayPattern}`,
        subject,
        dayPattern,
        days: DAY_PATTERN_DAY_INDEXES[dayPattern],
        candidates,
      });
    }

    if (options.length === 0) {
      reasons.push(explainInfeasibility(subject, input, []));
      continue;
    }

    domains.push({ subject, options });
  }

  return { domains, reasons, reason: null };
}