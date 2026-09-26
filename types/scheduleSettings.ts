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
 * What a finished generation reports when the GA actually ran. `fitness` is a
 * penalty total: lower is better, 0 is perfect. `constraints` lists the keys
 * that were switched on, so the UI can say what was optimized for.
 */
export interface OptimizationResult {
  fitness: number;
  constraints: SoftConstraintKey[];
}
