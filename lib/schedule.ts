import type { DayPattern } from "@/constants/dayPatterns";
import { areaPatternLabel } from "@/constants/availability";
import { DAY_PATTERN_OPTIONS } from "@/constants/dayPatterns";
import type {
  MyScheduleGroup,
  MyScheduleRow,
  ScheduleSession,
} from "@/types/schedule";

/** The three fields week order depends on, so callers can sort a subset. */
interface WeekOrdered {
  dayIndex: number;
  startMinutes: number;
  subjectName: string;
}

/**
 * Chronological order within the school week: day first, then start time, then
 * subject name so two classes at the same time keep a stable order.
 *
 * Shared by the Dean and Teacher schedule hooks so both read a generated week
 * the same way.
 */
export function byTimeOfWeek(a: WeekOrdered, b: WeekOrdered): number {
  return (
    a.dayIndex - b.dayIndex ||
    a.startMinutes - b.startMinutes ||
    a.subjectName.localeCompare(b.subjectName)
  );
}

/** A new array in week order — the Convex query result is never sorted in place. */
export function sortSessionsByWeek(
  sessions: readonly ScheduleSession[],
): ScheduleSession[] {
  return [...sessions].sort(byTimeOfWeek);
}

/**
 * A subject's two sessions are one class only when they share a time and a
 * room — that is what "linked pair" means in the scheduler.
 */
function isLinkedPair(sessions: readonly ScheduleSession[]): boolean {
  if (sessions.length !== 2) {
    return false;
  }
  const [first, second] = sessions;
  return (
    first.startMinutes === second.startMinutes &&
    first.endMinutes === second.endMinutes &&
    first.roomId === second.roomId
  );
}

function rowsForPattern(sessions: readonly ScheduleSession[]): MyScheduleRow[] {
  const bySubject = new Map<string, ScheduleSession[]>();
  for (const session of sessions) {
    const list = bySubject.get(session.subjectId) ?? [];
    bySubject.set(session.subjectId, list);
    list.push(session);
  }

  // Row order follows the order each subject's first session appeared in the
  // week-sorted list, so a group reads in the order the teacher meets its
  // classes.
  return [...bySubject.values()].map((subjectSessions) => ({
    key: subjectSessions[0]._id,
    sessions: subjectSessions,
    isLinkedPair: isLinkedPair(subjectSessions),
  }));
}

/**
 * The teacher's week grouped by the day pattern the algorithm chose, MW first.
 * A pattern the teacher has no classes for is left out entirely, and a
 * subject's linked pair becomes one row instead of two days' worth.
 */
export function groupSessionsByDayPattern(
  sessions: readonly ScheduleSession[],
): MyScheduleGroup[] {
  const byPattern = new Map<DayPattern, ScheduleSession[]>();
  for (const session of sessions) {
    const list = byPattern.get(session.dayPattern) ?? [];
    byPattern.set(session.dayPattern, list);
    list.push(session);
  }

  return DAY_PATTERN_OPTIONS.flatMap((dayPattern) => {
    const patternSessions = byPattern.get(dayPattern);
    if (!patternSessions || patternSessions.length === 0) {
      return [];
    }
    return [
      {
        dayPattern,
        label: areaPatternLabel(dayPattern),
        rows: rowsForPattern(patternSessions),
      },
    ];
  });
}
