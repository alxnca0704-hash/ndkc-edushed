import type { SubjectYearLevel } from "../types/course";

export const SUBJECT_YEAR_LEVELS = [
  1, 2, 3, 4,
] as const satisfies readonly SubjectYearLevel[];

export const SUBJECT_YEAR_LEVEL_LABELS: Record<SubjectYearLevel, string> = {
  1: "1st Year",
  2: "2nd Year",
  3: "3rd Year",
  4: "4th Year",
};

export const DEFAULT_COURSES: readonly {
  name: string;
  code: string;
}[] = [
  { name: "BS Computer Science", code: "BSCS" },
  { name: "BS Information Technology", code: "BSIT" },
];
