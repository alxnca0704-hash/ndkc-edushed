import type {
  GaPenalties,
  PlacedSession,
  SoftConstraintWeights,
} from "./types";

/*
 * The soft-constraint measurement shared by the whole genetic layer.
 *
 * The GA itself lives in `gaGenerate.ts`; nothing here searches, mutates, or
 * selects. What lives here is the part that has to mean exactly one thing no
 * matter which schedule is being scored: how many overload points, idle hours
 * and unused days a week contains, and how the Dean's weights turn those into a
 * number.
 *
 * Keeping measurement separate from search is what makes a score comparable. A
 * score can be quoted as "2 overload points, 3 idle hours" because the same
 * counters produce both the explanation and the number.
 */

/** Classes a teacher can hold in one day before it counts as overloaded. */
const COMFORTABLE_CLASSES_PER_DAY = 2;

/** Days a day-pair week can occupy: Mon, Tue, Wed, Thu. */
const DAYS_IN_A_SCHOOL_WEEK = 4;

const NO_WEIGHTS: SoftConstraintWeights = {
  workloadBalance: 0,
  daySpread: 0,
  gapMinimization: 0,
};

interface DayLoad {
  firstStart: number;
  lastEnd: number;
  teachingMinutes: number;
  classCount: number;
}

function clampWeight(weight: number | undefined): number {
  if (weight === undefined || !Number.isFinite(weight) || weight <= 0) {
    return 0;
  }
  return Math.min(10, Math.floor(weight));
}

export function normalizeWeights(
  weights: SoftConstraintWeights | undefined,
): SoftConstraintWeights {
  return {
    workloadBalance: clampWeight(weights?.workloadBalance),
    daySpread: clampWeight(weights?.daySpread),
    gapMinimization: clampWeight(weights?.gapMinimization),
  };
}

/**
 * The three penalties, measured independently of the weights so a score can be
 * explained ("this schedule has 2 overload points and 3 idle hours").
 */
export function measurePenalties(
  solution: readonly PlacedSession[],
): GaPenalties {
  const loadsByTeacher = new Map<string, Map<number, DayLoad>>();

  for (const placement of solution) {
    let byDay = loadsByTeacher.get(placement.teacherId);
    if (!byDay) {
      byDay = new Map();
      loadsByTeacher.set(placement.teacherId, byDay);
    }
    const load = byDay.get(placement.dayIndex) ?? {
      firstStart: Infinity,
      lastEnd: -Infinity,
      teachingMinutes: 0,
      classCount: 0,
    };
    load.firstStart = Math.min(load.firstStart, placement.startMinutes);
    load.lastEnd = Math.max(load.lastEnd, placement.endMinutes);
    load.teachingMinutes +=
      placement.endMinutes - placement.startMinutes;
    load.classCount += 1;
    byDay.set(placement.dayIndex, load);
  }

  let workloadBalance = 0;
  let gapMinimization = 0;
  let daySpread = 0;

  for (const byDay of loadsByTeacher.values()) {
    for (const load of byDay.values()) {
      workloadBalance += Math.max(
        0,
        load.classCount - COMFORTABLE_CLASSES_PER_DAY,
      );
      const idleMinutes =
        load.lastEnd - load.firstStart - load.teachingMinutes;
      gapMinimization += Math.floor(idleMinutes / 60);
    }
    daySpread += Math.max(0, DAYS_IN_A_SCHOOL_WEEK - byDay.size);
  }

  return { workloadBalance, daySpread, gapMinimization };
}
