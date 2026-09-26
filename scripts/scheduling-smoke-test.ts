import { runCSP } from "../convex/scheduling/csp";
import {
  explainPatternFailure,
  freeWindowsForDay,
} from "../convex/scheduling/cspDiagnostics";
import { runGA } from "../convex/scheduling/ga";
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
} from "../convex/scheduling/types";
import { DAY_PATTERN_DAY_INDEXES } from "../constants/dayPatterns";
import {
  AVAILABILITY_DAYS,
  AVAILABILITY_TIME_SLOTS,
} from "../constants/availability";

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
  },
  {
    id: "s2",
    name: "English 101",
    teacherId: "t2",
    roomId: "room-lecture-2",
    requiredRoomType: "lecture",
    durationMinutes: 60,
  },
  {
    id: "s3",
    name: "Physics Lab",
    teacherId: "t1",
    roomId: "room-lab-1",
    requiredRoomType: "lab",
    durationMinutes: 60,
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

  console.log("GA: seed from CSP must stay valid");
  if (cspResult.ok) {
    const gaResult = runGA(feasible, cspResult.solution);
    const gaValidation = validateSolution(feasible, gaResult);
    check(
      gaValidation.valid,
      "GA output has zero hard-constraint violations",
    );
    if (!gaValidation.valid) {
      gaValidation.violations.forEach((violation) => console.error(`  - ${violation}`));
    }
    check(gaResult.length > 0, "GA returns a non-empty schedule");
    check(
      SUBJECTS.every((subject) =>
        assertPatternPair(gaResult, subject, patternDaysForSubject(gaResult, subject.id)),
      ),
      "GA keeps the seed-chosen pattern's day-pair (same time, same room) intact",
    );
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
    },
    {
      id: "j9777da1b5ajbzsb4ffh9wc2pn8f1h3h",
      name: "HCI 101",
      teacherId: "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX",
      roomId: "room-it-lab-2",
      requiredRoomType: "lab",
      durationMinutes: 120,
    },
    {
      id: "j97c8degzgb88ywsfpck2ahatd8f00cw",
      name: "OS 101",
      teacherId: "user_3Jj4s0y60y6o4HCpNHhm2HoY4eX",
      roomId: "room-it-lab-3",
      requiredRoomType: "lab",
      durationMinutes: 180,
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
    },
    {
      id: "b",
      name: "Beta 101",
      teacherId: "tB",
      teacherName: "Prof. Reyes",
      roomId: "room-crowded",
      requiredRoomType: "lecture",
      durationMinutes: 60,
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

  console.log(`\n${assertions} assertions, ${failures} failures`);
  if (failures > 0) {
    process.exit(1);
  }
}

main();