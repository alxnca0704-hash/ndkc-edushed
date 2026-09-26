import type { SubjectYearLevel } from "@/types/course";
import type { DayPattern } from "@/constants/dayPatterns";
import type { RoomType } from "@/types/rooms";
import type { OptimizationResult } from "@/types/scheduleSettings";

export interface ScheduleSession {
  _id: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  year: SubjectYearLevel;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  roomType: RoomType;
  dayPattern: "MW" | "TTh";
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * One Course + Year bucket of the generated schedule, e.g. "BSCS – 1st
 * Year". A group exists as soon as a subject is assigned to that course/year
 * pair, so `sessions` can legitimately be empty (nothing generated yet).
 */
export interface GroupedSchedule {
  key: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  year: SubjectYearLevel;
  label: string;
  subjectCount: number;
  sessions: ScheduleSession[];
}

/**
 * One row of a teacher's week: normally a subject's linked pair (the same
 * class on both days of its day pattern) collapsed into a single line. A pair
 * the engine would never emit (different times or rooms on the two days)
 * stays as two sessions and is rendered per session instead.
 */
export interface MyScheduleRow {
  key: string;
  sessions: readonly ScheduleSession[];
  /** True when the two sessions share a time and room, i.e. a real linked pair. */
  isLinkedPair: boolean;
}

/**
 * A teacher's sessions grouped by the day pattern the algorithm chose, e.g.
 * "MW · Mon & Wed". Only patterns the teacher actually has rows for are
 * included, in MW → TTh order.
 */
export interface MyScheduleGroup {
  dayPattern: DayPattern;
  label: string;
  rows: MyScheduleRow[];
}

export type InfeasibilityCause =
  | "no-shared-teacher-window"
  | "no-room-available"
  | "unknown";

/**
 * What specifically blocked one day pattern. Produced by the engine
 * (`convex/scheduling/cspDiagnostics.ts`) so the UI only maps a kind to an
 * icon/headline and never re-derives the cause.
 */
export type ConflictKind =
  | "room-occupied"
  | "teacher-unavailable"
  | "no-shared-window"
  | "arrangement-conflict";

/** One already-formatted "what/where/when" pair, rendered as-is. */
export interface ConflictFact {
  label: string;
  value: string;
}

export interface ConflictDetail {
  kind: ConflictKind;
  title: string;
  message: string;
  facts: readonly ConflictFact[];
}

export interface FreeWindow {
  start: number;
  end: number;
}

export interface InfeasiblePattern {
  dayPattern: "MW" | "TTh";
  day1FreeWindows: readonly FreeWindow[];
  day2FreeWindows: readonly FreeWindow[];
  cause: InfeasibilityCause;
  message: string;
  conflict: ConflictDetail;
}

export interface InfeasibleSubject {
  subjectName: string;
  durationMinutes: number;
  patterns: readonly InfeasiblePattern[];
}

export type GenerateScheduleResult =
  | {
      ok: true;
      count: number;
      /**
       * `null` when the GA was skipped because no soft constraint is enabled —
       * there is no score to show in that case, and showing a 0 would be a lie.
       */
      optimization: OptimizationResult | null;
    }
  | {
      ok: false;
      error: string;
      infeasibleSubjects?: readonly InfeasibleSubject[];
    };