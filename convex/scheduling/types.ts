export type SchedulingRoomType = "lecture" | "lab";

export type SchedulingDayPattern = "MW" | "TTh";

/** Academic year a subject belongs to. Mirrors `subjects.year` in the schema. */
export type SchedulingYear = 1 | 2 | 3 | 4;

export interface SchedulingDay {
  index: number;
  name: string;
  shortName: string;
}

export interface SchedulingTimeSlot {
  index: number;
  startMinutes: number;
  endMinutes: number;
}

export interface SchedulingRoom {
  id: string;
  name: string;
  type: SchedulingRoomType;
}

export interface SchedulingSubject {
  id: string;
  name: string;
  teacherId: string;
  /**
   * Display name, carried only so diagnostics can name the teacher. Matching
   * and constraint checks always use `teacherId` — never this string.
   */
  teacherName?: string;
  roomId: string;
  requiredRoomType: SchedulingRoomType;
  durationMinutes: number;
  /**
   * Course and year this subject belongs to. Two subjects overlap illegally
   * only when BOTH match, so a subject can share a room or a time with another
   * course, and with the same course in a different year.
   */
  courseId: string;
  year: SchedulingYear;
}

/**
 * Identity of the "class group" that must never be in two lessons at once: the
 * course plus the year. Kept as a single helper so the CSP, the validator and
 * the diagnostics can never disagree about what counts as a clash.
 */
export function courseYearKey(subject: SchedulingSubject): string {
  return `${subject.courseId}:${subject.year}`;
}

export interface BlockedPattern {
  dayPattern: SchedulingDayPattern;
  slotIndexes: readonly number[];
}

export interface SchedulingAvailability {
  teacherId: string;
  blockedByPattern: readonly BlockedPattern[];
}

export interface SchedulingInput {
  days: readonly SchedulingDay[];
  timeSlots: readonly SchedulingTimeSlot[];
  rooms: readonly SchedulingRoom[];
  subjects: readonly SchedulingSubject[];
  availability: readonly SchedulingAvailability[];
}

export interface PlacedSession {
  subjectId: string;
  teacherId: string;
  roomId: string;
  dayPattern: SchedulingDayPattern;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}

export interface FreeWindow {
  start: number;
  end: number;
}

export type InfeasibilityCause =
  | "no-shared-teacher-window"
  | "no-room-available"
  | "course-year-busy"
  | "unknown";

/**
 * What specifically blocked one day pattern, so the UI can pick an icon and
 * headline without re-deriving the cause:
 *
 * - `room-occupied` — the room already hosts another class at every start
 *   time the teacher could take.
 * - `teacher-unavailable` — the teacher's declared availability (blocked
 *   slots) leaves no window long enough on the pattern.
 * - `no-shared-window` — the teacher is free, but their own already-placed
 *   classes differ between the two days of the pair, so no start time fits
 *   both.
 * - `course-year-conflict` — every start the teacher and room could take is
 *   already held by another subject of the SAME course and year, so this class
 *   group would be in two lessons at once.
 * - `arrangement-conflict` — the subject fits on its own, but no full
 *   arrangement of the week does.
 */
export type ConflictKind =
  | "room-occupied"
  | "teacher-unavailable"
  | "no-shared-window"
  | "course-year-conflict"
  | "arrangement-conflict";

/** One already-formatted "what/where/when" pair, rendered as-is by the UI. */
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

export interface PatternInfeasibility {
  dayPattern: SchedulingDayPattern;
  day1FreeWindows: readonly FreeWindow[];
  day2FreeWindows: readonly FreeWindow[];
  cause: InfeasibilityCause;
  message: string;
  /** Structured version of the same finding, ready to render. */
  conflict: ConflictDetail;
}

export interface InfeasibilityReason {
  subjectName: string;
  durationMinutes: number;
  patterns: readonly PatternInfeasibility[];
}

export type CspInfeasibleReason =
  | { code: "no-subjects"; message: string }
  | { code: "no-rooms"; message: string }
  | { code: "invalid-duration"; message: string }
  | { code: "no-matching-room"; message: string };

/**
 * Dean's soft-constraint preferences, 0–10 each. A weight of 0 switches the
 * constraint off: it is removed from the fitness function entirely, so it can
 * neither improve nor worsen the result.
 */
export interface SoftConstraintWeights {
  /**
   * Penalize a teacher-day that stacks more than `COMFORTABLE_CLASSES_PER_DAY`
   * classes.
   */
  workloadBalance: number;
  /**
   * Penalize a teacher whose classes land on fewer than the four days a
   * day-pair week can span.
   */
  daySpread: number;
  /** Penalize idle time inside a teacher's teaching day. */
  gapMinimization: number;
}

/** The three soft constraints in UI/display order. */
export type SoftConstraintKey = keyof SoftConstraintWeights;

/** Per-constraint penalty totals, so a fitness score can be explained. */
export interface GaPenalties {
  workloadBalance: number;
  daySpread: number;
  gapMinimization: number;
}
