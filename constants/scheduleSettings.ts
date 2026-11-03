import type {
  ScheduleSettings,
  SoftConstraintKey,
} from "../types/scheduleSettings";

// Types are imported relatively (not via `@/`) so the Convex compiler can
// consume this file, the same trick as `constants/courses.ts`.

/** Display order of the soft-constraint rows. */
export const SOFT_CONSTRAINT_KEYS = [
  "workloadBalance",
  "daySpread",
  "gapMinimization",
] as const satisfies readonly SoftConstraintKey[];

export const SOFT_CONSTRAINT_LABELS: Record<SoftConstraintKey, string> = {
  workloadBalance: "Balance Workload",
  daySpread: "Spread Sessions Across Days",
  gapMinimization: "Minimize Gaps",
};

/** One line per constraint explaining the penalty it applies. */
export const SOFT_CONSTRAINT_DESCRIPTIONS: Record<SoftConstraintKey, string> = {
  workloadBalance:
    "Avoid stacking more than two classes on one teacher's day.",
  daySpread:
    "Spread a teacher's classes over more of the Mon–Thu week instead of fewer days.",
  gapMinimization: "Avoid long idle stretches inside a teacher's day.",
};

export const SOFT_CONSTRAINT_MIN_WEIGHT = 0;
export const SOFT_CONSTRAINT_MAX_WEIGHT = 10;
export const DEFAULT_SOFT_CONSTRAINT_WEIGHT = 5;

/**
 * A fresh install has every soft constraint off, which means the GA is skipped
 * and generation behaves exactly as it did before optimization existed.
 */
export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  workloadBalance: {
    enabled: false,
    weight: DEFAULT_SOFT_CONSTRAINT_WEIGHT,
  },
  daySpread: {
    enabled: false,
    weight: DEFAULT_SOFT_CONSTRAINT_WEIGHT,
  },
  gapMinimization: {
    enabled: false,
    weight: DEFAULT_SOFT_CONSTRAINT_WEIGHT,
  },
};
