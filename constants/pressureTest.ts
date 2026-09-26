import type { SubjectYearLevel } from "../types/course";
import type { RoomType } from "../types/rooms";
import { availabilityPatternKey } from "./availability";
import type { DayPattern } from "./dayPatterns";

// Types are imported relatively (not via `@/`) so the Convex compiler can
// consume this file, the same trick as `constants/courses.ts` and
// `constants/scheduleSettings.ts`.

/**
 * The soft-constraint pressure scenario.
 *
 * The four hand-entered subjects (CC 106, HCI 101, OS 101, SE 101) spread so
 * thinly across the week that the CSP always finds an easy, conflict-free,
 * already-optimal arrangement, which makes the Dean's soft-constraint settings
 * impossible to evaluate by eye. These five subjects concentrate a whole extra
 * day-and-a-half of teaching onto ONE already-seeded teacher so a generate has
 * to make real trade-offs.
 *
 * Applied by the idempotent internal mutations in `convex/migrations.ts`
 * (`seedPressureTestRooms`, `seedPressureTestSubjects`,
 * `seedPressureTestAvailability`) — the same "data constants + re-runnable
 * internal mutation" mechanism `constants/courses.ts` + `migrations:seedCourses`
 * already use. Run it against a deployment with `npx convex run`.
 */
export interface PressureTestRoomSeed {
  name: string;
  type: RoomType;
}

/**
 * Only the lecture supply is seeded: the deployment already has three lab
 * rooms (IT LAB 1–3), so labs have enough supply for the scenario, while
 * lectures had **zero** — without these, every subject below would be a lab and
 * the scenario could not be built as specified. The point is scheduling
 * pressure, not infeasibility, so the seed adds supply only where it is
 * genuinely missing.
 */
export const PRESSURE_TEST_ROOMS: readonly PressureTestRoomSeed[] = [
  { name: "Lecture Hall 1", type: "lecture" },
  { name: "Lecture Hall 2", type: "lecture" },
];

export interface PressureTestSubjectSeed {
  name: string;
  durationMinutes: number;
  /** Matched against `courses.code` (`DEFAULT_COURSES`). */
  courseCode: string;
  year: SubjectYearLevel;
  /** Matched against a room's name; see `PRESSURE_TEST_ROOMS`. */
  roomName: string;
  /**
   * Declared rather than read from the room so the seed can assert the room it
   * resolved to is still the right type. A Subject's category is derived from
   * its room (spec 03), so a mismatch would silently relabel the subject.
   */
  roomType: RoomType;
}

/**
 * Five subjects, all on the existing seeded teacher, totalling 8 hours of
 * teaching — enough to force gaps, uneven day-pairs, and a real choice of
 * arrangement.
 *
 * `durationMinutes` is always a whole multiple of the 60-minute availability
 * slot (`AVAILABILITY_SLOT_DURATION_MINUTES`): the CSP rejects anything else
 * outright with `invalid-duration`, and the school-day grid has no 12:00
 * boundary to hang a 90-minute block on. The nearest slot-aligned stand-ins
 * for a 90-minute lecture/lab are 120 minutes.
 */
export const PRESSURE_TEST_SUBJECTS: readonly PressureTestSubjectSeed[] = [
  { name: "PROG 101", durationMinutes: 60, courseCode: "BSCS", year: 1, roomName: "Lecture Hall 1", roomType: "lecture" },
  { name: "DB 201", durationMinutes: 120, courseCode: "BSIT", year: 2, roomName: "Lecture Hall 2", roomType: "lecture" },
  { name: "WEB 202", durationMinutes: 60, courseCode: "BSCS", year: 2, roomName: "IT LAB 2", roomType: "lab" },
  { name: "ALGO 301", durationMinutes: 120, courseCode: "BSCS", year: 3, roomName: "Lecture Hall 1", roomType: "lecture" },
  { name: "IT 101", durationMinutes: 120, courseCode: "BSIT", year: 1, roomName: "IT LAB 3", roomType: "lab" },
];

/**
 * The obstacle. Availability is pattern-level, not day-level (spec 06), so a
 * block covers one slot of a whole MW or TTh pair.
 *
 * The teacher is otherwise left open across the whole 7:30 AM – 7:30 PM school
 * day; only this one mid-day hour is taken away, so the scheduler has to route
 * around it instead of simply running out of room. TTh is deliberately left
 * completely free — that is what gives "Spread Sessions Across Days" something
 * to trade against, since moving a subject off MW is the only way to spread.
 *
 * `MW` slot 5 is 12:30 PM – 1:30 PM, the slot boundary closest to a "12:00 PM –
 * 1:00 PM" break: the grid starts at 7:30 AM and runs in whole hours, so
 * 12:00 PM is not an available start time.
 */
export const PRESSURE_TEST_BLOCKED_PATTERN: {
  dayPattern: DayPattern;
  timeSlotIndex: number;
} = {
  dayPattern: "MW",
  timeSlotIndex: 5,
};

/** The same block in the `"<MW|TTh>-<slot>"` form the `availability` table stores. */
export const PRESSURE_TEST_BLOCKED_SLOTS: readonly string[] = [
  availabilityPatternKey(
    PRESSURE_TEST_BLOCKED_PATTERN.dayPattern,
    PRESSURE_TEST_BLOCKED_PATTERN.timeSlotIndex,
  ),
];
