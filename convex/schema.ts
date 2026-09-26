import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const softConstraintValidator = v.object({
  enabled: v.boolean(),
  weight: v.number(),
});

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(v.union(v.literal("dean"), v.literal("teacher"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerkId", ["clerkId"]).index("by_role", ["role"]),
  rooms: defineTable({
    name: v.string(),
    type: v.union(v.literal("lecture"), v.literal("lab")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  courses: defineTable({
    name: v.string(),
    code: v.string(),
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
    courseId: v.id("courses"),
    courseCode: v.string(),
    courseName: v.string(),
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
  // The Dean's soft-constraint weights. Single-tenant prototype, so this table
  // holds exactly one row; the keys mirror `SoftConstraintWeights` in the
  // scheduling engine.
  scheduleSettings: defineTable({
    workloadBalance: softConstraintValidator,
    daySpread: softConstraintValidator,
    gapMinimization: softConstraintValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
});
