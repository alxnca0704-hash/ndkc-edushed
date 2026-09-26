import type { SubjectYearLevel } from "@/types/course";
import type { DayPattern } from "@/constants/dayPatterns";
import type { SubjectColorToken } from "@/constants/subjectColors";
import type { AvailabilityTimeSlot } from "@/types/availability";
import type { RoomType } from "@/types/rooms";
import type { OptimizationResult } from "@/types/scheduleSettings";

export interface ScheduleSession {
  _id: string;
  subjectId: string;
  subjectName: string;
  /**
   * The subject's palette token, snapshotted onto this row at generation time.
   * A `string` because that is what the table holds — `buildScheduleGrid`
   * normalizes it with `asSubjectColorToken`, so a row generated before colors
   * existed still paints.
   */
  subjectColor: string;
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
 * One class block placed in the schedule grid: a subject, its teacher and room,
 * and the time-block cells it covers. A 60-minute class has `span` 1; a
 * 180-minute class spans 3 consecutive rows rather than repeating itself.
 *
 * A subject's linked pair (the same class on both days of one day pattern) is a
 * single block, because the grid's column *is* the day pair — showing it once
 * per block is what keeps a Mon/Wed class from appearing twice in the MW column.
 */
export interface ScheduleGridBlock {
  key: string;
  dayPattern: DayPattern;
  /** Index of the block's day-pair column, in `DAY_PATTERN_OPTIONS` order. */
  columnIndex: number;
  /** 0-based index of the first 60-minute slot the class covers. */
  startSlot: number;
  /** How many consecutive slots the class covers, never less than 1. */
  span: number;
  /**
   * 0-based sub-column for classes that overlap in time inside the same day
   * pair. Two subjects can legitimately share a time with different teachers
   * and rooms, so without lanes one of them would render on top of the other.
   */
  lane: number;
  /** Lanes shared with the classes this one overlaps; 1 when it overlaps none. */
  lanes: number;
  subjectId: string;
  subjectName: string;
  /**
   * The subject's color, normalized to a palette token. A card's fill, ink and
   * legend swatch all read this one field, so the Dean and the Teacher cannot
   * draw the same subject in two different colors.
   */
  subjectColor: SubjectColorToken;
  teacherId: string;
  teacherName: string;
  roomName: string;
  startMinutes: number;
  endMinutes: number;
}

/**
 * One subject in the grid's week, for the legend. Derived from the blocks that
 * were actually drawn, so the legend can never name a subject the grid is not
 * showing (the Dean's view is filtered to one Course + Year; the Teacher's is
 * filtered to their own classes).
 */
export interface ScheduleGridSubject {
  id: string;
  name: string;
  color: SubjectColorToken;
  /** Classes drawn for this subject — a Mon+Wed pair is one class, not two. */
  classCount: number;
}

/** One time-block row: the slot it stands for plus the blocks beginning there. */
export interface ScheduleGridRow {
  slot: AvailabilityTimeSlot;
  /** Blocks whose first slot is this one, ordered left to right. */
  blocks: ScheduleGridBlock[];
}

/** One day-pair column. Both patterns are always present, per the grid's shape. */
export interface ScheduleGridColumn {
  dayPattern: DayPattern;
  label: string;
  /**
   * Sub-columns this day pair needs because classes in it overlap in time. Note
   * the grid renders `max(laneCount)` lanes for *every* column, so this is the
   * column's own need, not its rendered width.
   */
  laneCount: number;
}

/**
 * The CSS grid's track layout, derived from a grid's lane counts by
 * `scheduleGridTracks`.
 */
export interface ScheduleGridTracks {
  /** A `grid-template-columns` value: the time gutter, then one track per lane. */
  templateColumns: string;
  /**
   * `offsets[i]` is the 1-based index of day pair `i`'s first track. Track 1 is
   * the time gutter, so the first day pair starts at 2. A block is placed at
   * `offsets[columnIndex] + lane`, which is what keeps a second lane inside its
   * own day pair instead of landing in the next one.
   */
  offsets: readonly number[];
  /**
   * Lanes per day pair, uniform across all of them. The column header spans
   * this, not the column's own `laneCount`, which may be narrower than what is
   * actually rendered.
   */
  laneCount: number;
  /** Total tracks the template declares, gutter included. */
  trackCount: number;
}

/**
 * Everything the schedule grid renders, derived from a set of generated
 * sessions: day-pair columns, one row per school-hour time block, and the class
 * blocks that span them. Produced by `buildScheduleGrid` so both the Dean and
 * the Teacher view read a week the same way, and no component has to derive
 * placement itself.
 */
export interface ScheduleGrid {
  columns: readonly ScheduleGridColumn[];
  rows: readonly ScheduleGridRow[];
  /** Subjects present in this grid, with the color each is drawn in. */
  subjects: readonly ScheduleGridSubject[];
  subjectCount: number;
  sessionCount: number;
  /**
   * Cards actually drawn — the honest "how many classes" figure. Below
   * `sessionCount` whenever linked pairs collapsed, so a page summary must use
   * this and not count a two-day class as two.
   */
  classCount: number;
}

export type InfeasibilityCause =
  | "no-shared-teacher-window"
  | "no-room-available"
  | "course-year-busy"
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
  | "course-year-conflict"
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