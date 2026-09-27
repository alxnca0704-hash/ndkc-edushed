import {
  expandSubjectsIntoSessions,
  validateSchedulingInput,
  type SubjectDomain,
  type SubjectUnit,
} from "./csp";
import { collectHardViolations } from "./validate";
import type {
  PlacedSession,
  SchedulingInput,
  SchedulingSubject,
} from "./types";
import { courseYearKey } from "./types";

/*
 * The Constraint Satisfaction half of the thesis: when one class is changed, the
 * schedule is repaired locally and automatically.
 *
 * This is a *reaction*, not a mode. Its input is the schedule as it stands
 * after a change plus a description of what just changed, and the system calls
 * it because something happened — there is no "Repair" button anywhere in this
 * design, and nothing in the app asks the user for permission to fix a class
 * they just moved.
 *
 * What makes it CSP rather than a second GA:
 *
 *   - **Hard constraints only.** `RepairOptions` has no weight, no score, and no
 *     notion of a nicer option. The Dean's soft-constraint preferences are read
 *     in exactly one place in this engine — `gaGenerate.ts` — and a compile error
 *     is what would appear if this file ever tried to. Among several valid slots
 *     for the broken class it takes the first one it finds; it does not rank
 *     them. `repair` is not affected by the soft-constraint settings because it
 *     has no way to receive them.
 *   - **Local, not global.** Only the changed class and whatever it now collides
 *     with are lifted out of the schedule. Every other class keeps its exact
 *     placement, byte for byte, which is the whole point: a teacher marking
 *     themselves unavailable on Wednesday must not have their Monday reshuffled.
 *   - **Validity is the one and only requirement.** An assignment is acceptable
 *     if the same hard-constraint collector that reports a broken schedule says
 *     nothing is wrong with it. There is no repair-then-optimize step, because
 *     improving the repaired week for niceness is the GA's job and re-running it
 *     would move the very classes this function promises to leave alone.
 *
 * The search itself is a backtracking walk over the affected classes, driven by
 * the four heuristics the thesis names: the class with the fewest surviving
 * options is moved first (MRV), ties go to the class that shares the most
 * resources with its peers, values are tried least-disruptive first (LCV), and
 * every tentative placement is forward-checked against the classes still
 * unplaced. A time limit bounds the worst case, and the run is instrumented so
 * the benchmark can report backtracking steps.
 */

/** What the system just did, which is what a repair reacts to. */
export type RepairTrigger =
  /**
   * A class was edited and now conflicts — a moved time, a changed room, a new
   * duration. The change is already applied to the schedule passed in; this
   * names the class that changed.
   */
  | { kind: "class-edited"; subjectId: string }
  /**
   * A teacher's declared availability changed and now invalidates one or more
   * of their placed sessions. The new blocks are already in `input.availability`.
   * Which of their classes actually broke is worked out here, not passed in.
   */
  | { kind: "teacher-availability-changed"; teacherId: string };

/** Why a repair stopped, for the analysis the thesis's benchmark reports. */
export type RepairOutcome =
  | "not-needed"
  | "repaired"
  | "exhausted"
  | "time-limit";

/**
 * What the search did. Execution time and backtracking steps are the two
 * figures the CSP-versus-regeneration comparison is made from, so they are
 * measured here rather than estimated by the caller.
 */
export interface RepairStats {
  /** Classes the repair was allowed to move — `r` in the complexity analysis. */
  variables: number;
  /** Largest option list any of those classes had — `d`. */
  maxDomainSize: number;
  /** Search nodes entered, including nodes rejected by forward checking. */
  nodes: number;
  /** Times a tentative placement was undone. */
  backtracks: number;
  /** Whether the time limit, rather than the search space, ended the run. */
  timeLimitHit: boolean;
  /** Wall-clock milliseconds spent inside the search. */
  elapsedMs: number;
  /** Which of the thesis's stopping conditions ended the search. */
  outcome: RepairOutcome;
}

export interface RepairOptions {
  /**
   * Rooms, subjects, and time grid, carrying the availability *as it is after
   * the change*.
   */
  input: SchedulingInput;
  /** The schedule as it stands after the change, conflicts and all. */
  schedule: readonly PlacedSession[];
  /** What just happened. */
  trigger: RepairTrigger;
  /**
   * Safety threshold for the search, in milliseconds. Defaults to
   * `REPAIR_DEFAULTS.timeLimitMs`. A repair that hits it reports
   * `outcome: "time-limit"` so a caller can tell "no repair exists" apart from
   * "this repair was too slow", which are very different answers.
   */
  timeLimitMs?: number;
}

/** The CSP parameter table from the thesis (§6.2), as this module's defaults. */
export const REPAIR_DEFAULTS = {
  /** Wall-clock ceiling for one repair attempt. */
  timeLimitMs: 10_000,
} as const;

/** One class the repair took out and put back, before and after. */
export interface RepairChange {
  subjectId: string;
  from: readonly PlacedSession[];
  to: readonly PlacedSession[];
}

export interface RepairResult {
  /**
   * Whether the affected classes could all be placed validly. On failure the
   * schedule comes back exactly as it went in, so a caller can roll the change
   * back rather than store a broken week.
   */
  success: boolean;
  /** The whole schedule after the repair; untouched classes included, as given. */
  schedule: PlacedSession[];
  /** The new placements for every class the repair was allowed to move. */
  repairedSessions: readonly PlacedSession[];
  /** How many classes the change actually affected. */
  affectedCount: number;
  /** Per-class before/after, so a caller can tell the user what moved. */
  changes: readonly RepairChange[];
  /**
   * Hard-constraint violations left in the whole schedule. Zero when the
   * repair succeeded on a schedule that was otherwise sound; a local repair
   * deliberately leaves violations it was not triggered by alone, so this is the
   * honest number to show.
   */
  remainingHardViolations: number;
  /** Why the repair failed, when it did. */
  reason?: string;
  /**
   * What the search did. Absent only when the repair never started, because
   * the input or the trigger named a class the schedule does not contain.
   */
  stats?: RepairStats;
}

/** One candidate placement for a class: a day pattern and a start time. */
interface RepairValue {
  subjectId: string;
  sessions: PlacedSession[];
}

function sessionsBySubject(
  schedule: readonly PlacedSession[],
): Map<string, PlacedSession[]> {
  const grouped = new Map<string, PlacedSession[]>();
  for (const placement of schedule) {
    const list = grouped.get(placement.subjectId) ?? [];
    grouped.set(placement.subjectId, list);
    list.push(placement);
  }
  return grouped;
}

function triggerSeeds(
  input: SchedulingInput,
  grouped: ReadonlyMap<string, PlacedSession[]>,
  trigger: RepairTrigger,
): string[] {
  if (trigger.kind === "class-edited") {
    return [trigger.subjectId];
  }
  // Availability belongs to a teacher, so every class they teach is a candidate
  // seed; the conflict closure below drops the ones the change did not break.
  return input.subjects
    .filter((subject) => subject.teacherId === trigger.teacherId)
    .filter((subject) => grouped.has(subject.id))
    .map((subject) => subject.id);
}

/**
 * The changed class plus everything it now collides with, found by walking the
 * violation graph outward from the seeds.
 *
 * The seeds are only *candidates*: a class joins the affected set only if the
 * engine can actually see it broken. That is what keeps a repair local in the
 * case that most needs it — a teacher who blocks one afternoon has many classes
 * that the new block never touched, and those must not be candidates for
 * reshuffling. It is also what makes a benign edit free: a schedule with no
 * violations yields an empty affected set and nothing moves.
 *
 * Using the engine's own violation collector is what makes the walk exact: a
 * double-booking names both sides, so the closure adds the class that has to
 * move, and stops there. Iterating to a fixed point matters when the slot a class
 * vacates is the one a third class was already sitting in.
 */
function affectedSubjects(
  input: SchedulingInput,
  schedule: readonly PlacedSession[],
  seeds: readonly string[],
): string[] {
  const violations = collectHardViolations(input, schedule);
  const broken = new Set<string>();
  for (const violation of violations) {
    for (const subjectId of violation.subjectIds) {
      broken.add(subjectId);
    }
  }

  const affected = new Set(seeds.filter((subjectId) => broken.has(subjectId)));
  let grew = true;

  while (grew) {
    grew = false;
    for (const violation of violations) {
      if (!violation.subjectIds.some((id) => affected.has(id))) {
        continue;
      }
      for (const subjectId of violation.subjectIds) {
        if (affected.has(subjectId)) {
          continue;
        }
        affected.add(subjectId);
        grew = true;
      }
    }
  }

  return [...affected].sort();
}

function toPlacedSessions(
  unit: SubjectUnit,
  startMinutes: number,
  endMinutes: number,
): PlacedSession[] {
  return unit.days.map((dayIndex) => ({
    subjectId: unit.subject.id,
    teacherId: unit.subject.teacherId,
    roomId: unit.subject.roomId,
    dayPattern: unit.dayPattern,
    dayIndex,
    startMinutes,
    endMinutes,
  }));
}

/** One candidate placement for a class: every option its day pattern allows. */
function valuesFor(unit: SubjectUnit): RepairValue[] {
  return unit.candidates.map((candidate) => ({
    subjectId: unit.subject.id,
    sessions: toPlacedSessions(
      unit,
      candidate.startMinutes,
      candidate.endMinutes,
    ),
  }));
}

function valuesForDomain(domain: SubjectDomain): RepairValue[] {
  return domain.options.flatMap(valuesFor);
}

/**
 * Half-open interval overlap on the same day.
 *
 * This is not a constraint — it is the *precondition* for every pairwise one. A
 * teacher double-booking, a room double-booking and a course+year overlap all
 * need two sessions on one day whose times overlap, and every remaining
 * violation kind is a property of a single session or of the schedule's shape
 * rather than of two classes meeting. So a pair that never overlaps cannot
 * violate a hard rule, and the search can skip the validator for it.
 */
function overlaps(a: PlacedSession, b: PlacedSession): boolean {
  return (
    a.dayIndex === b.dayIndex &&
    a.startMinutes < b.endMinutes &&
    b.startMinutes < a.endMinutes
  );
}

function anyOverlap(
  sessions: readonly PlacedSession[],
  others: readonly PlacedSession[],
): boolean {
  for (const session of sessions) {
    for (const other of others) {
      if (overlaps(session, other)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * How many of the other classes in the repair set this one shares a resource
 * with — its teacher, its room, or its course+year.
 *
 * The degree tie-break, and it is static: whether two classes *can* clash does
 * not depend on where they are placed, so the count is the same at every node
 * and is computed once.
 */
function degreeOf(
  subject: SchedulingSubject,
  peers: readonly SchedulingSubject[],
): number {
  const key = courseYearKey(subject);
  let degree = 0;
  for (const peer of peers) {
    if (
      peer.teacherId === subject.teacherId ||
      peer.roomId === subject.roomId ||
      courseYearKey(peer) === key
    ) {
      degree += 1;
    }
  }
  return degree;
}

/**
 * Repair the schedule after a change, moving only the classes the change
 * affected.
 *
 * Call this the moment a modification lands, not on request: the trigger is the
 * event, and the return value is the schedule to store.
 */
export function repair(options: RepairOptions): RepairResult {
  const { input, schedule, trigger } = options;
  const grouped = sessionsBySubject(schedule);

  if (trigger.kind === "class-edited" && !grouped.has(trigger.subjectId)) {
    return {
      success: false,
      schedule: [...schedule],
      repairedSessions: [],
      affectedCount: 0,
      changes: [],
      remainingHardViolations: collectHardViolations(input, schedule).length,
      reason: `"${trigger.subjectId}" is not placed in the schedule being repaired.`,
    };
  }

  const affected = affectedSubjects(
    input,
    schedule,
    triggerSeeds(input, grouped, trigger),
  );
  const affectedSet = new Set(affected);
  const fixed = schedule.filter(
    (placement) => !affectedSet.has(placement.subjectId),
  );

  if (affected.length === 0) {
    // The change broke nothing, so there is nothing for the CSP to do. This is a
    // successful repair of zero classes, not a failure.
    return {
      success: true,
      schedule: [...schedule],
      repairedSessions: [],
      affectedCount: 0,
      changes: [],
      remainingHardViolations: 0,
      stats: {
        variables: 0,
        maxDomainSize: 0,
        nodes: 0,
        backtracks: 0,
        timeLimitHit: false,
        elapsedMs: 0,
        outcome: "not-needed",
      },
    };
  }

  const inputProblem = validateSchedulingInput(input);
  if (inputProblem) {
    return failure(input, schedule, inputProblem.message);
  }

  const built = expandSubjectsIntoSessions(input);
  if (built.reason) {
    return failure(input, schedule, built.reason.message);
  }

  const domainBySubject = new Map(
    built.domains.map((domain) => [domain.subject.id, domain]),
  );
  const unplaceable = affected.filter((id) => !domainBySubject.has(id));
  if (unplaceable.length > 0) {
    return failure(
      input,
      schedule,
      `${unplaceable.join(", ")} cannot be placed anywhere in the week.`,
    );
  }

  // The repair's variables, in a stable order. Which one is placed *next* is
  // decided per node by MRV, so this order only fixes the indexing.
  const ordered = affected
    .map((subjectId) => domainBySubject.get(subjectId))
    .filter((domain): domain is SubjectDomain => domain !== undefined);
  const peers = ordered.map((domain) => domain.subject);
  const degrees = peers.map((subject) => degreeOf(subject, peers));

  // Every value any variable could take, flattened so a value has one global
  // index and pairs of values can be memoized by a single number.
  const allValues: RepairValue[] = [];
  const valueOptions: number[][] = ordered.map((domain) => {
    const own: number[] = [];
    for (const value of valuesForDomain(domain)) {
      own.push(allValues.length);
      allValues.push(value);
    }
    return own;
  });

  const fixedByDay = new Map<number, PlacedSession[]>();
  for (const placement of fixed) {
    const list = fixedByDay.get(placement.dayIndex) ?? [];
    fixedByDay.set(placement.dayIndex, list);
    list.push(placement);
  }

  /**
   * The fixed sessions this candidate could possibly clash with.
   *
   * Passing the whole schedule to the validator on every trial is what made the
   * old walk affordable only because it tried so few trials. MRV and LCV need
   * thousands. A fixed session that does not overlap the candidate in time
   * cannot take part in any pairwise violation, so leaving it out changes
   * nothing the collector would have said — it is still the collector, on a
   * trial small enough to run per option.
   */
  function fixedOverlapping(
    sessions: readonly PlacedSession[],
  ): PlacedSession[] {
    const overlapping: PlacedSession[] = [];
    for (const session of sessions) {
      for (const other of fixedByDay.get(session.dayIndex) ?? []) {
        if (overlaps(session, other)) {
          overlapping.push(other);
        }
      }
    }
    return overlapping;
  }

  /**
   * True when these sessions break no hard rule *about this subject*.
   *
   * Classes not yet placed are absent from `placed` and so still report a
   * missing second session; that violation is about them, not about the class
   * being tested, which is why the check is per-subject rather than "no
   * violations at all".
   */
  function canPlace(
    subjectId: string,
    sessions: readonly PlacedSession[],
    current: readonly PlacedSession[],
  ): boolean {
    const trial = [...sessions, ...current, ...fixedOverlapping(sessions)];
    return !collectHardViolations(input, trial).some((violation) =>
      violation.subjectIds.includes(subjectId),
    );
  }

  /**
   * Whether two values could sit in the same week, memoized.
   *
   * Static — it does not depend on what else is placed — so it is computed once
   * per pair and reused by every node that needs it, which is what keeps the
   * value ordering affordable. The overlap test short-circuits the common case
   * where two values simply are not on screen at the same time.
   */
  const pairCache = new Map<number, boolean>();
  function pairCompatible(first: number, second: number): boolean {
    if (first === second) {
      return true;
    }
    const low = first < second ? first : second;
    const high = first < second ? second : first;
    const key = low * allValues.length + high;
    const cached = pairCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const lowValue = allValues[low];
    const highValue = allValues[high];
    const compatible = anyOverlap(lowValue.sessions, highValue.sessions)
      ? !collectHardViolations(input, [
          ...lowValue.sessions,
          ...highValue.sessions,
        ]).some(
          (violation) =>
            violation.subjectIds.includes(lowValue.subjectId) ||
            violation.subjectIds.includes(highValue.subjectId),
        )
      : true;
    pairCache.set(key, compatible);
    return compatible;
  }

  const startedAt = Date.now();
  const deadline = startedAt + Math.max(0, options.timeLimitMs ?? REPAIR_DEFAULTS.timeLimitMs);
  const assignment: number[] = ordered.map(() => -1);
  const viableByIndex: number[][] = ordered.map(() => []);
  const placed: PlacedSession[] = [...fixed];
  const repaired: PlacedSession[] = [];
  let nodes = 0;
  let backtracks = 0;
  let timeLimitHit = false;

  const stats = (outcome: RepairOutcome): RepairStats => ({
    variables: ordered.length,
    maxDomainSize: valueOptions.reduce((most, own: readonly number[]) => Math.max(most, own.length), 0),
    nodes,
    backtracks,
    timeLimitHit,
    elapsedMs: Date.now() - startedAt,
    outcome,
  });

  /**
   * Least Constraining Value: try the option that rules out the fewest
   * placements for the classes still to be placed, cheapest first.
   *
   * On a local repair this is close to free in effect — there is one niceness to
   * preserve, "do not make the next class's problem harder" — and it is the
   * reason a repair that succeeds usually succeeds on its first or second try
   * rather than after a long walk.
   */
  function lcvOrder(subjectIndex: number, viable: readonly number[]): number[] {
    const scored = viable.map((valueIndex) => {
      let eliminated = 0;
      for (let other = 0; other < ordered.length; other++) {
        if (other === subjectIndex || assignment[other] !== -1) {
          continue;
        }
        for (const candidate of viableByIndex[other]) {
          if (!pairCompatible(valueIndex, candidate)) {
            eliminated += 1;
          }
        }
      }
      return { valueIndex, eliminated };
    });
    scored.sort(
      (a, b) => a.eliminated - b.eliminated || a.valueIndex - b.valueIndex,
    );
    return scored.map((entry) => entry.valueIndex);
  }

  function search(depth: number): boolean {
    nodes += 1;
    if (Date.now() > deadline) {
      timeLimitHit = true;
      return false;
    }
    if (depth === ordered.length) {
      return true;
    }

    // MRV and forward checking in one pass: compute what each unplaced class
    // still has available, give up on this node if any class has nothing, and
    // otherwise move the class with the fewest options left. Ties go to the
    // class that shares the most with its peers.
    let chosen = -1;
    let chosenViable: number[] = [];
    let fewest = Number.POSITIVE_INFINITY;
    let tightest = -1;

    for (let index = 0; index < ordered.length; index++) {
      if (assignment[index] !== -1) {
        continue;
      }
      const viable = valueOptions[index].filter((valueIndex) =>
        canPlace(ordered[index].subject.id, allValues[valueIndex].sessions, placed),
      );
      if (viable.length === 0) {
        return false;
      }
      viableByIndex[index] = viable;
      if (
        viable.length < fewest ||
        (viable.length === fewest && degrees[index] > tightest)
      ) {
        chosen = index;
        chosenViable = viable;
        fewest = viable.length;
        tightest = degrees[index];
      }
    }

    if (chosen === -1) {
      return true;
    }

    for (const valueIndex of lcvOrder(chosen, chosenViable)) {
      if (Date.now() > deadline) {
        timeLimitHit = true;
        return false;
      }
      const sessions = allValues[valueIndex].sessions;
      assignment[chosen] = valueIndex;
      placed.push(...sessions);
      repaired.push(...sessions);
      if (search(depth + 1)) {
        return true;
      }
      placed.length -= sessions.length;
      repaired.length -= sessions.length;
      assignment[chosen] = -1;
      backtracks += 1;
    }

    return false;
  }

  if (!search(0)) {
    const outcome: RepairOutcome = timeLimitHit ? "time-limit" : "exhausted";
    const description =
      affected.length === 1
        ? "the broken class"
        : `the ${affected.length} affected classes`;
    return {
      success: false,
      schedule: [...schedule],
      repairedSessions: [],
      affectedCount: 0,
      changes: [],
      remainingHardViolations: collectHardViolations(input, schedule).length,
      reason:
        outcome === "time-limit"
          ? `Gave up on placing ${description} after ${REPAIR_DEFAULTS.timeLimitMs}ms.`
          : `No conflict-free placement exists for ${description}.`,
      stats: stats(outcome),
    };
  }

  // The search only accepted options the collector cleared, so this should hold.
  // Checking it anyway keeps the promise that "success" means the collector says
  // so, rather than that the search believed itself.
  const affectedSetAfter = new Set(affected);
  const survivors = collectHardViolations(input, placed).filter((violation) =>
    violation.subjectIds.some((id) => affectedSetAfter.has(id)),
  );
  if (survivors.length > 0) {
    return {
      success: false,
      schedule: [...schedule],
      repairedSessions: [],
      affectedCount: 0,
      changes: [],
      remainingHardViolations: collectHardViolations(input, schedule).length,
      reason:
        "The search reported a repair the validator rejects; the schedule was left untouched.",
      stats: stats("exhausted"),
    };
  }

  const changes: RepairChange[] = ordered.map((domain) => ({
    subjectId: domain.subject.id,
    from: grouped.get(domain.subject.id) ?? [],
    to: repaired.filter(
      (placement) => placement.subjectId === domain.subject.id,
    ),
  }));

  return {
    success: true,
    schedule: placed,
    repairedSessions: repaired,
    affectedCount: affected.length,
    changes,
    remainingHardViolations: collectHardViolations(input, placed).length,
    stats: stats("repaired"),
  };
}

function failure(
  input: SchedulingInput,
  schedule: readonly PlacedSession[],
  reason: string,
): RepairResult {
  return {
    success: false,
    schedule: [...schedule],
    repairedSessions: [],
    affectedCount: 0,
    changes: [],
    remainingHardViolations: collectHardViolations(input, schedule).length,
    reason,
  };
}
