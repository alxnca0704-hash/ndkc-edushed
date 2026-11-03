import { z } from "zod";

import { ROOM_TYPES } from "@/constants/rooms";

export const roomFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  type: z.enum(ROOM_TYPES, {
    message: "Choose a category",
  }),
});

export type RoomFormSchema = z.infer<typeof roomFormSchema>;