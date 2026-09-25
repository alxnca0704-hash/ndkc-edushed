import { z } from "zod";

export const courseFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20, "Code must be 20 characters or fewer")
    .regex(/^[A-Za-z0-9-]+$/, "Code can only contain letters, numbers, and dashes")
    .transform((value) => value.toUpperCase()),
});

export type CourseFormSchema = z.infer<typeof courseFormSchema>;
