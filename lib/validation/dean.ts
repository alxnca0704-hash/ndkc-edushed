import { z } from "zod";

export const deanFormSchema = z.object({
  clerkId: z.string().min(1, "Please select an account"),
  departmentId: z.string().optional(),
});

export type DeanFormSchema = z.infer<typeof deanFormSchema>;
