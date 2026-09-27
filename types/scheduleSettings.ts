/**
 * The soft constraints a Dean can weight. The keys mirror
 * `SoftConstraintWeights` in `convex/scheduling/types.ts`, which is the engine's
 * copy of the same vocabulary — this one is what the UI and Convex layer use
 * (the engine stays import-free so it can also run under plain `tsx`).
 */
export type SoftConstraintKey =
  | "workloadBalance"
  | "daySpread"
  | "gapMinimization";

/** One constraint's on/off state and how much it counts (0–10). */
export interface SoftConstraint {
  enabled: boolean;
  weight: number;
}

export interface ScheduleSettings {
  workloadBalance: SoftConstraint;
  daySpread: SoftConstraint;
  gapMinimization: SoftConstraint;
}

/**
 * What a finished generation reports. `fitness` is the GA's `S(X)`: how well the
 * week it built satisfies the Dean's preferences, 0–100, **higher is better**. 0
 * is not a failure — it is what a week scores when no soft constraint is enabled,
 * which says the search optimized only the absence of clashes.
 *
 * `constraints` lists the keys that were switched on, so the UI can say what was
 * optimized for, and so a score of 0 next to a non-empty list is recognizable as
 * "nothing was left on to optimize for" rather than a contradiction.
 *
 * The name is a leftover from when the number was a penalty total to minimize.
 * It is not renamed here because nothing reads it by name, and a rename across the
 * client types, the action and the UI is a larger diff than the fix is worth.
 */
export interface OptimizationResult {
  fitness: number;
  constraints: SoftConstraintKey[];
}
