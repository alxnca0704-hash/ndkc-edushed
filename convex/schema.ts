import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { NOTIFICATION_KINDS } from "../constants/notifications";

const softConstraintValidator = v.object({
  enabled: v.boolean(),
  weight: v.number(),
});

/**
 * Built from the shared tuple rather than written out again, so a kind added in
 * `constants/notifications.ts` is a kind this table accepts. Convex validates
 * every write against the schema, so a mismatch here fails loudly on insert
 * instead of storing a row the UI has no icon for.
 */
const notificationKindValidator = v.union(
  ...NOTIFICATION_KINDS.map((kind) => v.literal(kind)),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("dean"), v.literal("teacher")),
    ),
    departmentId: v.optional(v.id("departments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerkId", ["clerkId"]).index("by_role", ["role"]),
  departments: defineTable({
    name: v.string(),
    code: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),
  rooms: defineTable({
    name: v.string(),
    type: v.union(v.literal("lecture"), v.literal("lab")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  courses: defineTable({
    name: v.string(),
    code: v.string(),
    departmentId: v.optional(v.id("departments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),
  subjects: defineTable({
    name: v.string(),
    durationMinutes: v.number(),
    roomId: v.id("rooms"),
    courseId: v.id("courses"),
    year: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    teacherId: v.string(),
    color: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_teacherId", ["teacherId"]).index("by_courseId", ["courseId"]),
  availability: defineTable({
    teacherId: v.string(),
    blockedSlots: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_teacherId", ["teacherId"]),
  schedules: defineTable({
    subjectId: v.id("subjects"),
    subjectName: v.string(),
    subjectColor: v.optional(v.string()),
    courseId: v.id("courses"),
    courseCode: v.string(),
    courseName: v.string(),
    departmentId: v.optional(v.id("departments")),
    departmentCode: v.optional(v.string()),
    departmentName: v.optional(v.string()),
    year: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    teacherId: v.string(),
    teacherName: v.string(),
    roomId: v.id("rooms"),
    roomName: v.string(),
    roomType: v.union(v.literal("lecture"), v.literal("lab")),
    dayPattern: v.union(v.literal("MW"), v.literal("TTh")),
    dayIndex: v.number(),
    startMinutes: v.number(),
    endMinutes: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_teacherId", ["teacherId"]),
  scheduleSettings: defineTable({
    workloadBalance: softConstraintValidator,
    daySpread: softConstraintValidator,
    gapMinimization: softConstraintValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  notifications: defineTable({
    recipientId: v.string(),
    kind: notificationKindValidator,
    title: v.string(),
    body: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_recipientId", ["recipientId"]),
});
