import { z } from "zod";

export const departmentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Department name is required")
    .max(120, "Department name must be 120 characters or fewer"),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20, "Code must be 20 characters or fewer")
    .regex(/^[A-Za-z0-9-]+$/, "Code can only contain letters, numbers, and dashes")
    .transform((value) => value.toUpperCase()),
  description: z
    .string()
    .trim()
    .max(250, "Description must be 250 characters or fewer")
    .optional(),
});

export type DepartmentFormSchema = z.infer<typeof departmentFormSchema>;
