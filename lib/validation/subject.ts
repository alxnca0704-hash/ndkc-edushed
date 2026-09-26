import { z } from "zod";

import { SUBJECT_YEAR_LEVELS } from "@/constants/courses";
import { SUBJECT_COLOR_TOKENS } from "@/constants/subjectColors";

export const subjectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  durationMinutes: z.coerce
    .number()
    .int("Duration must be a whole number")
    .positive("Duration must be greater than 0")
    .max(480, "Duration must be 480 minutes or fewer"),
  roomId: z.string().min(1, "Choose a room"),
  courseId: z.string().min(1, "Choose a course"),
  year: z.coerce
    .number()
    .pipe(z.literal(SUBJECT_YEAR_LEVELS, "Choose a year level")),
  teacherId: z.string().min(1, "Assign a teacher"),
  color: z.enum(SUBJECT_COLOR_TOKENS),
});

export type SubjectFormSchema = z.infer<typeof subjectFormSchema>;
