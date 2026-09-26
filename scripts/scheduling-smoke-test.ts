import { runCSP } from "../convex/scheduling/csp";
import {
  explainPatternFailure,
  freeWindowsForDay,
} from "../convex/scheduling/cspDiagnostics";
import { measurePenalties, runGA } from "../convex/scheduling/ga";
import { validateSolution } from "../convex/scheduling/validate";
import type {
  PatternInfeasibility,
  PlacedSession,
  SchedulingAvailability,
  SchedulingDay,
  SchedulingInput,
  SchedulingRoom,
  SchedulingSubject,
  SchedulingTimeSlot,
  SoftConstraintWeights,
} from "../convex/scheduling/types";
import { DAY_PATTERN_DAY_INDEXES } from "../constants/dayPatterns";
import {
  AVAILABILITY_DAYS,
  AVAILABILITY_SLOT_DURATION_MINUTES,
  AVAILABILITY_TIME_SLOTS,
} from "../constants/availability";
import {
  PRESSURE_TEST_BLOCKED_PATTERN,
  PRESSURE_TEST_BLOCKED_SLOTS,
  PRESSURE_TEST_ROOMS,
  PRESSURE_TEST_SUBJECTS,
} from "../constants/pressureTest";

const DAYS: SchedulingDay[] = AVAILABILITY_DAYS.map((day) => ({
  index: day.index,
  name: day.name,
  shortName: day.shortName,
}));

const TIME_SLOTS: SchedulingTimeSlot[] = AVAILABILITY_TIME_SLOTS.map((slot) => ({
  index: slot.index,
  startMinutes: slot.startMinutes,
  endMinutes: slot.endMinutes,
}));

const ROOMS: SchedulingRoom[] = [
  { id: "room-lecture-1", name: "Lecture Hall 1", type: "lecture" },
  { id: "room-lecture-2", name: "Lecture Hall 2", type: "lecture" },
  { id: "room-lab-1", name: "Physics Lab", type: "lab" },
];

const SUBJECTS: SchedulingSubject[] = [
  {
    id: "s1",
    name: "Math 101",
    teacherId: "t1",
    roomId: "room-lecture-1",
    requiredRoomType: "lecture",
    durationMinutes: 60,
    courseId: "c-math",
    year: 1,
  },
  {
    id: "s2",
    name: "English 101",
    teacherId: "t2",
    roomId: "room-lecture-2",
    requiredRoomType: "lecture",
    durationMinutes: 60,
    courseId: "c-english",
    year: 1,
  },
  {
    id: "s3",
    name: "Physics Lab",
    teacherId: "t1",
    roomId: "room-lab-1",
    requiredRoomType: "lab",
    durationMinutes: 60,
    courseId: "c-physics",
    year: 2,
  },
];

const AVAILABILITY: SchedulingAvailability[] = [
  {
    teacherId: "t1",
    blockedByPattern: [{ dayPattern: "MW", slotIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8] }],
  },
  {
    teacherId: "t2",
    blockedByPattern: [{ dayPattern: "TTh", slotIndexes: [0] }],
  },
];

function buildInput(
  subjects = SUBJECTS,
  rooms = ROOMS,
  availability = AVAILABILITY,
): SchedulingInput {
  return { days: DAYS, timeSlots: TIME_SLOTS, rooms, subjects, availability };
}

function sessionsBySubject(
  solution: readonly PlacedSession[],
): Map<string, PlacedSession[]> {
  const bySubject = new Map<string, PlacedSession[]>();
  for (const placement of solution) {
    const list = bySubject.get(placement.subjectId) ?? [];
    bySubject.set(placement.subjectId, list);
    list.push(placement);
  }
  return bySubject;
}

function patternDaysForSubject(
  solution: readonly PlacedSession[],
  subjectId: string,
): number[] {
  const pattern = sessionsBySubject(solution).get(subjectId)?.[0]?.dayPattern;
  return pattern ? [...DAY_PATTERN_DAY_INDEXES[pattern]] : [];
}

function assertPatternPair(
  solution: readonly PlacedSession[],
  subject: SchedulingSubject,
  expectedDays: readonly number[],
): boolean {
  const sessions = sessionsBySubject(solution).get(subject.id) ?? [];
  if (sessions.length !== 2) {
    return false;
  }
  const actualDays = sessions.map((session) => session.dayIndex).sort((a, b) => a - b);
  const sameDays =
    actualDays.length === expectedDays.length &&
    actualDays.every((day, index) => day === expectedDays[index]);
  const [first, second] = [...sessions].sort((a, b) => a.dayIndex - b.dayIndex);
  const sameTime =
    first.startMinutes === second.startMinutes &&
    first.endMinutes === second.endMinutes;
  return sameDays && sameTime && first.roomId === second.roomId;
}

let failures = 0;
let assertions = 0;
function check(condition: boolean, label: string): void {
  assertions += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

const NO_PREFERENCES: SoftConstraintWeights = {
  workloadBalance: 0,
  daySpread: 0,
  gapMinimization: 0,
};

/** xorshift32, so a GA run is reproducible instead of at the mercy of the host. */
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

function placementKey(placement: PlacedSession): string {
  const { subjectId, dayIndex, dayPattern, startMinutes, endMinutes, roomId } =
    placement;
  return [
    subjectId,
    dayPattern,
    dayIndex,
    startMinutes,
    endMinutes,
    roomId,
  ].join("|");
}

function samePlacements(
  left: readonly PlacedSession[],
  right: readonly PlacedSession[],
): boolean {
  const a = left.map(placementKey).sort();
  const b = right.map(placementKey).sort();
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function weightedScore(
  solution: readonly PlacedSession[],
  weights: SoftConstraintWeights,
): number {
  const penalties = measurePenalties(solution);
  return (
    penalties.workloadBalance * weights.workloadBalance +
    penalties.daySpread * weights.daySpread +
    penalties.gapMinimization * weights.gapMinimization
  );
}

function allBlockedAvailability(teachers: readonly string[]): SchedulingAvailability[] {
  const allSlots = AVAILABILITY_TIME_SLOTS.map((slot) => slot.index);
  return teachers.map((teacherId) => ({
    teacherId,
    blockedByPattern: [
      { dayPattern: "MW", slotIndexes: allSlots },
      { dayPattern: "TTh", slotIndexes: allSlots },
    ],
  }));
}

function hasPatternCause(
  result: ReturnType<typeof runCSP>,
  predicate: (pattern: PatternInfeasibility) => boolean,
): boolean {
  return (
    !result.ok &&
    "reasons" in result &&
    result.reasons.length > 0 &&
    result.reasons.some((reason) => reason.patterns.some(predicate))
  );
}

function main() {
  console.log("CSP: feasible case");
  const feasible = buildInput();
  const cspResult = runCSP(feasible);
  check(cspResult.ok, "runCSP returns ok for the feasible input");
  if (!cspResult.ok) {
    if ("reasons" in cspResult) {
      cspResult.reasons.forEach((reason) =>
        reason.patterns.forEach((pattern) => console.error(`  - ${pattern.message}`)),
      );
    } else {
      console.error(`  reason: ${cspResult.reason.message}`);
    }
  } else {
    const expectedSessions = SUBJECTS.length * 2;
    check(
      cspResult.solution.length === expectedSessions,
      `CSP places exactly ${expectedSessions} sessions (2 per subject)`,
    );
    const validation = validateSolution(feasible, cspResult.solution);
    check(validation.valid, "CSP solution has zero hard-constraint violations");
    if (!validation.valid) {
      validation.violations.forEach((violation) => console.error(`  - ${violation}`));
    }

    console.log("CSP: algorithm picks the pattern, MW-first by default");
    for (const subject of SUBJECTS) {
      const sessions = sessionsBySubject(cspResult.solution).get(subject.id) ?? [];
      check(
        sessions.every((session) => session.dayPattern === "MW"),
        `"${subject.name}" is placed on MW (algorithm default, not Dean-chosen)`,
      );
      check(
        assertPatternPair(cspResult.solution, subject, [0, 2]),
        `"${subject.name}" lands on days 0,2 at the same time in the same room`,
      );
    }
  }

  console.log("CSP: blocked on either day forces the pair to a free slot");
  if (cspResult.ok) {
    const mathSessions = sessionsBySubject(cspResult.solution).get("s1") ?? [];
    const anyAtFreeSlot = mathSessions.every(
      (session) => session.startMinutes === 990 && session.endMinutes === 1050,
    );
    check(
      anyAtFreeSlot,
      "Math 101 uses 4:30 PM (slot 9) on both days because MW slots 0-8 are blocked for t1",
    );
  }

  // One teacher, three subjects, three rooms and no blocks: the CSP keeps the
  // MW preference and lands all three on Monday and Wednesday, so both the
  // day-spread and the workload penalty are non-zero before the GA runs.
  const stackRooms: SchedulingRoom[] = [
    { id: "stack-room-1", name: "Stack Hall 1", type: "lecture" },
    { id: "stack-room-2", name: "Stack Hall 2", type: "lecture" },
    { id: "stack-room-3", name: "Stack Hall 3", type: "lecture" },
  ];
  const stackSubjects: SchedulingSubject[] = [
    {
      id: "stack-1",
      name: "Stack 101",
      teacherId: "t-stack",
      roomId: "stack-room-1",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-stack-1",
      year: 1,
    },
    {
      id: "stack-2",
      name: "Stack 102",
      teacherId: "t-stack",
      roomId: "stack-room-2",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-stack-2",
      year: 1,
    },
    {
      id: "stack-3",
      name: "Stack 103",
      teacherId: "t-stack",
      roomId: "stack-room-3",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-stack-3",
      year: 1,
    },
  ];
  const stackInput = buildInput(stackSubjects, stackRooms, []);
  const stackResult = runCSP(stackInput);

  // Hand-built so the gap is exactly known: t-gap teaches 7:30 and 11:30 on both
  // MW days, and t-other's 3-hour class holds the only other room from 8:30 to
  // 11:30, which is what forces the late one out.
  const gapRooms: SchedulingRoom[] = [
    { id: "gap-room-1", name: "Gap Hall 1", type: "lecture" },
    { id: "gap-room-2", name: "Gap Hall 2", type: "lecture" },
  ];
  const gapSubjects: SchedulingSubject[] = [
    {
      id: "gap-a",
      name: "Gap A",
      teacherId: "t-gap",
      roomId: "gap-room-1",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-gap-a",
      year: 1,
    },
    {
      id: "gap-b",
      name: "Gap B",
      teacherId: "t-gap",
      roomId: "gap-room-2",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-gap-b",
      year: 1,
    },
    {
      id: "gap-c",
      name: "Gap C",
      teacherId: "t-other",
      roomId: "gap-room-2",
      requiredRoomType: "lecture",
      durationMinutes: 180,
      courseId: "c-gap-c",
      year: 1,
    },
  ];
  const gapInput = buildInput(gapSubjects, gapRooms, []);
  const gapSeed: PlacedSession[] = [0, 2].flatMap((dayIndex) => [
    {
      subjectId: "gap-a",
      teacherId: "t-gap",
      roomId: "gap-room-1",
      dayPattern: "MW" as const,
      dayIndex,
      startMinutes: 450,
      endMinutes: 510,
    },
    {
      subjectId: "gap-c",
      teacherId: "t-other",
      roomId: "gap-room-2",
      dayPattern: "MW" as const,
      dayIndex,
      startMinutes: 510,
      endMinutes: 690,
    },
    {
      subjectId: "gap-b",
      teacherId: "t-gap",
      roomId: "gap-room-2",
      dayPattern: "MW" as const,
      dayIndex,
      startMinutes: 690,
      endMinutes: 750,
    },
  ]);

  console.log("GA: seed from CSP must stay valid");
  if (cspResult.ok) {
    const gaResult = runGA(feasible, cspResult.solution, {
      weights: NO_PREFERENCES,
      random: seededRandom(1),
    });
    const gaValidation = validateSolution(feasible, gaResult.schedule);
    check(
      gaValidation.valid,
      "GA output has zero hard-constraint violations",
    );
    if (!gaValidation.valid) {
      gaValidation.violations.forEach((violation) => console.error(`  - ${violation}`));
    }
    check(gaResult.schedule.length > 0, "GA returns a non-empty schedule");
    check(
      SUBJECTS.every((subject) =>
        assertPatternPair(
          gaResult.schedule,
          subject,
          patternDaysForSubject(gaResult.schedule, subject.id),
        ),
      ),
      "GA keeps every subject's day-pair intact (same time, same room)",
    );
    check(
      gaResult.fitness === 0,
      "all weights off means every candidate scores 0, so the CSP seed is returned untouched",
    );
    check(
      samePlacements(gaResult.schedule, cspResult.solution),
      "all weights off returns the CSP schedule exactly (no GA work spent)",
    );
  }

  console.log("GA: weights decide what gets optimized, and the score is explained");
  if (cspResult.ok) {
    const gapWeights = { ...NO_PREFERENCES, gapMinimization: 5 };
    const gapResult = runGA(feasible, cspResult.solution, {
      weights: gapWeights,
      random: seededRandom(7),
    });
    check(
      validateSolution(feasible, gapResult.schedule).valid,
      "a gap-only optimization still passes every hard constraint",
    );
    check(
      gapResult.fitness === 5 * gapResult.penalties.gapMinimization,
      "gap-only fitness is exactly weight x gap penalty",
    );
    check(
      gapResult.fitness <= weightedScore(cspResult.solution, gapWeights),
      "the GA never returns a worse weighted score than the CSP seed it started from",
    );
    check(
      SUBJECTS.every((subject) =>
        assertPatternPair(
          gapResult.schedule,
          subject,
          patternDaysForSubject(gapResult.schedule, subject.id),
        ),
      ),
      "an optimized schedule keeps every subject's day-pair intact",
    );
  }

  console.log("GA: the pattern gene lets a teacher use the whole week");
  if (stackResult.ok) {
    const seedPenalties = measurePenalties(stackResult.solution);
    check(
      seedPenalties.daySpread > 0 && seedPenalties.workloadBalance > 0,
      "the CSP stacks one teacher onto MW only, costing both spread and workload points",
    );
    const spreadWeights = {
      workloadBalance: 10,
      daySpread: 10,
      gapMinimization: 0,
    };
    const spreadGA = runGA(stackInput, stackResult.solution, {
      weights: spreadWeights,
      random: seededRandom(42),
    });
    check(
      validateSolution(stackInput, spreadGA.schedule).valid,
      "the spread-optimized schedule still passes every hard constraint",
    );
    const optimized = measurePenalties(spreadGA.schedule);
    check(
      optimized.daySpread < seedPenalties.daySpread,
      `day-spread penalty drops (${seedPenalties.daySpread} -> ${optimized.daySpread}) by using both MW and TTh`,
    );
    check(
      optimized.workloadBalance < seedPenalties.workloadBalance,
      `workload penalty drops (${seedPenalties.workloadBalance} -> ${optimized.workloadBalance}) because no teacher-day is overloaded`,
    );
    check(
      spreadGA.fitness ===
        optimized.workloadBalance * 10 + optimized.daySpread * 10,
      "the reported fitness is the weighted sum of the reported penalties",
    );
    check(
      spreadGA.schedule.length === stackSubjects.length * 2,
      "still exactly 2 linked sessions per subject after optimization",
    );
    for (const subject of stackSubjects) {
      check(
        assertPatternPair(
          spreadGA.schedule,
          subject,
          patternDaysForSubject(spreadGA.schedule, subject.id),
        ),
        `"${subject.name}" lands on a valid day-pair at the same time in the same room`,
      );
    }
  }

  console.log("GA: an idle hole in a teacher's day is the gap penalty");
  check(
    measurePenalties(gapSeed).gapMinimization > 0,
    "the hand-built seed (7:30, then 11:30) reports idle time inside the day",
  );
  check(
    validateSolution(gapInput, gapSeed).valid,
    "the hand-built gap seed is itself conflict-free",
  );
  const gapOnly = runGA(gapInput, gapSeed, {
    weights: { ...NO_PREFERENCES, gapMinimization: 4 },
    random: seededRandom(3),
  });
  check(
    validateSolution(gapInput, gapOnly.schedule).valid,
    "gap optimization keeps the hand-built seed's hard constraints",
  );
  check(
    gapOnly.penalties.gapMinimization < measurePenalties(gapSeed).gapMinimization,
    `the GA closes the idle hole (${measurePenalties(gapSeed).gapMinimization} -> ${gapOnly.penalties.gapMinimization})`,
  );
  check(
    gapOnly.penalties.daySpread > 0,
    "day spread is still reported as a penalty even though it is weighted 0",
  );
  check(
    gapOnly.fitness === 4 * gapOnly.penalties.gapMinimization,
    "the gap-only score ignores the unweighted day-spread penalty completely",
  );

  console.log("GA: an infeasible seed is rejected outright");
  if (cspResult.ok) {
    let threw = false;
    try {
      runGA(feasible, cspResult.solution.slice(1), {
        weights: { ...NO_PREFERENCES, daySpread: 10 },
        random: seededRandom(1),
      });
    } catch {
      threw = true;
    }
    check(threw, "runGA throws instead of optimizing an invalid seed schedule");
  }

  console.log("CSP: picks TTh when MW is fully blocked but TTh is free");
  const tthOnlySubjects: SchedulingSubject[] = [
    {
      id: "s-tth",
      name: "Tuesday-Only 101",
      teacherId: "t-tth",
      roomId: "room-lecture-1",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-tuesday-only",
      year: 1,
    },
  ];
  const tthAvailability: SchedulingAvailability[] = [
    {
      teacherId: "t-tth",
      blockedByPattern: [
        { dayPattern: "MW", slotIndexes: [...AVAILABILITY_TIME_SLOTS.keys()] },
      ],
    },
  ];
  const tthResult = runCSP(buildInput(tthOnlySubjects, ROOMS, tthAvailability));
  check(tthResult.ok, "MW-fully-blocked subject still schedules (via TTh)");
  if (tthResult.ok) {
    const sessions = sessionsBySubject(tthResult.solution).get("s-tth") ?? [];
    check(
      sessions.every((session) => session.dayPattern === "TTh"),
      "the algorithm falls back to TTh, choosing the days itself",
    );
    check(
      assertPatternPair(tthResult.solution, tthOnlySubjects[0], [1, 3]),
      "Wednesday-blocked subject lands on the TTh pair at the same time in the same room",
    );
  }

  console.log("CSP: room overflow reports a per-subject room-caused reason");
  const overbookedRooms: SchedulingRoom[] = [ROOMS[0]];
  const capacityOverflowSubjects: SchedulingSubject[] = Array.from(
    { length: 25 },
    (_, index) => ({
      id: `s-overflow-${index}`,
      name: `Overflow Subject ${index + 1}`,
      teacherId: `t-overflow-${index}`,
      roomId: "room-lecture-1",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: `c-overflow-${index}`,
      year: 1,
    }),
  );
  const infeasible = buildInput(capacityOverflowSubjects, overbookedRooms, []);
  const infeasibleResult = runCSP(infeasible);
  check(
    hasPatternCause(infeasibleResult, (pattern) => pattern.cause === "no-room-available"),
    "25 one-room subjects (12 MW + 12 TTh + 1) report a no-room-available reason",
  );

  console.log("CSP: validation reasons");
  const bogusDurationInput = buildInput([
    { ...SUBJECTS[0], durationMinutes: 90, name: "Odd 90-min Math 101" },
  ]);
  const durationResult = runCSP(bogusDurationInput);
  check(
    !durationResult.ok && "reason" in durationResult && durationResult.reason.code === "invalid-duration",
    "non-multiple-of-60 duration is rejected with invalid-duration",
  );

  console.log("CSP: mirrors current dev data (SE 101, 3-hr lab, no availability)");
  const labOnlyRooms: SchedulingRoom[] = [
    { id: "room-it-lab-1", name: "IT Lab 1", type: "lab" },
  ];
  const se101Subjects: SchedulingSubject[] = [
    {
      id: "j975w55epxdeqw45tkc84230218f0nx7",
      name: "SE 101",
      teacherId: "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX",
      roomId: "room-it-lab-1",
      requiredRoomType: "lab",
      durationMinutes: 180,
      courseId: "c-se-101",
      year: 3,
    },
  ];
  const se101Result = runCSP(buildInput(se101Subjects, labOnlyRooms, []));
  check(se101Result.ok, "CSP places the 3-hour lab subject (no Dean-chosen pattern)");
  if (se101Result.ok) {
    const validation = validateSolution(
      buildInput(se101Subjects, labOnlyRooms, []),
      se101Result.solution,
    );
    check(
      validation.valid && se101Result.solution.length === 2,
      "SE 101 placed exactly 2 linked sessions with zero violations",
    );
    check(
      se101Result.solution.every(
        (placement) => placement.endMinutes - placement.startMinutes === 180,
      ),
      "each SE 101 session spans the full 180 minutes",
    );
    check(
      assertPatternPair(se101Result.solution, se101Subjects[0], [0, 2]),
      "SE 101 lands on Mon + Wed at the same time in the same room",
    );
  }

  console.log("CSP: mirrors full dev seed (3 labs, one teacher, one room each)");
  const devRooms: SchedulingRoom[] = [
    { id: "room-it-lab-1", name: "IT Lab 1", type: "lab" },
    { id: "room-it-lab-2", name: "IT Lab 2", type: "lab" },
    { id: "room-it-lab-3", name: "IT Lab 3", type: "lab" },
  ];
  const devSubjects: SchedulingSubject[] = [
    {
      id: "j975w55epxdeqw45tkc84230218f0nx7",
      name: "SE 101",
      teacherId: "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX",
      roomId: "room-it-lab-1",
      requiredRoomType: "lab",
      durationMinutes: 180,
      courseId: "c-se-101",
      year: 3,
    },
    {
      id: "j9777da1b5ajbzsb4ffh9wc2pn8f1h3h",
      name: "HCI 101",
      teacherId: "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX",
      roomId: "room-it-lab-2",
      requiredRoomType: "lab",
      durationMinutes: 120,
      courseId: "c-hci-101",
      year: 3,
    },
    {
      id: "j97c8degzgb88ywsfpck2ahatd8f00cw",
      name: "OS 101",
      teacherId: "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX",
      roomId: "room-it-lab-3",
      requiredRoomType: "lab",
      durationMinutes: 180,
      courseId: "c-os-101",
      year: 3,
    },
  ];
  const devResult = runCSP(buildInput(devSubjects, devRooms, []));
  check(devResult.ok, "CSP places all 3 dev subjects with one teacher");
  if (devResult.ok) {
    const validation = validateSolution(
      buildInput(devSubjects, devRooms, []),
      devResult.solution,
    );
    check(
      validation.valid && devResult.solution.length === 6,
      "dev seed yields 6 sessions with zero violations (teacher never double-booked)",
    );
    for (const subject of devSubjects) {
      check(
        assertPatternPair(devResult.solution, subject, [0, 2]),
        `"${subject.name}" lands on Mon + Wed at the same time in the same room`,
      );
    }
  }

  console.log(
    "GA: the soft-constraint pressure scenario (constants/pressureTest.ts, seeded by convex/migrations.ts)",
  );
  // Built from the real seed constants so this section cannot drift from the
  // data the migrations actually write. The four hand-entered subjects mirror
  // the deployment as it stood before the scenario was seeded.
  const pressureTeacher = "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX";
  const pressureRooms: SchedulingRoom[] = [
    { id: "room-it-lab-1", name: "IT LAB 1", type: "lab" },
    { id: "room-it-lab-2", name: "IT LAB 2", type: "lab" },
    { id: "room-it-lab-3", name: "IT LAB 3", type: "lab" },
    ...PRESSURE_TEST_ROOMS.map((room, index) => ({
      id: `room-pressure-${index}`,
      name: room.name,
      type: room.type,
    })),
  ];
  const roomIdFor = (name: string, type: "lecture" | "lab"): string => {
    const room = pressureRooms.find((candidate) => candidate.name === name);
    if (!room || room.type !== type) {
      throw new Error(`pressure-test seed wants a ${type} room named "${name}"`);
    }
    return room.id;
  };
  const handEnteredSubjects: SchedulingSubject[] = [
    { id: "cc-106", name: "CC 106", durationMinutes: 180, courseCode: "BSIT" },
    { id: "hci-101", name: "HCI 101", durationMinutes: 120, courseCode: "BSIT" },
    { id: "os-101", name: "OS 101", durationMinutes: 180, courseCode: "BSCS" },
    { id: "se-101", name: "SE 101", durationMinutes: 180, courseCode: "BSCS" },
  ].map((subject) => ({
    id: subject.id,
    name: subject.name,
    teacherId: pressureTeacher,
    roomId: subject.courseCode === "BSIT" ? "room-it-lab-2" : "room-it-lab-1",
    requiredRoomType: "lab" as const,
    durationMinutes: subject.durationMinutes,
    courseId: `c-${subject.id}`,
    year: 1,
  }));
  const seededSubjects: SchedulingSubject[] = PRESSURE_TEST_SUBJECTS.map(
    (seed) => ({
      id: seed.name.toLowerCase().replace(/\s+/g, "-"),
      name: seed.name,
      teacherId: pressureTeacher,
      roomId: roomIdFor(seed.roomName, seed.roomType),
      requiredRoomType: seed.roomType,
      durationMinutes: seed.durationMinutes,
      courseId: `c-${seed.name.toLowerCase().replace(/\s+/g, "-")}`,
      year: 1,
    }),
  );
  const pressureAvailability: SchedulingAvailability[] = [
    {
      teacherId: pressureTeacher,
      blockedByPattern: [
        {
          dayPattern: PRESSURE_TEST_BLOCKED_PATTERN.dayPattern,
          slotIndexes: PRESSURE_TEST_BLOCKED_SLOTS.map((key) =>
            Number(key.split("-")[1]),
          ),
        },
      ],
    },
  ];
  const pressureWeights: SoftConstraintWeights = {
    workloadBalance: 6,
    daySpread: 5,
    gapMinimization: 9,
  };

  check(
    PRESSURE_TEST_SUBJECTS.length === 5,
    "the scenario seeds 5 extra subjects",
  );
  check(
    PRESSURE_TEST_SUBJECTS.every(
      (seed) =>
        seed.durationMinutes > 0 &&
        seed.durationMinutes % AVAILABILITY_SLOT_DURATION_MINUTES === 0,
    ),
    "every seeded duration is a whole number of 60-minute slots (90 would be invalid-duration)",
  );
  check(
    PRESSURE_TEST_BLOCKED_SLOTS.length === 1 &&
      PRESSURE_TEST_BLOCKED_PATTERN.dayPattern === "MW",
    "the scenario blocks exactly one mid-day hour, on MW only, so TTh stays free",
  );

  // Scenario 1 — the seeded teacher now owns all nine subjects.
  const saturatedInput = buildInput(
    [...handEnteredSubjects, ...seededSubjects],
    pressureRooms,
    pressureAvailability,
  );
  const saturatedResult = runCSP(saturatedInput);
  check(
    saturatedResult.ok,
    "the concentrated load is still solvable (pressure, not infeasibility)",
  );
  if (saturatedResult.ok) {
    const saturatedValidation = validateSolution(
      saturatedInput,
      saturatedResult.solution,
    );
    check(
      saturatedValidation.valid &&
        saturatedResult.solution.length ===
          (handEnteredSubjects.length + seededSubjects.length) * 2,
      "all 9 subjects place 18 linked sessions with zero hard-constraint violations",
    );
    if (!saturatedValidation.valid) {
      saturatedValidation.violations.forEach((violation) =>
        console.error(`  - ${violation}`),
      );
    }
    const saturatedPenalties = measurePenalties(saturatedResult.solution);
    check(
      saturatedPenalties.workloadBalance > 0,
      `the raw CSP result is already overloaded (workload penalty ${saturatedPenalties.workloadBalance})`,
    );

    // "All soft constraints off" is the action's GA-skip path, exercised on
    // the real scenario rather than only on the toy input above.
    const saturatedOff = runGA(saturatedInput, saturatedResult.solution, {
      weights: NO_PREFERENCES,
      random: seededRandom(1),
    });
    check(
      samePlacements(saturatedOff.schedule, saturatedResult.solution),
      "OFF: every weight 0 returns the raw CSP schedule exactly (no GA work spent)",
    );

    // "Soft constraints on" is the same input with the Dean's weights. Assert
    // the invariants, then record what the search can and cannot do here.
    let bestFitness = Number.POSITIVE_INFINITY;
    let bestSchedule: PlacedSession[] | null = null;
    let allValid = true;
    for (const seed of [1, 7, 42, 1234, 99999, 31337]) {
      const ga = runGA(saturatedInput, saturatedResult.solution, {
        weights: pressureWeights,
        random: seededRandom(seed),
      });
      if (!validateSolution(saturatedInput, ga.schedule).valid) {
        allValid = false;
      }
      if (ga.fitness < bestFitness) {
        bestFitness = ga.fitness;
        bestSchedule = ga.schedule;
      }
    }
    const seedScore = weightedScore(saturatedResult.solution, pressureWeights);
    check(
      allValid,
      "ON: every GA run still passes all hard constraints",
    );
    check(
      bestFitness <= seedScore,
      `ON: the GA never returns a worse score than the CSP (${bestFitness} <= ${seedScore})`,
    );
    check(
      bestSchedule !== null &&
        [...handEnteredSubjects, ...seededSubjects].every((subject) =>
          assertPatternPair(
            bestSchedule as PlacedSession[],
            subject,
            patternDaysForSubject(
              bestSchedule as PlacedSession[],
              subject.id,
            ),
          ),
        ),
      "ON: the optimized schedule keeps all 9 subjects' day-pairs intact",
    );
    console.log(
      `       OFF fitness ${seedScore} vs best ON fitness ${bestFitness} over 6 seeds (penalties ${JSON.stringify(saturatedPenalties)})`,
    );
    // The load-bearing finding: with all 9 subjects on ONE teacher the weighted
    // score cannot move. Every penalty is an invariant of the load, not of the
    // arrangement — see the Architecture Decisions note in progress-tracker.md.
    // If this ever fails, the scenario has regained real slack and the soft
    // constraints became observable again.
    check(
      bestFitness === seedScore,
      "ON: the concentrated load leaves the GA nothing to improve (all three penalties are invariants of a 9-subject load, so OFF == ON)",
    );
  }

  // Scenario 2 — the same five seeded subjects on a teacher who has nothing
  // else. This is the load level the scenario was designed around, and it is
  // where the soft constraints are actually observable.
  const pressureInput = buildInput(
    seededSubjects,
    pressureRooms,
    pressureAvailability,
  );
  const pressureResult = runCSP(pressureInput);
  check(pressureResult.ok, "the 5 seeded subjects alone are solvable");
  if (pressureResult.ok) {
    const pressureCspPenalties = measurePenalties(pressureResult.solution);
    let bestPressureFitness = Number.POSITIVE_INFINITY;
    for (const seed of [1, 7, 42, 1234, 99999, 31337]) {
      const ga = runGA(pressureInput, pressureResult.solution, {
        weights: pressureWeights,
        random: seededRandom(seed),
      });
      check(
        validateSolution(pressureInput, ga.schedule).valid,
        `ON (5 alone): seed ${seed} output is hard-constraint valid`,
      );
      bestPressureFitness = Math.min(bestPressureFitness, ga.fitness);
    }
    const pressureSeedScore = weightedScore(
      pressureResult.solution,
      pressureWeights,
    );
    console.log(
      `       5 subjects alone: OFF fitness ${pressureSeedScore} -> best ON fitness ${bestPressureFitness} over 6 seeds (OFF penalties ${JSON.stringify(pressureCspPenalties)})`,
    );
    check(
      bestPressureFitness < pressureSeedScore,
      "ON (5 alone): the soft constraints visibly improve the arrangement, which is the whole point of the scenario",
    );
  }

  console.log("CSP: fully-blocked teachers report both patterns for every subject");
  const noSlotsInput = buildInput(SUBJECTS, ROOMS, allBlockedAvailability(["t1", "t2"]));
  const noSlotsResult = runCSP(noSlotsInput);
  check(
    !noSlotsResult.ok &&
      "reasons" in noSlotsResult &&
      noSlotsResult.reasons.length === SUBJECTS.length &&
      noSlotsResult.reasons.every(
        (reason) =>
          reason.patterns.length === 2 &&
          reason.patterns.every(
            (pattern) => pattern.cause === "no-shared-teacher-window",
          ),
      ),
    "fully-blocked teachers report one reason per subject, each explaining BOTH MW and TTh",
  );
  if (!noSlotsResult.ok && "reasons" in noSlotsResult) {
    const reason = noSlotsResult.reasons[0];
    check(
      reason.patterns.every(
        (pattern) =>
          pattern.day1FreeWindows.length === 0 &&
          pattern.day2FreeWindows.length === 0,
      ),
      "both patterns list no free windows at all",
    );
    check(
      reason.patterns.every((pattern) =>
        pattern.message.includes("No matching 60-min start time"),
      ),
      "both patterns state no matching start time exists on the pair's days",
    );
  }

  console.log("CSP: pattern availability applies identically to both days of the pair");
  const patternAvailability: SchedulingAvailability[] = [
    {
      teacherId: "t-pattern",
      blockedByPattern: [{ dayPattern: "MW", slotIndexes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    },
  ];
  const patternMirrorSubjects: SchedulingSubject[] = [
    {
      id: "s-pattern",
      name: "Pattern Mirror 101",
      teacherId: "t-pattern",
      roomId: "room-lecture-1",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-pattern-mirror",
      year: 1,
    },
  ];
  const patternMirrorInput = buildInput(
    patternMirrorSubjects,
    ROOMS,
    patternAvailability,
  );
  const patternMirrorResult = runCSP(patternMirrorInput);
  check(
    patternMirrorResult.ok &&
      patternMirrorResult.solution.every(
        (placement) => placement.startMinutes === 450,
      ),
    "one MW block puts the pair at 7:30 AM on both Mon and Wed",
  );
  const windowsDay0 = freeWindowsForDay(
    patternMirrorInput,
    patternMirrorSubjects[0],
    [],
    0,
  );
  const windowsDay2 = freeWindowsForDay(
    patternMirrorInput,
    patternMirrorSubjects[0],
    [],
    2,
  );
  check(
    windowsDay0.length === 1 &&
      windowsDay0[0].start === 450 &&
      windowsDay0[0].end === 510,
    "Mon free window is 7:30 AM–8:30 AM (slot 0)",
  );
  check(
    JSON.stringify(windowsDay0) === JSON.stringify(windowsDay2),
    "free windows are identical on Mon and Wed — a mismatch is structurally impossible",
  );

  console.log("CSP: room-caused infeasibility is distinct from teacher-caused");
  const crowdedRooms: SchedulingRoom[] = [
    { id: "room-crowded", name: "Crowded Hall", type: "lecture" },
  ];
  const crowdedSubjects: SchedulingSubject[] = [
    {
      id: "a",
      name: "Alpha 101",
      teacherId: "tA",
      teacherName: "Prof. Cruz",
      roomId: "room-crowded",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-alpha",
      year: 1,
    },
    {
      id: "b",
      name: "Beta 101",
      teacherId: "tB",
      teacherName: "Prof. Reyes",
      roomId: "room-crowded",
      requiredRoomType: "lecture",
      durationMinutes: 60,
      courseId: "c-beta",
      year: 1,
    },
  ];
  const crowdedAvailability: SchedulingAvailability[] = [
    {
      teacherId: "tA",
      blockedByPattern: [
        { dayPattern: "MW", slotIndexes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        { dayPattern: "TTh", slotIndexes: [...AVAILABILITY_TIME_SLOTS.keys()] },
      ],
    },
    {
      teacherId: "tB",
      blockedByPattern: [
        { dayPattern: "MW", slotIndexes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        { dayPattern: "TTh", slotIndexes: [...AVAILABILITY_TIME_SLOTS.keys()] },
      ],
    },
  ];
  const crowdedResult = runCSP(
    buildInput(crowdedSubjects, crowdedRooms, crowdedAvailability),
  );
  check(
    hasPatternCause(crowdedResult, (pattern) => pattern.cause === "no-room-available"),
    "teacher free on one shared window but room taken reports no-room-available on MW",
  );
  check(
    hasPatternCause(
      crowdedResult,
      (pattern) =>
        pattern.dayPattern === "TTh" && pattern.cause === "no-shared-teacher-window",
    ),
    "TTh reports no-shared-teacher-window separately (fully blocked)",
  );
  if (!crowdedResult.ok && "reasons" in crowdedResult) {
    const reason = crowdedResult.reasons[0];
    check(reason.subjectName === "Beta 101", "room reason names the blocked subject");
    const mwPattern = reason.patterns.find((pattern) => pattern.dayPattern === "MW");
    check(
      mwPattern !== undefined &&
        mwPattern.day1FreeWindows.length === 1 &&
        mwPattern.day2FreeWindows.length === 1 &&
        mwPattern.day1FreeWindows[0].start === 450 &&
        mwPattern.day2FreeWindows[0].start === 450,
      "room reason still lists the teacher's free windows on both MW days",
    );
    check(
      mwPattern !== undefined && mwPattern.message.includes("occupied at every shared start"),
      "room reason message names the root cause",
    );

    console.log("CSP: structured conflict detail names room, subject, and time");
    const roomConflict = mwPattern?.conflict;
    check(
      roomConflict !== undefined && roomConflict.kind === "room-occupied",
      "MW conflict kind is room-occupied",
    );
    check(
      roomConflict?.title === "Crowded Hall is already booked",
      "room conflict title names the room",
    );
    check(
      roomConflict?.facts.some((entry) => entry.value === "Crowded Hall") === true,
      "room conflict facts include the room name",
    );
    check(
      roomConflict?.facts.some((entry) => entry.value === "Alpha 101") === true,
      "room conflict facts name the class already holding the room",
    );
    check(
      roomConflict?.facts.some(
        (entry) => entry.value === "Mon & Wed 7:30 AM–8:30 AM",
      ) === true,
      "room conflict facts name the overlapping time on both pattern days",
    );
    check(
      roomConflict?.message === mwPattern?.message,
      "conflict message reuses the pattern diagnostic message verbatim",
    );

    const tthPattern = reason.patterns.find(
      (pattern) => pattern.dayPattern === "TTh",
    );
    check(
      tthPattern?.conflict.kind === "teacher-unavailable",
      "TTh conflict kind is teacher-unavailable (pattern fully blocked)",
    );
    check(
      tthPattern?.conflict.title ===
        "Prof. Reyes is unavailable Tue & Thu 7:30 AM–7:30 PM",
      "teacher-unavailable title names the teacher and the blocked window",
    );
    check(
      tthPattern?.conflict.facts.some(
        (entry) =>
          entry.label === "Unavailable" &&
          entry.value === "Tue & Thu 7:30 AM–7:30 PM",
      ) === true,
      "teacher-unavailable facts carry the declared blocked window",
    );
    check(
      tthPattern?.conflict.facts.some(
        (entry) => entry.label === "Teacher" && entry.value === "Prof. Reyes",
      ) === true,
      "teacher-unavailable facts name the teacher",
    );
  }

  console.log("CSP: teacher's own classes explain a no-shared-window conflict");
  const packedSubject: SchedulingSubject = {
    id: "packed",
    name: "Packed 101",
    teacherId: "t-packed",
    teacherName: "Prof. Santos",
    roomId: "room-lecture-1",
    requiredRoomType: "lecture",
    durationMinutes: 60,
    courseId: "c-packed",
    year: 1,
  };
  const packedInput = buildInput(
    [
      packedSubject,
      {
        id: "busy",
        name: "Busy 101",
        teacherId: "t-packed",
        teacherName: "Prof. Santos",
        roomId: "room-lecture-2",
        requiredRoomType: "lecture",
        durationMinutes: 180,
        courseId: "c-busy",
        year: 1,
      },
    ],
    ROOMS,
    [],
  );
  // The teacher's own four linked 3-hour classes fill Mon and Wed end to end,
  // so nothing is left free on either day even with no declared blocks.
  const packedPlacements: PlacedSession[] = [0, 3, 6, 9].flatMap(
    (slotStart) =>
      [0, 2].map(
        (dayIndex): PlacedSession => ({
          subjectId: "busy",
          teacherId: "t-packed",
          roomId: "room-lecture-2",
          dayPattern: "MW",
          dayIndex,
          startMinutes: TIME_SLOTS[slotStart].startMinutes,
          endMinutes: TIME_SLOTS[slotStart + 2].endMinutes,
        }),
      ),
  );
  const packedPattern = explainPatternFailure(
    packedSubject,
    packedInput,
    packedPlacements,
    "MW",
  );
  check(
    packedPattern.cause === "no-shared-teacher-window" &&
      packedPattern.day1FreeWindows.length === 0 &&
      packedPattern.day2FreeWindows.length === 0,
    "a fully packed pair of days leaves no free window at all",
  );
  check(
    packedPattern.conflict.kind === "no-shared-window",
    "no declared block plus a clashing class reports no-shared-window",
  );
  check(
    packedPattern.conflict.title ===
      "Prof. Santos has no 60-min window free on both Mon & Wed",
    "no-shared-window title names the teacher and both days",
  );
  const teachingFacts = packedPattern.conflict.facts.filter(
    (entry) => entry.label === "Already teaching",
  );
  check(
    teachingFacts.length === 3 && (teachingFacts[2].value ?? "").includes("+5 more"),
    "own-class facts are capped at 3 with a count of the rest",
  );
  check(
    teachingFacts.every((entry) => entry.value.includes("Busy 101")),
    "own-class facts name the classes already on the teacher's pair",
  );
  check(
    !packedPattern.conflict.facts.some((entry) => entry.label === "Unavailable"),
    "no-shared-window omits the availability fact when nothing is blocked",
  );

  const noRoomsInput = buildInput(SUBJECTS, [], AVAILABILITY);
  const noRoomsResult = runCSP(noRoomsInput);
  check(
    !noRoomsResult.ok && "reason" in noRoomsResult && noRoomsResult.reason.code === "no-rooms",
    "empty rooms yields no-rooms reason",
  );

  // ---------------------------------------------------------------------
  // Hard constraint: two subjects of the same course AND year can never be
  // in a lesson at the same time.
  // ---------------------------------------------------------------------

  console.log("Hard constraint: same course + year cannot overlap");
  const courseYearRooms: SchedulingRoom[] = [
    { id: "room-cy-1", name: "Course Hall 1", type: "lecture" },
    { id: "room-cy-2", name: "Course Hall 2", type: "lecture" },
  ];
  // Only slot 2 is open on the pair, so both subjects want the same time. The
  // teachers and rooms are all distinct, so course-year is the ONLY blocker.
  const oneSlotOnly: SchedulingAvailability[] = [
    {
      teacherId: "t-cy-1",
      blockedByPattern: [
        { dayPattern: "MW", slotIndexes: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        { dayPattern: "TTh", slotIndexes: [...AVAILABILITY_TIME_SLOTS.keys()] },
      ],
    },
    {
      teacherId: "t-cy-2",
      blockedByPattern: [
        { dayPattern: "MW", slotIndexes: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        { dayPattern: "TTh", slotIndexes: [...AVAILABILITY_TIME_SLOTS.keys()] },
      ],
    },
  ];
  const makeCourseYearSubject = (
    id: string,
    name: string,
    teacherId: string,
    roomId: string,
    courseId: string,
    year: 1 | 2 | 3 | 4,
  ): SchedulingSubject => ({
    id,
    name,
    teacherId,
    roomId,
    requiredRoomType: "lecture",
    durationMinutes: 60,
    courseId,
    year,
  });
  const courseYearSubjects: SchedulingSubject[] = [
    makeCourseYearSubject("cy-a", "Cohort A", "t-cy-1", "room-cy-1", "c-shared", 1),
    makeCourseYearSubject("cy-b", "Cohort B", "t-cy-2", "room-cy-2", "c-shared", 1),
  ];
  const courseYearInput = buildInput(
    courseYearSubjects,
    courseYearRooms,
    oneSlotOnly,
  );
  const courseYearResult = runCSP(courseYearInput);
  check(
    !courseYearResult.ok,
    "two subjects of the same course and year cannot share the only free time",
  );
  if (!courseYearResult.ok && "reasons" in courseYearResult) {
    const kinds = courseYearResult.reasons.flatMap((reason) =>
      reason.patterns.map((pattern) => pattern.conflict.kind),
    );
    check(
      kinds.includes("course-year-conflict"),
      "the failure is explained as a course-year-conflict, not a room or teacher one",
    );
    const conflicting = courseYearResult.reasons
      .flatMap((reason) => reason.patterns)
      .find((pattern) => pattern.conflict.kind === "course-year-conflict");
    check(
      conflicting !== undefined && conflicting.cause === "course-year-busy",
      "the pattern cause is course-year-busy",
    );
    check(
      conflicting?.conflict.facts.some(
        (entry) =>
          entry.label === "Course & year" &&
          entry.value.includes("c-shared") &&
          entry.value.includes("Year 1"),
      ) === true,
      "facts name the course and the year",
    );
    check(
      conflicting?.conflict.facts.some(
        (entry) =>
          entry.label === "Conflicting subject" &&
          (entry.value.includes("Cohort A") || entry.value.includes("Cohort B")),
      ) === true,
      "facts name the subject already holding that time",
    );
  }

  console.log("Hard constraint: different year or course may still overlap");
  // Same course, different year: the students are not the same group, so the
  // single free slot is fine for both.
  const differentYearSubjects: SchedulingSubject[] = [
    makeCourseYearSubject("dy-1", "Year 1 cohort", "t-cy-1", "room-cy-1", "c-shared", 1),
    makeCourseYearSubject("dy-2", "Year 2 cohort", "t-cy-2", "room-cy-2", "c-shared", 2),
  ];
  const differentYearResult = runCSP(
    buildInput(differentYearSubjects, courseYearRooms, oneSlotOnly),
  );
  check(
    differentYearResult.ok,
    "the same course in a different year may overlap in time",
  );
  if (differentYearResult.ok) {
    check(
      validateSolution(
        buildInput(differentYearSubjects, courseYearRooms, oneSlotOnly),
        differentYearResult.solution,
      ).valid,
      "the different-year schedule validates cleanly",
    );
  }

  // Same year, different courses: also a different group of students.
  const differentCourseSubjects: SchedulingSubject[] = [
    makeCourseYearSubject("dc-1", "Course X", "t-cy-1", "room-cy-1", "c-x", 1),
    makeCourseYearSubject("dc-2", "Course Y", "t-cy-2", "room-cy-2", "c-y", 1),
  ];
  const differentCourseResult = runCSP(
    buildInput(differentCourseSubjects, courseYearRooms, oneSlotOnly),
  );
  check(
    differentCourseResult.ok,
    "two different courses in the same year may overlap in time",
  );

  console.log("Hard constraint: validator rejects an overlapping course-year pair");
  // Hand-built, because the CSP can no longer produce this. Different teachers,
  // different rooms, no availability blocks: only the course-year overlap makes
  // it illegal, which proves the check is not piggy-backing on teacher/room.
  const overlapSubjects: SchedulingSubject[] = [
    makeCourseYearSubject("ov-1", "Cohort A", "t-ov-1", "room-ov-1", "c-overlap", 3),
    makeCourseYearSubject("ov-2", "Cohort B", "t-ov-2", "room-ov-2", "c-overlap", 3),
  ];
  const overlapInput = buildInput(overlapSubjects, [
    { id: "room-ov-1", name: "Overlap Hall 1", type: "lecture" },
    { id: "room-ov-2", name: "Overlap Hall 2", type: "lecture" },
  ], []);
  const overlapPlacements: PlacedSession[] = [
    { subjectId: "ov-1", teacherId: "t-ov-1", roomId: "room-ov-1" },
    { subjectId: "ov-2", teacherId: "t-ov-2", roomId: "room-ov-2" },
  ].flatMap((base) =>
    [0, 2].map(
      (dayIndex): PlacedSession => ({
        ...base,
        dayPattern: "MW",
        dayIndex,
        startMinutes: TIME_SLOTS[2].startMinutes,
        endMinutes: TIME_SLOTS[2].endMinutes,
      }),
    ),
  );
  const overlapCheck = validateSolution(overlapInput, overlapPlacements);
  check(
    !overlapCheck.valid,
    "two sessions of one course-year at the same time is invalid",
  );
  check(
    overlapCheck.violations.some((violation) =>
      violation.includes("same course and year") &&
      violation.includes("c-overlap") &&
      violation.includes("year 3"),
    ),
    "the violation names the course, the year and the day",
  );
  check(
    overlapCheck.violations.every(
      (violation) =>
        !violation.includes("double-booked") ||
        violation.includes("teacher") ||
        violation.includes("room"),
    ),
    "teachers and rooms are NOT reported as double-booked in that case",
  );

  // Same hand-built placements, but the year differs -> now perfectly legal.
  const overlapDifferentYear: SchedulingSubject[] = [
    makeCourseYearSubject("ov-1", "Cohort A", "t-ov-1", "room-ov-1", "c-overlap", 3),
    makeCourseYearSubject("ov-2", "Cohort B", "t-ov-2", "room-ov-2", "c-overlap", 4),
  ];
  check(
    validateSolution(
      buildInput(overlapDifferentYear, [
        { id: "room-ov-1", name: "Overlap Hall 1", type: "lecture" },
        { id: "room-ov-2", name: "Overlap Hall 2", type: "lecture" },
      ], []),
      overlapPlacements,
    ).valid,
    "the same placements are valid once one subject moves to another year",
  );

  console.log("Hard constraint: partial overlap counts, and the GA refuses a bad seed");
  // 120 min over two slots would straddle another 60-min session of the same
  // course-year. Kept as a validator check because a 2-slot subject is
  // 120 minutes, which the engine allows.
  const straddlingSubjects: SchedulingSubject[] = [
    { ...overlapSubjects[0], id: "st-1", durationMinutes: 120 },
    { ...overlapSubjects[1], id: "st-2", durationMinutes: 60 },
  ];
  const straddlingInput = buildInput(straddlingSubjects, [
    { id: "room-ov-1", name: "Overlap Hall 1", type: "lecture" },
    { id: "room-ov-2", name: "Overlap Hall 2", type: "lecture" },
  ], []);
  const straddlingPlacements: PlacedSession[] = [
    { subjectId: "st-1", teacherId: "t-ov-1", roomId: "room-ov-1" },
    { subjectId: "st-2", teacherId: "t-ov-2", roomId: "room-ov-2" },
  ].flatMap((base, baseIndex) =>
    [0, 2].map(
      (dayIndex): PlacedSession => ({
        ...base,
        dayPattern: "MW",
        dayIndex,
        // st-1 runs slots 1-2, st-2 runs slot 2: they share slot 2 only.
        startMinutes: TIME_SLOTS[baseIndex === 0 ? 1 : 2].startMinutes,
        endMinutes: TIME_SLOTS[baseIndex === 0 ? 2 : 2].endMinutes,
      }),
    ),
  );
  check(
    !validateSolution(straddlingInput, straddlingPlacements).valid,
    "a partial overlap of the same course-year is still a violation",
  );

  // The GA must not accept or emit a course-year violation. runGA validates its
  // seed first, so an illegal seed has to throw rather than be "optimized".
  let gaThrewForCourseYear = false;
  try {
    runGA(overlapInput, overlapPlacements, {
      weights: { ...NO_PREFERENCES, daySpread: 5 },
      random: seededRandom(7),
    });
  } catch {
    gaThrewForCourseYear = true;
  }
  check(
    gaThrewForCourseYear,
    "runGA refuses to optimize a seed that double-books a course-year",
  );

  // And on a legal seed, the GA's own output must stay legal.
  const legalCourseYearInput = buildInput(
    [
      makeCourseYearSubject("ok-1", "Cohort A", "t-cy-1", "room-cy-1", "c-ok", 1),
      makeCourseYearSubject("ok-2", "Cohort B", "t-cy-2", "room-cy-2", "c-ok", 1),
    ],
    courseYearRooms,
    [],
  );
  const legalSeed = runCSP(legalCourseYearInput);
  if (legalSeed.ok) {
    const gaOut = runGA(legalCourseYearInput, legalSeed.solution, {
      weights: { ...NO_PREFERENCES, workloadBalance: 3, daySpread: 3 },
      random: seededRandom(11),
    });
    check(
      validateSolution(legalCourseYearInput, gaOut.schedule).valid,
      "the GA's optimized schedule still satisfies the course-year constraint",
    );
  }

  console.log(`\n${assertions} assertions, ${failures} failures`);
  if (failures > 0) {
    process.exit(1);
  }
}

main();