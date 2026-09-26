import type {
  GaOptions,
  GaPenalties,
  GaResult,
  PlacedSession,
  SchedulingDayPattern,
  SchedulingInput,
  SoftConstraintWeights,
} from "./types";
import {
  expandSubjectsIntoSessions,
  greedyDecode,
  type SubjectDomain,
  type SubjectUnit,
} from "./csp";
import { validateSolution } from "./validate";

/*
 * Genetic Algorithm optimizer — the second stage of "Generate Schedule".
 *
 * The CSP always runs first and owns every hard constraint. The GA then takes
 * that conflict-free schedule and tries to make it nicer to live with, scoring
 * candidates against the Dean's weighted soft constraints. Lower fitness is
 * better; 0 means no soft-constraint penalty at all.
 *
 *   - The CSP is the fallback, never the competitor. The best member starts as
 *     the CSP's own solution and is carried into every generation, so the
 *     result is never worse than what the CSP found and is always valid.
 *   - A candidate whose decode fails (greedy placement runs out of room) is
 *     discarded, so the population never contains a conflicting timetable.
 *   - Decode assigns each unit greedily to its first non-conflicting candidate
 *     time, using the same occupancy rules as the CSP, and a unit IS a
 *     day-pair, so both sessions of a subject always land on the same time in
 *     the same room.
 *
 * The chromosome has two parts, because the soft constraints need two levers:
 *
 *   - `order` — which subject claims a time first. This is what moves a class
 *     to a different hour, so it is the only thing that can close the gaps in a
 *     teacher's day.
 *   - `patterns` — the MW/TTh choice per subject. A teacher's class count on a
 *     given day is fixed by which subjects they teach and by those patterns, so
 *     without this gene "balance workload" and "spread sessions across days"
 *     would be unfixable: no amount of re-timing can move a class from Monday
 *     to Tuesday.
 *
 * Order crossover keeps `order` a permutation; the pattern gene is inherited
 * per subject. Both mutations are validity-preserving, so no repair step is
 * needed.
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

type RandomSource = () => number;

interface Chromosome {
  order: readonly string[];
  patterns: ReadonlyMap<string, SchedulingDayPattern>;
}

interface Member {
  chromosome: Chromosome;
  solution: PlacedSession[];
  fitness: number;
}

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

export function hasActiveConstraint(weights: SoftConstraintWeights): boolean {
  return (
    weights.workloadBalance > 0 ||
    weights.daySpread > 0 ||
    weights.gapMinimization > 0
  );
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

function score(
  penalties: GaPenalties,
  weights: SoftConstraintWeights,
): number {
  return (
    penalties.workloadBalance * weights.workloadBalance +
    penalties.daySpread * weights.daySpread +
    penalties.gapMinimization * weights.gapMinimization
  );
}

export function runGA(
  input: SchedulingInput,
  seedSolution: readonly PlacedSession[],
  options: GaOptions = {},
): GaResult {
  const seedCheck = validateSolution(input, seedSolution);
  if (!seedCheck.valid) {
    throw new Error(
      `runGA requires a conflict-free seed schedule.\n${seedCheck.violations.join("\n")}`,
    );
  }

  const weights = normalizeWeights(options.weights ?? NO_WEIGHTS);
  const random = options.random ?? Math.random;
  const seedPenalties = measurePenalties(seedSolution);
  const seedFitness = score(seedPenalties, weights);

  const built = expandSubjectsIntoSessions(input);
  if (built.reason || built.reasons.length > 0 || built.domains.length === 0) {
    return {
      schedule: [...seedSolution],
      fitness: seedFitness,
      penalties: seedPenalties,
    };
  }

  const domainBySubject = new Map(
    built.domains.map((domain) => [domain.subject.id, domain]),
  );

  // The CSP's pattern is the gene's starting value: the GA starts from exactly
  // what the CSP decided and only moves a subject to the other pattern when a
  // soft constraint pays for it.
  const seedPatterns = new Map<string, SchedulingDayPattern>();
  for (const placement of seedSolution) {
    if (!seedPatterns.has(placement.subjectId)) {
      seedPatterns.set(placement.subjectId, placement.dayPattern);
    }
  }

  const subjectIds = built.domains.map((domain) => domain.subject.id);
  const seedChromosome: Chromosome = {
    order: [...subjectIds],
    patterns: seedPatterns,
  };

  const populationSize = Math.max(4, options.populationSize ?? 24);
  const maxIterations = Math.max(1, options.maxIterations ?? 60);

  // A subject can only move to a pattern it actually has candidates for —
  // otherwise the unit simply has no time to place and decode fails.
  function otherPattern(
    subjectId: string,
    pattern: SchedulingDayPattern | undefined,
  ): SchedulingDayPattern | null {
    const domain = domainBySubject.get(subjectId);
    if (!domain || domain.options.length < 2) {
      return null;
    }
    const alternative = domain.options.find(
      (option) => option.dayPattern !== pattern,
    );
    return alternative?.dayPattern ?? null;
  }

  function resolvePattern(
    domain: SubjectDomain,
    pattern: SchedulingDayPattern | undefined,
  ): SchedulingDayPattern {
    const option = domain.options.find(
      (candidate) => candidate.dayPattern === pattern,
    );
    return option?.dayPattern ?? domain.options[0].dayPattern;
  }

  function decode(chromosome: Chromosome): PlacedSession[] | null {
    const orderedUnits: SubjectUnit[] = [];
    for (const subjectId of chromosome.order) {
      const domain = domainBySubject.get(subjectId);
      if (!domain) {
        return null;
      }
      const pattern = resolvePattern(
        domain,
        chromosome.patterns.get(subjectId),
      );
      const unit = domain.options.find(
        (option) => option.dayPattern === pattern,
      );
      if (!unit) {
        return null;
      }
      orderedUnits.push(unit);
    }
    return greedyDecode(orderedUnits);
  }

  function makeMember(
    chromosome: Chromosome,
    solution: PlacedSession[],
  ): Member {
    return {
      chromosome,
      solution,
      fitness: score(measurePenalties(solution), weights),
    };
  }

  // The CSP's schedule is the incumbent: valid, and the floor the search has
  // to beat. It is never re-decoded, so no greedy failure can ever cost us it.
  let best: Member = {
    chromosome: seedChromosome,
    solution: [...seedSolution],
    fitness: seedFitness,
  };

  let population: Member[] = [best];
  while (population.length < populationSize) {
    const order = shuffled(subjectIds, random);
    const decoded = decode({ order, patterns: seedPatterns });
    population.push(
      decoded
        ? makeMember({ order, patterns: seedPatterns }, decoded)
        : best,
    );
  }

  for (let generation = 0; generation < maxIterations; generation++) {
    const next: Member[] = [best];
    while (next.length < populationSize) {
      const parentA = tournamentSelect(population, random);
      const parentB = tournamentSelect(population, random);
      let childOrder = orderCrossover(
        parentA.chromosome.order,
        parentB.chromosome.order,
        random,
      );
      if (random() < 0.5) {
        childOrder = mutateOrder(childOrder, random);
      }
      const childPatterns = patternCrossover(
        parentA.chromosome.patterns,
        parentB.chromosome.patterns,
        subjectIds,
        random,
      );
      const mutatedChild =
        random() < 0.3
          ? mutatePattern(childPatterns, subjectIds, otherPattern, random)
          : childPatterns;

      const chromosome: Chromosome = {
        order: childOrder,
        patterns: mutatedChild,
      };
      const decoded = decode(chromosome);
      next.push(decoded ? makeMember(chromosome, decoded) : best);
    }
    population = next;
    best = population.reduce((a, b) => (b.fitness < a.fitness ? b : a));
  }

  return {
    schedule: [...best.solution],
    fitness: best.fitness,
    penalties: measurePenalties(best.solution),
  };
}

function shuffled<T>(source: readonly T[], random: RandomSource): T[] {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function tournamentSelect(
  population: readonly Member[],
  random: RandomSource,
): Member {
  const a = population[Math.floor(random() * population.length)];
  const b = population[Math.floor(random() * population.length)];
  return b.fitness < a.fitness ? b : a;
}

function orderCrossover(
  parentA: readonly string[],
  parentB: readonly string[],
  random: RandomSource,
): string[] {
  const size = parentA.length;
  const firstIndex = Math.floor(random() * size);
  const secondIndex = Math.floor(random() * size);
  const [from, to] =
    firstIndex <= secondIndex
      ? [firstIndex, secondIndex]
      : [secondIndex, firstIndex];

  const segment = new Set(parentA.slice(from, to + 1));
  const child: string[] = new Array(size).fill("");

  for (let i = from; i <= to; i++) {
    child[i] = parentA[i];
  }

  let cursor = 0;
  for (const gene of parentB) {
    if (segment.has(gene)) {
      continue;
    }
    while (child[cursor] !== "") {
      cursor++;
    }
    child[cursor] = gene;
  }

  return child;
}

function patternCrossover(
  parentA: ReadonlyMap<string, SchedulingDayPattern>,
  parentB: ReadonlyMap<string, SchedulingDayPattern>,
  subjectIds: readonly string[],
  random: RandomSource,
): Map<string, SchedulingDayPattern> {
  const child = new Map<string, SchedulingDayPattern>();
  for (const subjectId of subjectIds) {
    const fromA = parentA.get(subjectId);
    const fromB = parentB.get(subjectId);
    if (fromA === undefined) {
      if (fromB !== undefined) {
        child.set(subjectId, fromB);
      }
      continue;
    }
    child.set(
      subjectId,
      random() < 0.5 || fromB === undefined ? fromA : fromB,
    );
  }
  return child;
}

function mutateOrder(order: readonly string[], random: RandomSource): string[] {
  const copy = [...order];
  // A single-subject schedule has one permutation; swapping it with itself is
  // not an option, so there is nothing to mutate.
  if (copy.length < 2) {
    return copy;
  }
  const i = Math.floor(random() * copy.length);
  let j = Math.floor(random() * copy.length);
  while (j === i) {
    j = Math.floor(random() * copy.length);
  }
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function mutatePattern(
  patterns: ReadonlyMap<string, SchedulingDayPattern>,
  subjectIds: readonly string[],
  otherPattern: (
    subjectId: string,
    pattern: SchedulingDayPattern | undefined,
  ) => SchedulingDayPattern | null,
  random: RandomSource,
): Map<string, SchedulingDayPattern> {
  const copy = new Map(patterns);
  const subjectId = subjectIds[Math.floor(random() * subjectIds.length)];
  const alternative = otherPattern(subjectId, copy.get(subjectId));
  if (alternative) {
    copy.set(subjectId, alternative);
  }
  return copy;
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            