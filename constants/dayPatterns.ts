export type DayPattern = "MW" | "TTh";

export const DAY_PATTERN_OPTIONS: readonly DayPattern[] = ["MW", "TTh"];

export const DAY_PATTERNS: Record<DayPattern, readonly string[]> = {
  MW: ["Mon", "Wed"],
  TTh: ["Tue", "Thu"],
};

export const DAY_PATTERN_LABELS: Record<DayPattern, string> = {
  MW: "MW (Mon & Wed)",
  TTh: "TTh (Tue & Thu)",
};

export const DAY_PATTERN_DAY_INDEXES: Record<DayPattern, readonly number[]> = {
  MW: [0, 2],
  TTh: [1, 3],
};