import { formatClock } from "../../constants/availability";
import {
  DAY_PATTERN_DAY_INDEXES,
  DAY_PATTERNS,
} from "../../constants/dayPatterns";
import type {
  ConflictDetail,
  ConflictFact,
  FreeWindow,
  InfeasibilityReason,
  PatternInfeasibility,
  PlacedSession,
  SchedulingDayPattern,
  SchedulingInput,
  SchedulingSubject,
  SchedulingTimeSlot,
} from "./types";
import { blockedByDayFor, intervalsOverlap } from "./util";

function timeRangeText(startMinutes: number, endMinutes: number): string {
  return `${formatClock(startMinutes)}–${formatClock(endMinutes)}`;
}

function windowsListText(windows: readonly FreeWindow[]): string {
  return windows
    .map((window) => timeRangeText(window.start, window.end))
    .join(", ");
}

function teacherLabel(subject: SchedulingSubject): string {
  const name = subject.teacherName?.trim();
  return name ? name : "The assigned teacher";
}

function subjectNameFor(
  input: SchedulingInput,
  subjectId: string,
): string {
  return (
    input.subjects.find((subject) => subject.id === subjectId)?.name ??
    "another class"
  );
}

function slotDurationOf(
  timeSlots: readonly SchedulingTimeSlot[],
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

function meetingSlotCount(
  subject: SchedulingSubject,
  slotDuration: number,
): number {
  if (slotDuration <= 0) {
    return 0;
  }
  return Math.round(subject.durationMinutes / slotDuration);
}

function teacherSlotOccupied(
  timeSlots: readonly SchedulingTimeSlot[],
  blocked: ReadonlyMap<number, ReadonlySet<number>>,
  placedSessions: readonly PlacedSession[],
  teacherId: string,
  dayIndex: number,
  slotIndex: number,
): boolean {
  if (blocked.get(dayIndex)?.has(slotIndex)) {
    return true;
  }
  const slot = timeSlots[slotIndex];
  if (!slot) {
    return true;
  }
  return placedSessions.some(
    (placement) =>
      placement.teacherId === teacherId &&
      placement.dayIndex === dayIndex &&
      intervalsOverlap(
        placement.startMinutes,
        placement.endMinutes,
        slot.startMinutes,
        slot.endMinutes,
      ),
  );
}

export function freeWindowsForDay(
  input: SchedulingInput,
  subject: SchedulingSubject,
  placedSessions: readonly PlacedSession[],
  dayIndex: number,
): readonly FreeWindow[] {
  const timeSlots = input.timeSlots;
  const neededSlots = meetingSlotCount(subject, slotDurationOf(timeSlots));
  if (neededSlots <= 0 || timeSlots.length === 0) {
    return [];
  }
  const blocked = blockedByDayFor(subject.teacherId, input.availability);
  const windows: FreeWindow[] = [];
  let runStart = -1;
  for (let index = 0; index <= timeSlots.length; index++) {
    const free =
      index < timeSlots.length &&
      !teacherSlotOccupied(
        timeSlots,
        blocked,
        placedSessions,
        subject.teacherId,
        dayIndex,
        index,
      );
    if (free) {
      if (runStart < 0) {
        runStart = index;
      }
      continue;
    }
    if (runStart >= 0) {
      const runEnd = index - 1;
      if (runEnd - runStart + 1 >= neededSlots) {
        windows.push({
          start: timeSlots[runStart].startMinutes,
          end: timeSlots[runEnd].endMinutes,
        });
      }
      runStart = -1;
    }
  }
  return windows;
}

export function sharedStartTimes(
  day1Windows: readonly FreeWindow[],
  day2Windows: readonly FreeWindow[],
  timeSlots: readonly SchedulingTimeSlot[],
  durationMinutes: number,
): readonly number[] {
  const startsFor = (windows: readonly FreeWindow[]): Set<number> =>
    new Set(
      windows.flatMap((window) => {
        const starts: number[] = [];
        for (const slot of timeSlots) {
          if (
            slot.startMinutes >= window.start &&
            slot.endMinutes <= window.end &&
            slot.startMinutes + durationMinutes <= window.end
          ) {
            starts.push(slot.startMinutes);
          }
        }
        return starts;
      }),
    );
  const day1 = startsFor(day1Windows);
  const day2 = startsFor(day2Windows);
  return [...day1]
    .filter((start) => day2.has(start))
    .sort((a, b) => a - b);
}

function roomFreeAt(
  placedSessions: readonly PlacedSession[],
  roomId: string,
  dayIndex: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  return !placedSessions.some(
    (placement) =>
      placement.roomId === roomId &&
      placement.dayIndex === dayIndex &&
      intervalsOverlap(
        placement.startMinutes,
        placement.endMinutes,
        startMinutes,
        endMinutes,
      ),
  );
}

/**
 * Placed sessions that would put this subject's class group in two lessons at
 * once, i.e. another subject of the SAME course and year. Resolved through
 * `subjectById` so `PlacedSession` stays a placement record.
 */
function courseYearBlockersAt(
  input: SchedulingInput,
  subject: SchedulingSubject,
  placedSessions: readonly PlacedSession[],
  dayIndex: number,
  startMinutes: number,
  endMinutes: number,
): readonly PlacedSession[] {
  const subjectById = new Map(
    input.subjects.map((candidate) => [candidate.id, candidate]),
  );
  return placedSessions.filter((placement) => {
    if (placement.subjectId === subject.id || placement.dayIndex !== dayIndex) {
      return false;
    }
    const other = subjectById.get(placement.subjectId);
    if (!other) {
      return false;
    }
    return (
      other.courseId === subject.courseId &&
      other.year === subject.year &&
      intervalsOverlap(
        placement.startMinutes,
        placement.endMinutes,
        startMinutes,
        endMinutes,
      )
    );
  });
}

function courseYearFreeAt(
  input: SchedulingInput,
  subject: SchedulingSubject,
  placedSessions: readonly PlacedSession[],
  dayIndex: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  return (
    courseYearBlockersAt(
      input,
      subject,
      placedSessions,
      dayIndex,
      startMinutes,
      endMinutes,
    ).length === 0
  );
}

/**
 * The contiguous runs of slots the teacher has blocked on a day, clipped to
 * the school-hours grid. Availability is pattern-level, so both days of a
 * pair carry the same blocks — the caller reports one run list for the pair.
 */
function blockedWindowsForDay(
  timeSlots: readonly SchedulingTimeSlot[],
  blocked: ReadonlySet<number>,
): readonly FreeWindow[] {
  const windows: FreeWindow[] = [];
  let runStart = -1;
  for (let index = 0; index <= timeSlots.length; index++) {
    const isBlocked = index < timeSlots.length && blocked.has(index);
    if (isBlocked) {
      if (runStart < 0) {
        runStart = index;
      }
      continue;
    }
    if (runStart >= 0) {
      windows.push({
        start: timeSlots[runStart].startMinutes,
        end: timeSlots[index - 1].endMinutes,
      });
      runStart = -1;
    }
  }
  return windows;
}

interface DayBlocker {
  dayIndex: number;
  placement: PlacedSession;
}

/**
 * "Mon & Wed 7:30 AM–8:30 AM" when the same start clashes on both pattern
 * days, otherwise one entry per clashing day.
 */
function overlapsText(
  input: SchedulingInput,
  blockers: readonly DayBlocker[],
  startMinutes: number,
  endMinutes: number,
): string {
  const range = timeRangeText(startMinutes, endMinutes);
  if (blockers.length < 2) {
    const only = blockers[0];
    return only
      ? `${dayShortName(input, only.dayIndex)} ${range}`
      : "an overlapping time";
  }
  const sameSubject =
    blockers[0].placement.subjectId === blockers[1].placement.subjectId;
  const shortNames = blockers.map(
    (blocker) => dayShortName(input, blocker.dayIndex),
  );
  if (sameSubject && shortNames.length === 2) {
    return `${shortNames[0]} & ${shortNames[1]} ${range}`;
  }
  return blockers
    .map(
      (blocker) =>
        `${dayShortName(input, blocker.dayIndex)} ${timeRangeText(
          blocker.placement.startMinutes,
          blocker.placement.endMinutes,
        )}`,
    )
    .join(", ");
}

function fact(label: string, value: string): ConflictFact {
  return { label, value };
}

const MAX_OWN_CLASS_FACTS = 3;
function dayShortName(input: SchedulingInput, dayIndex: number): string {
  return (
    input.days.find((day) => day.index === dayIndex)?.shortName ??
    `Day ${dayIndex + 1}`
  );
}

function windowsText(
  windows: readonly FreeWindow[],
  dayShort: string,
  durationMinutes: number,
): string {
  if (windows.length === 0) {
    return `${dayShort} has no ${durationMinutes}-min free window`;
  }
  const list = windows
    .map((window) => `${formatClock(window.start)}–${formatClock(window.end)}`)
    .join("; ");
  return `${dayShort} free ${list}`;
}

function patternDayLabel(dayPattern: SchedulingDayPattern): string {
  return DAY_PATTERNS[dayPattern].join(" & ");
}

function sharedTeacherMessage(
  subject: SchedulingSubject,
  dayPattern: SchedulingDayPattern,
  day1Short: string,
  day2Short: string,
  day1FreeWindows: readonly FreeWindow[],
  day2FreeWindows: readonly FreeWindow[],
): string {
  return (
    `"${subject.name}" (${subject.durationMinutes} min, ${dayPattern}) ` +
    `can't fit ${day1Short} & ${day2Short}: ` +
    `${windowsText(day1FreeWindows, day1Short, subject.durationMinutes)}; ` +
    `${windowsText(day2FreeWindows, day2Short, subject.durationMinutes)}. ` +
    `No matching ${subject.durationMinutes}-min start time exists on both days.`
  );
}

function roomOccupiedMessage(
  subject: SchedulingSubject,
  dayPattern: SchedulingDayPattern,
  roomName: string,
  day1Short: string,
  day2Short: string,
  firstSharedStart: number,
): string {
  return (
    `"${subject.name}" (${subject.durationMinutes} min, ${dayPattern}) ` +
    `is free at shared times on ${day1Short} & ${day2Short} ` +
    `(e.g. ${formatClock(firstSharedStart)}), but ${roomName} is occupied at ` +
    `every shared start. Free up ${roomName} or assign a different room.`
  );
}

function arrangementConflictMessage(
  subject: SchedulingSubject,
  dayPattern: SchedulingDayPattern,
  firstAvailable: number,
): string {
  return (
    `"${subject.name}" (${subject.durationMinutes} min, ${dayPattern}) ` +
    `fits on its own at ${formatClock(firstAvailable)} on both days, but no ` +
    `full arrangement works with the other classes already placed. Try freeing ` +
    `the teacher or room at that time.`
  );
}

function courseYearMessage(
  subject: SchedulingSubject,
  dayPattern: SchedulingDayPattern,
  day1Short: string,
  day2Short: string,
  blockingSubjectName: string,
  firstSharedStart: number,
): string {
  return (
    `"${subject.name}" (${subject.durationMinutes} min, ${dayPattern}) ` +
    `is free at shared times on ${day1Short} & ${day2Short} ` +
    `(e.g. ${formatClock(firstSharedStart)}), but every one of those times is ` +
    `already taken by "${blockingSubjectName}" — a different class of the same ` +
    `course and year. This group can only be in one lesson at a time, so move ` +
    `one of them to another time.`
  );
}

/**
 * Which already-placed class occupies the room at a start time the teacher
 * could have taken, per pattern day. Picks the earliest clashing start so the
 * explanation names a concrete, reproducible slot.
 */
function roomBlockersAtFirstClash(
  subject: SchedulingSubject,
  placedSessions: readonly PlacedSession[],
  patternDays: readonly number[],
  sharedStarts: readonly number[],
): { startMinutes: number; blockers: readonly DayBlocker[] } | null {
  for (const start of sharedStarts) {
    const blockers = patternDays.flatMap((dayIndex): DayBlocker[] => {
      if (dayIndex < 0) {
        return [];
      }
      const placement = placedSessions.find(
        (candidate) =>
          candidate.roomId === subject.roomId &&
          candidate.dayIndex === dayIndex &&
          intervalsOverlap(
            candidate.startMinutes,
            candidate.endMinutes,
            start,
            start + subject.durationMinutes,
          ),
      );
      return placement ? [{ dayIndex, placement }] : [];
    });
    if (blockers.length > 0) {
      return { startMinutes: start, blockers };
    }
  }
  return null;
}

/**
 * Which already-placed class of the same course and year occupies the start
 * times the teacher and room could otherwise have taken. Picks the earliest
 * clashing start so the explanation names a concrete, reproducible slot.
 */
function courseYearBlockersAtFirstClash(
  input: SchedulingInput,
  subject: SchedulingSubject,
  placedSessions: readonly PlacedSession[],
  patternDays: readonly number[],
  sharedStarts: readonly number[],
): { startMinutes: number; blockers: readonly DayBlocker[] } | null {
  for (const start of sharedStarts) {
    const blockers = patternDays.flatMap((dayIndex): DayBlocker[] =>
      courseYearBlockersAt(
        input,
        subject,
        placedSessions,
        dayIndex,
        start,
        start + subject.durationMinutes,
      ).map((placement) => ({ dayIndex, placement })),
    );
    if (blockers.length > 0) {
      return { startMinutes: start, blockers };
    }
  }
  return null;
}

/**
 * Why the teacher has no window that fits both days of the pair: their
 * declared (pattern-level) blocks, their own already-placed classes, or both.
 */
function teacherConflict(
  input: SchedulingInput,
  subject: SchedulingSubject,
  placedSessions: readonly PlacedSession[],
  dayPattern: SchedulingDayPattern,
  dayIndex1: number,
  dayIndex2: number,
  message: string,
): ConflictDetail {
  const blocked = blockedByDayFor(subject.teacherId, input.availability);
  const unavailable = blockedWindowsForDay(
    input.timeSlots,
    blocked.get(dayIndex1) ?? new Set<number>(),
  );
  const ownClasses = placedSessions
    .filter(
      (placement) =>
        placement.teacherId === subject.teacherId &&
        (placement.dayIndex === dayIndex1 || placement.dayIndex === dayIndex2),
    )
    .map(
      (placement): ConflictFact =>
        fact(
          "Already teaching",
          `${subjectNameFor(input, placement.subjectId)} · ${dayShortName(
            input,
            placement.dayIndex,
          )} ${timeRangeText(placement.startMinutes, placement.endMinutes)}`,
        ),
    );

  // A teacher with a packed week would otherwise flood the alert with every
  // class they already hold on the pair's days.
  const shownOwnClasses = ownClasses.slice(0, MAX_OWN_CLASS_FACTS);
  if (ownClasses.length > shownOwnClasses.length) {
    const last = shownOwnClasses[shownOwnClasses.length - 1];
    shownOwnClasses[shownOwnClasses.length - 1] = {
      ...last,
      value: `${last.value} (+${ownClasses.length - shownOwnClasses.length} more)`,
    };
  }

  const teacher = teacherLabel(subject);
  const facts: ConflictFact[] = [fact("Teacher", teacher)];
  const blockedByAvailability = unavailable.length > 0;

  if (blockedByAvailability) {
    facts.push(
      fact(
        "Unavailable",
        `${patternDayLabel(dayPattern)} ${windowsListText(unavailable)}`,
      ),
    );
  }
  facts.push(...shownOwnClasses);

  return {
    kind: blockedByAvailability ? "teacher-unavailable" : "no-shared-window",
    title: blockedByAvailability
      ? `${teacher} is unavailable ${patternDayLabel(dayPattern)} ${windowsListText(
          unavailable,
        )}`
      : `${teacher} has no ${subject.durationMinutes}-min window free on both ${
          dayShortName(input, dayIndex1)
        } & ${dayShortName(input, dayIndex2)}`,
    message,
    facts,
  };
}

/**
 * Explains why a single subject's day-pair (MW or TTh — passed explicitly,
 * since the algorithm now chooses the pattern instead of the Dean) could not
 * be placed.
 *
 * The teacher's free windows on each pattern day are computed from the
 * teacher's blocked slots (declared availability, which is pattern-level —
 * a block always applies to both days of the pair) minus any other placed
 * session of the same teacher on that day, restricted to the school-hours
 * grid and to windows long enough to fit the subject's duration.
 *
 * - No start time shared across both days → `no-shared-teacher-window`.
 *   Availability alone can no longer cause this (both days of a pair always
 *   carry identical blocks), so a mismatch now only comes from placed
 *   sessions differing between the two days or a fully-blocked pattern.
 * - Shared start times exist but the subject's assigned room is occupied at
 *   every one → room-caused (`no-room-available`).
 * - Otherwise the subject fits in isolation and the failure comes from
 *   interactions between placements (`unknown`).
 *
 * Each branch also returns a `conflict` — the same finding as structured,
 * display-ready text (what/who/when) so the UI never re-derives it.
 */
export function explainPatternFailure(
  subject: SchedulingSubject,
  input: SchedulingInput,
  placedSessions: readonly PlacedSession[],
  dayPattern: SchedulingDayPattern,
): PatternInfeasibility {
  const patternDays = DAY_PATTERN_DAY_INDEXES[dayPattern];
  const dayIndex1 = patternDays[0] ?? -1;
  const dayIndex2 = patternDays[1] ?? -1;

  const day1FreeWindows = freeWindowsForDay(
    input,
    subject,
    placedSessions,
    dayIndex1,
  );
  const day2FreeWindows = freeWindowsForDay(
    input,
    subject,
    placedSessions,
    dayIndex2,
  );
  const sharedStarts = sharedStartTimes(
    day1FreeWindows,
    day2FreeWindows,
    input.timeSlots,
    subject.durationMinutes,
  );

  const day1Short = dayShortName(input, dayIndex1);
  const day2Short = dayShortName(input, dayIndex2);

  if (sharedStarts.length === 0) {
    const message = sharedTeacherMessage(
      subject,
      dayPattern,
      day1Short,
      day2Short,
      day1FreeWindows,
      day2FreeWindows,
    );
    return {
      dayPattern,
      day1FreeWindows,
      day2FreeWindows,
      cause: "no-shared-teacher-window",
      message,
      conflict: teacherConflict(
        input,
        subject,
        placedSessions,
        dayPattern,
        dayIndex1,
        dayIndex2,
        message,
      ),
    };
  }

  const room = input.rooms.find((candidate) => candidate.id === subject.roomId);
  const roomName = room?.name ?? "the assigned room";

  const firstAvailable = sharedStarts.find(
    (start) =>
      dayIndex1 >= 0 &&
      dayIndex2 >= 0 &&
      roomFreeAt(
        placedSessions,
        subject.roomId,
        dayIndex1,
        start,
        start + subject.durationMinutes,
      ) &&
      roomFreeAt(
        placedSessions,
        subject.roomId,
        dayIndex2,
        start,
        start + subject.durationMinutes,
      ),
  );

  if (firstAvailable === undefined) {
    const message = roomOccupiedMessage(
      subject,
      dayPattern,
      roomName,
      day1Short,
      day2Short,
      sharedStarts[0],
    );
    const clash = roomBlockersAtFirstClash(
      subject,
      placedSessions,
      patternDays,
      sharedStarts,
    );
    const blockingSubjectNames =
      clash === null
        ? []
        : [
            ...new Set(
              clash.blockers.map((blocker) =>
                subjectNameFor(input, blocker.placement.subjectId),
              ),
            ),
          ];

    return {
      dayPattern,
      day1FreeWindows,
      day2FreeWindows,
      cause: "no-room-available",
      message,
      conflict: {
        kind: "room-occupied",
        title: `${roomName} is already booked`,
        message,
        facts: [
          fact("Room", roomName),
          ...(blockingSubjectNames.length > 0
            ? [fact("Booked by", blockingSubjectNames.join(", "))]
            : []),
          ...(clash === null
            ? []
            : [
                fact(
                  "Overlaps",
                  overlapsText(
                    input,
                    clash.blockers,
                    clash.startMinutes,
                    clash.startMinutes + subject.durationMinutes,
                  ),
                ),
              ]),
        ],
      },
    };
  }

  const courseYearClash =
    firstAvailable !== undefined &&
    !sharedStarts.some(
      (start) =>
        dayIndex1 >= 0 &&
        dayIndex2 >= 0 &&
        courseYearFreeAt(
          input,
          subject,
          placedSessions,
          dayIndex1,
          start,
          start + subject.durationMinutes,
        ) &&
        courseYearFreeAt(
          input,
          subject,
          placedSessions,
          dayIndex2,
          start,
          start + subject.durationMinutes,
        ),
    );

  if (courseYearClash) {
    const clash = courseYearBlockersAtFirstClash(
      input,
      subject,
      placedSessions,
      patternDays,
      sharedStarts,
    );
    const blockingSubjectNames = [
      ...new Set(
        (clash?.blockers ?? []).map((blocker) =>
          subjectNameFor(input, blocker.placement.subjectId),
        ),
      ),
    ];
    const message = courseYearMessage(
      subject,
      dayPattern,
      day1Short,
      day2Short,
      blockingSubjectNames[0] ?? "another class of the same group",
      sharedStarts[0],
    );

    return {
      dayPattern,
      day1FreeWindows,
      day2FreeWindows,
      cause: "course-year-busy",
      message,
      conflict: {
        kind: "course-year-conflict",
        title: "Course & year already in a lesson",
        message,
        facts: [
          fact("Course & year", `${subject.courseId} · Year ${subject.year}`),
          ...(blockingSubjectNames.length > 0
            ? [fact("Conflicting subject", blockingSubjectNames.join(", "))]
            : []),
          ...(clash === null
            ? []
            : [
                fact(
                  "Overlaps",
                  overlapsText(
                    input,
                    clash.blockers,
                    clash.startMinutes,
                    clash.startMinutes + subject.durationMinutes,
                  ),
                ),
              ]),
        ],
      },
    };
  }

  const message = arrangementConflictMessage(
    subject,
    dayPattern,
    firstAvailable,
  );

  return {
    dayPattern,
    day1FreeWindows,
    day2FreeWindows,
    cause: "unknown",
    message,
    conflict: {
      kind: "arrangement-conflict",
      title: "No arrangement of the week fits",
      message,
      facts: [
        fact("Teacher", teacherLabel(subject)),
        fact("Room", roomName),
        fact("Free on its own at", formatClock(firstAvailable)),
      ],
    },
  };
}

/**
 * A subject is infeasible when the algorithm cannot place it on EITHER day
 * pattern. Each pattern is explained separately so the Dean can see exactly
 * what blocks MW and what blocks TTh (e.g. "MW: teacher free only 7–8 AM;
 * TTh: no room window that matches all classes").
 */
export function explainInfeasibility(
  subject: SchedulingSubject,
  input: SchedulingInput,
  placedSessions: readonly PlacedSession[],
): InfeasibilityReason {
  const patterns = (
    ["MW", "TTh"] as const
  ).map((dayPattern) =>
    explainPatternFailure(subject, input, placedSessions, dayPattern),
  );
  return {
    subjectName: subject.name,
    durationMinutes: subject.durationMinutes,
    patterns,
  };
}