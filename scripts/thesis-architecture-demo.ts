import {
  gaGenerate,
  HARD_VIOLATION_WEIGHT,
  MAX_SOFT_SCORE,
  type GaGenerateResult,
  type GaGenerateSchedule,
} from "../convex/scheduling/gaGenerate";
import { repair, type RepairTrigger } from "../convex/scheduling/repair";
import { collectHardViolations } from "../convex/scheduling/validate";
import type { PlacedSession, SchedulingInput } from "../convex/scheduling/types";
import {
  AVAILABILITY_DAYS,
  AVAILABILITY_SLOT_DURATION_MINUTES,
  AVAILABILITY_START_MINUTES,
  AVAILABILITY_TIME_SLOTS,
  formatClock,
  parseAvailabilityPatternKey,
} from "../constants/availability";
import { DAY_PATTERNS } from "../constants/dayPatterns";
import {
  PRESSURE_TEST_BLOCKED_PATTERN,
  PRESSURE_TEST_BLOCKED_SLOTS,
  PRESSURE_TEST_ROOMS,
  PRESSURE_TEST_SUBJECTS,
} from "../constants/pressureTest";
import type { ScheduleSettings } from "../types/scheduleSettings";

/**
 * The two halves of the thesis, demonstrated apart from each other.
 *
 * 1. The GA builds the *whole* timetable from a blank slate, and the Dean's soft
 *    constraints are the only thing it optimizes. Two runs with the same random
 *    seed and different weights produce different weeks — which can only be true
 *    of a search that started from nothing rather than polishing a CSP answer.
 * 2. The CSP repairs *one* class after a change, on its own, with no reference
 *    to any soft constraint: every other class comes back byte-identical, and
 *    the repair is the same under every soft-constraint setting in existence.
 *
 * This is a proposal-defense demonstration, not a benchmark: nothing here is
 * timed, averaged, or exported, and no statistic is claimed.
 */

let failures = 0;
let assertions = 0;

function check(condition: boolean, label: string, detail = ""): void {
  assertions += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function heading(text: string): void {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

/** xorshift32, so every run below is reproducible and every difference is the weights'. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

const TEACHER_ID = "user_teacher_pressure";

const LAB_ROOMS = ["IT LAB 1", "IT LAB 2", "IT LAB 3"] as const;

const ROOM_IDS: Readonly<Record<string, string>> = {
  "Lecture Hall 1": "room-lecture-1",
  "Lecture Hall 2": "room-lecture-2",
  "IT LAB 1": "room-lab-1",
  "IT LAB 2": "room-lab-2",
  "IT LAB 3": "room-lab-3",
};

const ROOM_TYPE_BY_NAME: Readonly<Record<string, "lecture" | "lab">> = {
  "Lecture Hall 1": "lecture",
  "Lecture Hall 2": "lecture",
  "IT LAB 1": "lab",
  "IT LAB 2": "lab",
  "IT LAB 3": "lab",
};

/**
 * The demo's own class, on top of the five-subject pressure scenario: a sixth,
 * seventh, and eighth class for the same teacher.
 *
 * The pressure scenario is deliberately loose — a random draw from it is usually
 * already conflict-free, which makes "the GA starts from nothing" invisible. At
 * eight classes (twelve teaching hours for one teacher over four days) a blind
 * assignment almost always overlaps something, so the search has real work to
 * do and the fitness formula is visibly what resolves it.
 */
const EXTRA_SUBJECTS = [
  { name: "NET 401", durationMinutes: 60, course: "bscs", year: 4, room: "IT LAB 1" },
  { name: "OS 201", durationMinutes: 120, course: "bsit", year: 3, room: "Lecture Hall 2" },
  { name: "SEC 302", durationMinutes: 60, course: "bsit", year: 4, room: "IT LAB 3" },
] as const;

const SUBJECT_SEEDS = [
  ...PRESSURE_TEST_SUBJECTS.map((seed, index) => ({
    id: `subject-${index + 1}`,
    name: seed.name,
    durationMinutes: seed.durationMinutes,
    courseId: `course-${seed.courseCode.toLowerCase()}`,
    year: seed.year,
    roomName: seed.roomName,
  })),
  ...EXTRA_SUBJECTS.map((seed, index) => ({
    id: `subject-${PRESSURE_TEST_SUBJECTS.length + index + 1}`,
    name: seed.name,
    durationMinutes: seed.durationMinutes,
    courseId: `course-${seed.course}`,
    year: seed.year,
    roomName: seed.room,
  })),
];

const INPUT: SchedulingInput = {
  days: AVAILABILITY_DAYS.map((day) => ({
    index: day.index,
    name: day.name,
    shortName: day.shortName,
  })),
  timeSlots: AVAILABILITY_TIME_SLOTS.map((slot) => ({
    index: slot.index,
    startMinutes: slot.startMinutes,
    endMinutes: slot.endMinutes,
  })),
  rooms: [...PRESSURE_TEST_ROOMS, ...LAB_ROOMS.map((name) => ({ name }))].map(
    (room) => ({
      id: ROOM_IDS[room.name],
      name: room.name,
      type: ROOM_TYPE_BY_NAME[room.name],
    }),
  ),
  subjects: SUBJECT_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    teacherId: TEACHER_ID,
    roomId: ROOM_IDS[seed.roomName],
    requiredRoomType: ROOM_TYPE_BY_NAME[seed.roomName],
    durationMinutes: seed.durationMinutes,
    courseId: seed.courseId,
    year: seed.year,
  })),
  availability: [
    {
      teacherId: TEACHER_ID,
      blockedByPattern: PRESSURE_TEST_BLOCKED_SLOTS.map((key) => {
        const parsed = parseAvailabilityPatternKey(key);
        if (!parsed) {
          throw new Error(`bad blocked slot key: ${key}`);
        }
        return { dayPattern: parsed.dayPattern, slotIndexes: [parsed.timeSlotIndex] };
      }),
    },
  ],
};

const SUBJECT_BY_NAME = new Map(
  INPUT.subjects.map((subject) => [subject.name, subject]),
);
const SUBJECT_NAME_BY_ID = new Map(
  INPUT.subjects.map((subject) => [subject.id, subject.name]),
);
const ROOM_NAME_BY_ID = new Map(
  INPUT.rooms.map((room) => [room.id, room.name]),
);

function sessionKey(placement: PlacedSession): string {
  return [
    placement.subjectId,
    placement.dayPattern,
    placement.dayIndex,
    placement.startMinutes,
    placement.endMinutes,
    placement.roomId,
  ].join("|");
}

function sessionsOf(
  schedule: readonly PlacedSession[],
  subjectIds: readonly string[],
): string[] {
  return schedule
    .filter((placement) => subjectIds.includes(placement.subjectId))
    .map(sessionKey)
    .sort();
}

function slotIndexOf(startMinutes: number): number {
  return Math.round(
    (startMinutes - AVAILABILITY_START_MINUTES) /
      AVAILABILITY_SLOT_DURATION_MINUTES,
  );
}

function printSchedule(schedule: readonly PlacedSession[]): void {
  const bySubject = new Map<string, PlacedSession[]>();
  for (const placement of schedule) {
    const list = bySubject.get(placement.subjectId) ?? [];
    bySubject.set(placement.subjectId, list);
    list.push(placement);
  }

  console.log(
    `  ${"subject".padEnd(10)} ${"pattern".padEnd(8)} ${"days".padEnd(9)} ${"time".padEnd(15)} room`,
  );
  for (const [subjectId, placements] of bySubject) {
    const first = placements[0];
    console.log(
      `  ${(SUBJECT_NAME_BY_ID.get(subjectId) ?? subjectId).padEnd(10)} ` +
        `${first.dayPattern.padEnd(8)} ` +
        `${DAY_PATTERNS[first.dayPattern].join("+").padEnd(9)} ` +
        `${`${formatClock(first.startMinutes)}-${formatClock(first.endMinutes)}`.padEnd(15)} ` +
        `${ROOM_NAME_BY_ID.get(first.roomId) ?? first.roomId}`,
    );
  }
}

function expectGenerated(result: GaGenerateResult, label: string): GaGenerateSchedule {
  if (!result.ok) {
    check(false, `${label} produced a schedule`, JSON.stringify(result));
    throw new Error("the fixture must be schedulable");
  }
  return result;
}

const GAPS_ONLY: ScheduleSettings = {
  workloadBalance: { enabled: false, weight: 5 },
  daySpread: { enabled: false, weight: 5 },
  gapMinimization: { enabled: true, weight: 10 },
};

const BALANCE_AND_SPREAD: ScheduleSettings = {
  workloadBalance: { enabled: true, weight: 10 },
  daySpread: { enabled: true, weight: 10 },
  gapMinimization: { enabled: false, weight: 5 },
};

function weightsOf(settings: ScheduleSettings) {
  return {
    workloadBalance: settings.workloadBalance.enabled
      ? settings.workloadBalance.weight
      : 0,
    daySpread: settings.daySpread.enabled ? settings.daySpread.weight : 0,
    gapMinimization: settings.gapMinimization.enabled
      ? settings.gapMinimization.weight
      : 0,
  };
}

/**
 * A repair under these Dean settings.
 *
 * `settings` is in scope and deliberately not forwarded: `repair` takes an
 * `input`, a `schedule`, and a `trigger`, and there is nowhere to put a weight.
 * Calling this under different settings and diffing the answers is the runtime
 * version of that claim.
 */
function repairUnderTheseSettings(
  settings: ScheduleSettings,
  input: SchedulingInput,
  schedule: readonly PlacedSession[],
  trigger: RepairTrigger,
) {
  void settings;
  return repair({ input, schedule, trigger });
}

function testBlankSlate(): GaGenerateSchedule {
  heading("1. The GA builds the whole week, and soft constraints are its alone");

  // A population of one that is never crossed over is a single random draw: no
  // CSP output, no search, just one arbitrary assignment of every class. Counting
  // how many such draws are already valid shows what the GA is actually handed
  // before its fitness function does any work.
  const DRAWS = 200;
  let alreadyValid = 0;
  for (let seed = 1; seed <= DRAWS; seed++) {
    const draw = gaGenerate(INPUT, {
      weights: weightsOf(GAPS_ONLY),
      populationSize: 1,
      maxGenerations: 1,
      random: seededRandom(seed),
    });
    if (draw.ok && draw.valid) {
      alreadyValid += 1;
    }
  }
  console.log(
    `  ${alreadyValid} of ${DRAWS} unsearched random assignments are already conflict-free`,
  );
  check(
    alreadyValid < DRAWS / 2,
    "a blank slate is not a schedule: blind random assignments are usually broken",
    `${alreadyValid}/${DRAWS} were valid by luck`,
  );

  const runA = expectGenerated(
    gaGenerate(INPUT, {
      weights: weightsOf(GAPS_ONLY),
      random: seededRandom(20260927),
    }),
    "run A",
  );
  const runB = expectGenerated(
    gaGenerate(INPUT, {
      weights: weightsOf(BALANCE_AND_SPREAD),
      random: seededRandom(20260927),
    }),
    "run B",
  );

  for (const [label, run] of [
    ["A: Minimize Gaps only         ", runA],
    ["B: Balance Workload + Spread ", runB],
  ] as const) {
    console.log(`\n  Settings ${label} weights ${JSON.stringify(run.weights)}`);
    printSchedule(run.schedule);
    console.log(
      `  S(X) = ${run.softScore.toFixed(2)} / ${MAX_SOFT_SCORE}   ` +
        `P_H(X) = ${run.hardViolations}   ` +
        `F(X) = ${run.fitness.toFixed(2)}`,
    );
    console.log(
      `  penalties: overload ${run.penalties.workloadBalance}, ` +
        `unused days ${run.penalties.daySpread}, idle hours ${run.penalties.gapMinimization}`,
    );
  }

  check(runA.valid, "run A reached a conflict-free week (P_H = 0)");
  check(runB.valid, "run B reached a conflict-free week (P_H = 0)");
  check(
    INPUT.subjects.every((subject) =>
      [runA.schedule, runB.schedule].every(
        (schedule) =>
          schedule.filter((p) => p.subjectId === subject.id).length === 2,
      ),
    ),
    `both runs placed all ${INPUT.subjects.length} classes on both days of a pattern — a whole week, not a fragment`,
  );
  check(
    [runA, runB].every(
      (run) =>
        Math.abs(
          run.fitness -
            (run.softScore - HARD_VIOLATION_WEIGHT * run.hardViolations),
        ) < 1e-9,
    ),
    "F(X) = S(X) - 1001 * P_H(X) holds for both runs",
  );
  check(
    JSON.stringify(sessionsOf(runA.schedule, subjectIds())) !==
      JSON.stringify(sessionsOf(runB.schedule, subjectIds())),
    "same seed, different weights -> a different week",
  );
  check(
    runA.softScore !== runB.softScore,
    "same seed, different weights -> a different score",
    `A=${runA.softScore.toFixed(2)} B=${runB.softScore.toFixed(2)}`,
  );
  check(
    runA.penalties.gapMinimization <= runB.penalties.gapMinimization,
    "the gap-optimizing run has no more idle hours than the other",
  );
  check(
    runB.penalties.workloadBalance + runB.penalties.daySpread <=
      runA.penalties.workloadBalance + runA.penalties.daySpread,
    "the balance/spread run has no more stacking or unused days than the other",
  );
  check(
    runA.violations.length === 0 && runB.violations.length === 0,
    "no hard violation survived either search",
  );

  return runA;
}

/**
 * The same GA on a week that cannot be scheduled at all. This is what the `1001`
 * term is for: nothing forbids the search from proposing a broken week, so the
 * objective has to make "least broken" the thing it converges on, and it has to
 * report honestly that it could not reach validity.
 */
function testInfeasibleWeek(): void {
  heading("   An impossible week: the hard term is what refuses to compromise");

  const allSlots = AVAILABILITY_TIME_SLOTS.map((slot) => slot.index);
  // Twelve teaching hours for one teacher, one usable day pair, and one of that
  // day's twelve hours already blocked. There is no arrangement.
  const impossible: SchedulingInput = {
    ...INPUT,
    availability: [
      {
        teacherId: TEACHER_ID,
        blockedByPattern: [
          { dayPattern: "MW", slotIndexes: [PRESSURE_TEST_BLOCKED_PATTERN.timeSlotIndex] },
          { dayPattern: "TTh", slotIndexes: allSlots },
        ],
      },
    ],
  };
  const run = expectGenerated(
    gaGenerate(impossible, {
      weights: weightsOf(GAPS_ONLY),
      random: seededRandom(7),
    }),
    "the impossible week",
  );

  console.log(
    `  S(X) = ${run.softScore.toFixed(2)}   P_H(X) = ${run.hardViolations}   ` +
      `F(X) = ${run.fitness.toFixed(2)}   valid = ${run.valid}`,
  );
  const brokenKinds = Object.entries(run.hardViolationCounts.byKind)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} x${count}`);
  console.log(`  broken rules: ${brokenKinds.join(", ")}`);
  for (const violation of run.violations.slice(0, 3)) {
    console.log(`    - ${violation}`);
  }

  check(!run.valid, "the GA reports the week as invalid rather than pretending");
  check(run.hardViolations > 0, "P_H(X) counts the violations it could not avoid");
  check(
    run.fitness < 0,
    "1001 * P_H outweighs any soft score, so an invalid week always scores below a perfect valid one",
    `F(X)=${run.fitness.toFixed(2)}`,
  );
  check(
    run.penalties.gapMinimization >= 0 && run.softScore <= MAX_SOFT_SCORE,
    "S(X) stays inside 0-100 whatever the search proposes",
  );
}

function subjectIds(): string[] {
  return INPUT.subjects.map((subject) => subject.id);
}

/** A class dragged onto another class's slot: the change a repair reacts to. */
function moveClassOnto(
  schedule: readonly PlacedSession[],
  movedName: string,
  targetName: string,
): PlacedSession[] {
  const moved = SUBJECT_BY_NAME.get(movedName);
  const target = SUBJECT_BY_NAME.get(targetName);
  const targetPlacement = schedule.find((p) => p.subjectId === target?.id);
  if (!moved || !targetPlacement) {
    throw new Error(`fixture must place ${movedName} and ${targetName}`);
  }
  const days = targetPlacement.dayPattern === "MW" ? [0, 2] : [1, 3];
  const pair: PlacedSession = {
    subjectId: moved.id,
    teacherId: TEACHER_ID,
    roomId: moved.roomId,
    dayPattern: targetPlacement.dayPattern,
    dayIndex: days[0],
    startMinutes: targetPlacement.startMinutes,
    endMinutes: targetPlacement.startMinutes + moved.durationMinutes,
  };
  return [
    ...schedule.filter((placement) => placement.subjectId !== moved.id),
    pair,
    { ...pair, dayIndex: days[1] },
  ];
}

function testRepair(generated: GaGenerateSchedule): void {
  heading("2. The CSP repairs one broken class — automatically, hard constraints only");

  const schedule = generated.schedule;
  const all = subjectIds();
  const movedName = "ALGO 301";
  const targetName = "DB 201";
  const movedId = SUBJECT_BY_NAME.get(movedName)?.id ?? "";

  const broken = moveClassOnto(schedule, movedName, targetName);
  const brokenViolations = collectHardViolations(INPUT, broken);
  console.log(
    `\n  A Dean edit drags ${movedName} onto ${targetName}'s slot. That broke:`,
  );
  for (const violation of brokenViolations) {
    console.log(`    - [${violation.kind}] ${violation.message}`);
  }
  check(brokenViolations.length > 0, "the edit really did break a hard constraint");
  check(
    brokenViolations.every((violation) => violation.subjectIds.includes(movedId)),
    "every breakage involves the edited class",
  );

  // Called the way the system would call it: as a reaction to the change. Nothing
  // asks the user first, and there is no Repair button in this design.
  const repaired = repairUnderTheseSettings(GAPS_ONLY, INPUT, broken, {
    kind: "class-edited",
    subjectId: movedId,
  });

  console.log(
    `\n  repair(...) -> success=${repaired.success} affectedCount=${repaired.affectedCount}`,
  );
  for (const change of repaired.changes) {
    const from = change.from[0];
    const to = change.to[0];
    console.log(
      `    ${SUBJECT_NAME_BY_ID.get(change.subjectId) ?? change.subjectId}: ` +
        `${from.dayPattern} ${formatClock(from.startMinutes)} -> ` +
        `${to.dayPattern} ${formatClock(to.startMinutes)}`,
    );
  }
  console.log("");
  printSchedule(repaired.schedule);

  check(repaired.success, "the repair found a valid arrangement");
  check(
    repaired.affectedCount >= 1,
    "the repair reports how many classes it was allowed to move",
    `affectedCount=${repaired.affectedCount}`,
  );
  check(
    repaired.remainingHardViolations === 0,
    "the repaired week has no hard-constraint violation left",
    `${repaired.remainingHardViolations} left`,
  );
  check(
    repaired.changes.some((change) => change.subjectId === movedId),
    "the edited class is among the repaired ones",
  );
  check(
    repaired.repairedSessions.length === repaired.affectedCount * 2,
    "repairedSessions holds both sessions of each class it placed",
  );

  const touched = repaired.changes.map((change) => change.subjectId);
  const untouched = all.filter((id) => !touched.includes(id));
  check(
    untouched.length === all.length - repaired.affectedCount,
    "exactly the affected classes were touched",
  );
  check(
    JSON.stringify(sessionsOf(schedule, untouched)) ===
      JSON.stringify(sessionsOf(repaired.schedule, untouched)),
    `every other class is byte-for-byte identical (${untouched.length} of ${all.length} classes)`,
  );

  heading("   ...and the repair is indifferent to the Dean's soft constraints");
  const settingsVariants: ScheduleSettings[] = [
    BALANCE_AND_SPREAD,
    GAPS_ONLY,
    { ...GAPS_ONLY, gapMinimization: { enabled: true, weight: 1 } },
  ];
  const variants = settingsVariants.map((settings) =>
    repairUnderTheseSettings(settings, INPUT, broken, {
      kind: "class-edited",
      subjectId: movedId,
    }),
  );
  check(
    variants.every(
      (result) =>
        JSON.stringify(result.schedule) === JSON.stringify(repaired.schedule) &&
        result.affectedCount === repaired.affectedCount,
    ),
    "identical repair under Minimize-Gaps-10, Balance+Spread-10, and Minimize-Gaps-1",
  );

  heading("   The other trigger: a teacher's availability changing under a class");

  // Block exactly the hours the MW classes are sitting in, so the change lands
  // on those classes and nothing else.
  const mwSlots = [
    ...new Set(
      schedule
        .filter((placement) => placement.dayPattern === "MW")
        .map((placement) => slotIndexOf(placement.startMinutes)),
    ),
  ].sort((a, b) => a - b);
  const blockedInput: SchedulingInput = {
    ...INPUT,
    availability: [
      { teacherId: TEACHER_ID, blockedByPattern: [{ dayPattern: "MW", slotIndexes: mwSlots }] },
    ],
  };
  const brokenByAvailability = collectHardViolations(blockedInput, schedule);
  console.log(
    `  ${formatClock(AVAILABILITY_START_MINUTES + mwSlots[0] * 60)} onward on MW is now unavailable:`,
  );
  for (const violation of brokenByAvailability) {
    console.log(`    - [${violation.kind}] ${violation.message}`);
  }

  const availabilityResult = repair({
    input: blockedInput,
    schedule,
    trigger: { kind: "teacher-availability-changed", teacherId: TEACHER_ID },
  });
  console.log(
    `\n  repair(...) -> success=${availabilityResult.success} affectedCount=${availabilityResult.affectedCount}`,
  );
  for (const change of availabilityResult.changes) {
    const from = change.from[0];
    const to = change.to[0];
    console.log(
      `    ${SUBJECT_NAME_BY_ID.get(change.subjectId) ?? change.subjectId}: ` +
        `${from.dayPattern} ${formatClock(from.startMinutes)} -> ` +
        `${to.dayPattern} ${formatClock(to.startMinutes)}`,
    );
  }

  check(
    availabilityResult.success,
    "a newly blocked window is repaired as automatically as an edited class",
  );
  check(
    availabilityResult.remainingHardViolations === 0,
    "the availability repair leaves a valid week",
    `${availabilityResult.remainingHardViolations} left`,
  );
  check(
    availabilityResult.affectedCount > 0 &&
      availabilityResult.affectedCount < all.length,
    "only the classes the new block actually broke were moved",
    `affectedCount=${availabilityResult.affectedCount} of ${all.length}`,
  );

  const availabilityUntouched = all.filter(
    (id) => !availabilityResult.changes.some((change) => change.subjectId === id),
  );
  check(
    JSON.stringify(sessionsOf(schedule, availabilityUntouched)) ===
      JSON.stringify(sessionsOf(availabilityResult.schedule, availabilityUntouched)),
    `the ${availabilityUntouched.length} classes the block never touched are unchanged`,
  );

  heading("   A change that breaks nothing needs no repair");
  const noop = repair({
    input: INPUT,
    schedule,
    trigger: { kind: "class-edited", subjectId: movedId },
  });
  check(
    noop.success && noop.affectedCount === 0 && noop.remainingHardViolations === 0,
    "a benign edit is a zero-class repair, not a reshuffle",
  );
}

function main(): void {
  const generated = testBlankSlate();
  testInfeasibleWeek();
  testRepair(generated);

  console.log(`\n${assertions} assertions, ${failures} failures`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
