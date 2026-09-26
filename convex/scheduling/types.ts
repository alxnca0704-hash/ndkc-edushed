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
  /**
   * How much each soft constraint counts toward fitness. All-zero means "no
   * preference" — the caller should skip `runGA` entirely in that case, because
   * every member would then have the same fitness and the search would be pure
   * wasted computation.
   */
  weights?: SoftConstraintWeights;
  /**
   * Source of randomness. Defaults to `Math.random`; a seeded generator makes a
   * run reproducible, which is what the scheduling smoke test relies on.
   */
  random?: () => number;
}

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

export interface GaResult {
  /** Always a hard-constraint-valid schedule. */
  schedule: PlacedSession[];
  /** Weighted penalty total. Lower is better; 0 is a perfect score. */
  fitness: number;
  penalties: GaPenalties;
}
