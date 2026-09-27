import { DAY_PATTERN_DAY_INDEXES } from "../../constants/dayPatterns";
import {
  expandSubjectsIntoSessions,
  validateSchedulingInput,
  type SubjectDomain,
  type SubjectUnit,
  type TimeOption,
} from "./csp";
import { measurePenalties, normalizeWeights } from "./ga";
import {
  countHardViolations,
  validateSolution,
  type HardViolationCounts,
} from "./validate";
import type {
  CspInfeasibleReason,
  GaPenalties,
  InfeasibilityReason,
  PlacedSession,
  SchedulingDayPattern,
  SchedulingInput,
  SoftConstraintKey,
  SoftConstraintWeights,
} from "./types";

/*
 * The Genetic Algorithm that *builds* the timetable — `F(X) = S(X) − 1001 · P_H(X)`.
 *
 * This is the thesis's first half, and it is deliberately NOT `ga.ts`. `ga.ts`
 * polishes a schedule the CSP already made: it takes that schedule as its seed,
 * carries the seed as the incumbent, and can only ever make an already-valid
 * week nicer. This file instead starts from nothing — every chromosome is a
 * random assignment of every subject to a random pattern and start time — and
 * lets the search discover the whole week. A candidate is not required to be
 * valid; it is *scored*, and validity is bought with the `1001` term.
 *
 *   - `S(X)` — the Dean's soft constraints (Balance Workload, Spread Sessions
 *     Across Days, Minimize Gaps) normalized to 0–100. This is the only place
 *     in the engine that reads a soft-constraint weight; `repair.ts` never
 *     sees one.
 *   - `P_H(X)` — a *count* of hard-constraint violations, from the same
 *     collector `validateSolution` reads. `1001 > 100`, so a single violation
 *     always costs more than the entire soft range can earn back: the search
 *     will trade any amount of niceness for one fewer conflict, which is what
 *     lets one weighted sum act as a lexicographic "valid first, pleasant
 *     second" objective.
 *
 * The operators and their rates are the thesis's GA parameter table (§6.1), held
 * in `GA_DEFAULTS` and overridable per call: population 100, tournament
 * selection k = 3, two-point crossover at 0.80, uniform per-gene mutation at
 * 0.05, the best 2 carried forward, and a stop at 200 generations or after 20
 * without improvement.
 *
 * The score is therefore *maximized*. A chromosome is one index per subject
 * into that subject's own list of (pattern, time) choices, so decoding can
 * never produce a malformed schedule — every subject is always placed on both
 * days of its pattern, and the only way to be invalid is to overlap something.
 * That is also why the repair machinery has a real job afterwards: the GA
 * builds the week, `repair.ts` fixes the one class a later edit breaks.
 */

/**
 * The multiplier on `P_H(X)`. The thesis's constant, and deliberately larger
 * than the whole soft range (`MAX_SOFT_SCORE`), so hard feasibility strictly
 * dominates niceness.
 */
export const HARD_VIOLATION_WEIGHT = 1001;

/** The ceiling of `S(X)`. */
export const MAX_SOFT_SCORE = 100;

/**
 * The penalty at which a soft constraint counts as "half bad", per constraint.
 *
 * This is the normalization's only tunable-looking number, and it is not
 * tuning: the rule is uniform — a constraint with no penalty scores 1, one whose
 * penalty has climbed to its reference magnitude scores 0.5, and it keeps
 * halving from there. Each magnitude is a natural unit of its own penalty
 * (overload points past the 2-classes-a-day ceiling, unused days out of the four
 * a day-pair week can span, idle hours in a teaching day), mirroring the
 * ceilings `measurePenalties` already applies in `ga.ts`.
 */
const SOFT_REFERENCE_MAGNITUDE: Readonly<Record<SoftConstraintKey, number>> = {
  workloadBalance: 2,
  daySpread: 4,
  gapMinimization: 4,
};

const NO_WEIGHTS: SoftConstraintWeights = {
  workloadBalance: 0,
  daySpread: 0,
  gapMinimization: 0,
};

/**
 * The GA parameter table from the thesis (§6.1), as this module's defaults.
 *
 * Exported so a conformance check can assert the code against the document
 * rather than against a comment: if anyone retunes a number here, the check
 * fails instead of the thesis quietly going stale.
 */
export const GA_DEFAULTS = {
  /** Chromosomes evaluated per generation. */
  populationSize: 100,
  /** Contenders per tournament; k = 3. */
  tournamentSize: 3,
  /** Two-point crossover probability. */
  crossoverRate: 0.8,
  /** Per-gene chance of a random re-pick. */
  mutationRate: 0.05,
  /** Chromosomes carried into the next generation untouched. */
  elitismSize: 2,
  /** Hard ceiling on generations. */
  maxGenerations: 200,
  /** Generations without improvement after which the run stops. */
  stallLimit: 20,
} as const;

/** Why a run ended — one of the thesis's two stopping criteria. */
export type GaStopReason = "max-generations" | "stalled";

type RandomSource = () => number;

/** One (pattern, start time) a subject could be given. */
interface SubjectChoice {
  dayPattern: SchedulingDayPattern;
  option: TimeOption;
}

/**
 * A subject's whole gene space, flattened. One gene indexes into `choices`, so
 * a chromosome of N genes is a complete schedule of N classes.
 */
interface GeneDomain {
  subjectId: string;
  teacherId: string;
  roomId: string;
  choices: readonly SubjectChoice[];
}

export interface GaGenerateOptions {
  /**
   * The Dean's soft-constraint preferences. All-zero means "no preference": the
   * soft score is then identically 0 and the GA is a pure search for the least
   * broken schedule.
   */
  weights?: SoftConstraintWeights;
  /** Defaults to `GA_DEFAULTS.populationSize`. */
  populationSize?: number;
  /** Defaults to `GA_DEFAULTS.maxGenerations`. */
  maxGenerations?: number;
  /** Defaults to `GA_DEFAULTS.crossoverRate`. */
  crossoverRate?: number;
  /** Defaults to `GA_DEFAULTS.mutationRate`. */
  mutationRate?: number;
  /** Defaults to `GA_DEFAULTS.elitismSize`. */
  elitismSize?: number;
  /** Defaults to `GA_DEFAULTS.stallLimit`; `0` disables the stall stop. */
  stallLimit?: number;
  /**
   * Source of randomness. Defaults to `Math.random`; a seeded generator makes a
   * run reproducible, which is what lets the demo attribute a different result
   * to a different weight rather than to luck.
   */
  random?: () => number;
}

/** Everything a fitness evaluation decides, before the run's own bookkeeping. */
export interface GaEvaluatedSchedule {
  /** Every subject placed on both days of its pattern. */
  schedule: PlacedSession[];
  /** `F(X) = S(X) − 1001 · P_H(X)`. Higher is better. */
  fitness: number;
  /** `S(X)`: the weighted soft score, 0–100. */
  softScore: number;
  /** `P_H(X)`: how many hard rules this schedule breaks. */
  hardViolations: number;
  /** The same count per rule, so a non-zero `hardViolations` can be explained. */
  hardViolationCounts: HardViolationCounts;
  /** The unweighted soft-constraint penalty totals behind `softScore`. */
  penalties: GaPenalties;
  /** `hardViolations === 0`. */
  valid: boolean;
  /**
   * The violations behind a non-zero `hardViolations`, as messages. Empty when
   * the schedule is valid, so a successful run never pays for a second pass.
   */
  violations: readonly string[];
  /** The weights actually used, after normalization. */
  weights: SoftConstraintWeights;
}

export interface GaGenerateSchedule extends GaEvaluatedSchedule {
  /**
   * Generations actually run. Below `maxGenerations` when `stopReason` is
   * `"stalled"`, which is the thesis's second stopping criterion.
   */
  generations: number;
  /** Which of the two stopping criteria ended the run. */
  stopReason: GaStopReason;
  /**
   * Best fitness after each generation, with the initial population's best
   * first — the "fitness progression" of the thesis's workflow, and the
   * convergence trace the GA section of the benchmark reports.
   */
  improvementHistory: readonly number[];
}

export type GaGenerateResult =
  | ({ ok: true } & GaGenerateSchedule)
  | { ok: false; reason: CspInfeasibleReason }
  | { ok: false; reasons: readonly InfeasibilityReason[] };

/** `scale / (scale + penalty)` — 1 with no penalty, 0.5 at the reference. */
function satisfaction(penalty: number, reference: number): number {
  if (penalty <= 0) {
    return 1;
  }
  return reference / (reference + penalty);
}

/**
 * `S(X)`, the Dean's preferences as one 0–100 number.
 *
 * Each constraint the Dean left on contributes, weighted by the weight they gave
 * it, a satisfaction between 0 and 1; `S(X)` is their weighted average scaled to
 * 100. A weight of 0 removes the term entirely, exactly as it does in `ga.ts`,
 * so switching a constraint off cannot change the score at all.
 */
export function softScoreFor(
  penalties: GaPenalties,
  weights: SoftConstraintWeights,
): number {
  const active: { weight: number; satisfaction: number }[] = [
    {
      weight: weights.workloadBalance,
      satisfaction: satisfaction(
        penalties.workloadBalance,
        SOFT_REFERENCE_MAGNITUDE.workloadBalance,
      ),
    },
    {
      weight: weights.daySpread,
      satisfaction: satisfaction(
        penalties.daySpread,
        SOFT_REFERENCE_MAGNITUDE.daySpread,
      ),
    },
    {
      weight: weights.gapMinimization,
      satisfaction: satisfaction(
        penalties.gapMinimization,
        SOFT_REFERENCE_MAGNITUDE.gapMinimization,
      ),
    },
  ].filter((term) => term.weight > 0);

  const totalWeight = active.reduce((sum, term) => sum + term.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }

  const earned = active.reduce(
    (sum, term) => sum + term.weight * term.satisfaction,
    0,
  );
  return (MAX_SOFT_SCORE * earned) / totalWeight;
}

/** Flatten one unit's start times into gene choices. */
function choicesFor(unit: SubjectUnit): readonly SubjectChoice[] {
  return unit.candidates.map((option) => ({
    dayPattern: unit.dayPattern,
    option,
  }));
}

/** One gene domain per subject, with MW and TTh flattened into a single range. */
function buildGeneDomains(domains: readonly SubjectDomain[]): GeneDomain[] {
  return domains.map((domain) => ({
    subjectId: domain.subject.id,
    teacherId: domain.subject.teacherId,
    roomId: domain.subject.roomId,
    choices: domain.options.flatMap(choicesFor),
  }));
}

function randomChromosome(
  geneDomains: readonly GeneDomain[],
  random: RandomSource,
): number[] {
  return geneDomains.map((domain) =>
    Math.floor(random() * domain.choices.length),
  );
}

/** A gene points at a choice, so a chromosome always decodes to a full week. */
function decode(
  geneDomains: readonly GeneDomain[],
  genes: readonly number[],
): PlacedSession[] {
  const sessions: PlacedSession[] = [];

  for (let index = 0; index < geneDomains.length; index++) {
    const domain = geneDomains[index];
    const choice = domain.choices[genes[index]];
    for (const dayIndex of DAY_PATTERN_DAY_INDEXES[choice.dayPattern]) {
      sessions.push({
        subjectId: domain.subjectId,
        teacherId: domain.teacherId,
        roomId: domain.roomId,
        dayPattern: choice.dayPattern,
        dayIndex,
        startMinutes: choice.option.startMinutes,
        endMinutes: choice.option.endMinutes,
      });
    }
  }

  return sessions;
}

function shuffled<T>(source: readonly T[], random: RandomSource): T[] {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Best-of-`GA_DEFAULTS.tournamentSize` by fitness — the whole selection pressure. */
function tournamentSelect(
  population: readonly Member[],
  random: RandomSource,
): Member {
  let incumbent = population[Math.floor(random() * population.length)];
  for (let round = 1; round < GA_DEFAULTS.tournamentSize; round++) {
    const challenger = population[Math.floor(random() * population.length)];
    if (challenger.result.fitness > incumbent.result.fitness) {
      incumbent = challenger;
    }
  }
  return incumbent;
}

/**
 * Two-point crossover: two cut points, and the stretch between them is swapped.
 *
 * Swapping genes is always safe here, which is the reason the operator needs no
 * repair step. Gene *i* is an index into subject *i*'s own choice list in both
 * parents, so a gene taken from either parent still points at a legal choice for
 * that subject — a child is a complete, decodable week however the cuts fall.
 *
 * Preserving a contiguous block is the point of the operator. The previous
 * per-gene coin flip re-picked most genes every generation, so a child shared
 * no structure at all with its parents; two points keep a run of classes from
 * one timetable and recombine around them, which is what lets a good stretch of
 * the week survive instead of being averaged away.
 */
function twoPointCrossover(
  parentA: readonly number[],
  parentB: readonly number[],
  random: RandomSource,
): number[] {
  const length = parentA.length;
  if (length < 2) {
    return [...parentA];
  }
  let first = Math.floor(random() * (length + 1));
  let second = Math.floor(random() * (length + 1));
  if (second < first) {
    [first, second] = [second, first];
  }
  const child = [...parentA];
  for (let index = first; index < second; index++) {
    child[index] = parentB[index];
  }
  return child;
}

/**
 * Uniform per-gene mutation: each gene gets an independent chance of a random
 * re-pick from its own domain.
 *
 * Deliberately a separate pass from crossover so the two rates in the thesis's
 * table mean what they say. Fusing them — one coin deciding "parent or random" —
 * made mutation fire at the crossover rate rather than its own, and made a
 * child a per-gene blend of its parents rather than a recombination of them.
 */
function mutate(
  genes: readonly number[],
  geneDomains: readonly GeneDomain[],
  random: RandomSource,
  mutationRate: number,
): number[] {
  return genes.map((gene, index) =>
    random() < mutationRate
      ? Math.floor(random() * geneDomains[index].choices.length)
      : gene,
  );
}

/** The best `size` members, copied into the next generation untouched. */
function eliteCopies(
  population: readonly Member[],
  size: number,
): Member[] {
  return [...population]
    .sort((a, b) => b.result.fitness - a.result.fitness)
    .slice(0, size);
}

/**
 * One generation of offspring: tournament-select two parents, recombine with
 * probability `crossoverRate`, then mutate each gene with probability
 * `mutationRate`. Recombination and mutation are separate passes, so the two
 * rates in the thesis's table mean what they say; fusing them into one coin
 * made mutation fire at the crossover rate and turned every child into a
 * per-gene blend of its parents rather than a recombination of them.
 */
function breed(
  parents: readonly Member[],
  count: number,
  geneDomains: readonly GeneDomain[],
  random: RandomSource,
  crossoverRate: number,
  mutationRate: number,
  make: (genes: readonly number[]) => Member,
): Member[] {
  const children: Member[] = [];
  while (children.length < count) {
    const parentA = tournamentSelect(parents, random);
    const parentB = tournamentSelect(parents, random);
    const crossed =
      random() < crossoverRate
        ? twoPointCrossover(parentA.genes, parentB.genes, random)
        : [...parentA.genes];
    children.push(
      make(mutate(crossed, geneDomains, random, mutationRate)),
    );
  }
  return children;
}

interface Member {
  genes: readonly number[];
  result: GaEvaluatedSchedule;
}

function betterThan(incumbent: Member, challenger: Member): boolean {
  return challenger.result.fitness > incumbent.result.fitness;
}

/**
 * Build a whole timetable from an empty slate, optimizing the Dean's soft
 * constraints and penalizing every hard-constraint violation along the way.
 *
 * No CSP is consulted and no seed schedule is accepted: the population starts as
 * random assignments, and the best member is carried forward only within this
 * search. Returns the infeasibility reason instead of throwing when the input
 * itself cannot be scheduled at all (no subjects, no rooms, a subject with no
 * possible time), mirroring `runCSP`'s result shape.
 */
export function gaGenerate(
  input: SchedulingInput,
  options: GaGenerateOptions = {},
): GaGenerateResult {
  const inputProblem = validateSchedulingInput(input);
  if (inputProblem) {
    return { ok: false, reason: inputProblem };
  }

  const built = expandSubjectsIntoSessions(input);
  if (built.reason) {
    return { ok: false, reason: built.reason };
  }
  if (built.reasons.length > 0) {
    return { ok: false, reasons: built.reasons };
  }

  const geneDomains = buildGeneDomains(built.domains);
  if (geneDomains.length === 0) {
    return {
      ok: false,
      reason: { code: "no-subjects", message: "No subjects to schedule." },
    };
  }

  const weights = normalizeWeights(options.weights ?? NO_WEIGHTS);
  const random = options.random ?? Math.random;
  const populationSize = Math.max(
    4,
    options.populationSize ?? GA_DEFAULTS.populationSize,
  );
  const maxGenerations = Math.max(
    1,
    options.maxGenerations ?? GA_DEFAULTS.maxGenerations,
  );
  const crossoverRate = options.crossoverRate ?? GA_DEFAULTS.crossoverRate;
  const mutationRate = options.mutationRate ?? GA_DEFAULTS.mutationRate;
  // Always leave room for offspring: a whole generation of elites would be a
  // search that cannot improve.
  const elitismSize = Math.min(
    Math.max(0, options.elitismSize ?? GA_DEFAULTS.elitismSize),
    populationSize - 1,
  );
  const stallLimit = Math.max(0, options.stallLimit ?? GA_DEFAULTS.stallLimit);

  function evaluate(genes: readonly number[]): GaEvaluatedSchedule {
    const schedule = decode(geneDomains, genes);
    const hardViolationCounts = countHardViolations(input, schedule);
    const penalties = measurePenalties(schedule);
    const softScore = softScoreFor(penalties, weights);
    const hardViolations = hardViolationCounts.total;
    return {
      schedule,
      fitness: softScore - HARD_VIOLATION_WEIGHT * hardViolations,
      softScore,
      hardViolations,
      hardViolationCounts,
      penalties,
      valid: hardViolations === 0,
      violations:
        hardViolations > 0 ? validateSolution(input, schedule).violations : [],
      weights,
    };
  }

  const makeMember = (genes: readonly number[]): Member => ({
    genes,
    result: evaluate(genes),
  });

  let population = shuffled(
    Array.from({ length: populationSize }, () =>
      makeMember(randomChromosome(geneDomains, random)),
    ),
    random,
  );
  // The incumbent is seeded from the population rather than drawn separately, so
  // it is always a member of the current generation and elitism below carries it
  // forward by construction.
  let best = population[0];
  for (const member of population) {
    if (betterThan(best, member)) {
      best = member;
    }
  }

  const improvementHistory: number[] = [best.result.fitness];
  let generations = 0;
  let stalledFor = 0;
  let stopReason: GaStopReason = "max-generations";

  while (generations < maxGenerations) {
    // Elitism: the best few are copied in untouched, so a later generation can
    // never end worse than an earlier one.
    const next = [
      ...eliteCopies(population, elitismSize),
      ...breed(
        population,
        populationSize - elitismSize,
        geneDomains,
        random,
        crossoverRate,
        mutationRate,
        makeMember,
      ),
    ];
    population = next;
    generations += 1;

    let improved = false;
    for (const member of population) {
      if (betterThan(best, member)) {
        best = member;
        improved = true;
      }
    }
    improvementHistory.push(best.result.fitness);

    stalledFor = improved ? 0 : stalledFor + 1;
    if (stallLimit > 0 && stalledFor >= stallLimit) {
      stopReason = "stalled";
      break;
    }
  }

  return {
    ok: true,
    ...best.result,
    generations,
    stopReason,
    improvementHistory,
  };
}
