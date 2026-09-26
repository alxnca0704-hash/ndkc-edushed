export type SchedulingRoomType = "lecture" | "lab";

export type SchedulingDayPattern = "MW" | "TTh";

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
 * - `arrangement-conflict` — the subject fits on its own, but no full
 *   arrangement of the week does.
 */
export type ConflictKind =
  | "room-occupied"
  | "teacher-unavailable"
  | "no-shared-window"
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

export type CspResult =
  | { ok: true; solution: PlacedSession[] }
  | { ok: false; reason: CspInfeasibleReason }
  | { ok: false; reasons: readonly InfeasibilityReason[] };

export interface GaOptions {
  populationSize?: number;
  maxIterations?: number;
}