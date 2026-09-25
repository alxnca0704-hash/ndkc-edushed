import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { isDean } from "./roles";

const YEAR_LEVELS = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
);

const subjectFields = {
  name: v.string(),
  durationMinutes: v.number(),
  roomId: v.id("rooms"),
  courseId: v.id("courses"),
  year: YEAR_LEVELS,
  teacherId: v.string(),
};

function teacherDisplayName(doc: {
  firstName?: string;
  lastName?: string;
  email: string;
}): string {
  const name = [doc.firstName, doc.lastName].filter(Boolean).join(" ").trim();
  return name || doc.email;
}

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isDean(identity)) {
        return { ok: true as const, data: [] };
      }

      const subjects = await ctx.db.query("subjects").order("asc").collect();
      const teachers = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "teacher"))
        .collect();
      const rooms = await ctx.db.query("rooms").collect();
      const courses = await ctx.db.query("courses").collect();

      const teacherByName = new Map(
        teachers.map((teacher) => [
          teacher.clerkId,
          teacherDisplayName(teacher),
        ]),
      );

      const roomById = new Map(rooms.map((room) => [room._id, room]));
      const courseById = new Map(courses.map((course) => [course._id, course]));

      return {
        ok: true as const,
        data: subjects.map((subject) => {
          const room = roomById.get(subject.roomId);
          const course = subject.courseId
            ? courseById.get(subject.courseId)
            : undefined;
          return {
            ...subject,
            roomName: room?.name ?? "—",
            roomType: room?.type ?? "lecture",
            courseName: course?.name ?? "—",
            courseCode: course?.code ?? "—",
            teacherName: teacherByName.get(subject.teacherId) ?? "—",
          };
        }),
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const create = mutation({
  args: subjectFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const room = await ctx.db.get(args.roomId);

    if (!room) {
      throw new Error("Selected room does not exist");
    }

    const course = await ctx.db.get(args.courseId);

    if (!course) {
      throw new Error("Selected course does not exist");
    }

    const teacher = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.teacherId))
      .unique();

    if (!teacher || teacher.role !== "teacher") {
      throw new Error("Assigned teacher does not exist");
    }

    const now = Date.now();

    return ctx.db.insert("subjects", {
      name: args.name.trim(),
      durationMinutes: args.durationMinutes,
      roomId: args.roomId,
      courseId: args.courseId,
      year: args.year,
      teacherId: args.teacherId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("subjects"),
    ...subjectFields,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);

    if (!existing) {
      throw new Error("Subject not found");
    }

    const room = await ctx.db.get(args.roomId);

    if (!room) {
      throw new Error("Selected room does not exist");
    }

    const course = await ctx.db.get(args.courseId);

    if (!course) {
      throw new Error("Selected course does not exist");
    }

    const teacher = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.teacherId))
      .unique();

    if (!teacher || teacher.role !== "teacher") {
      throw new Error("Assigned teacher does not exist");
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      durationMinutes: args.durationMinutes,
      roomId: args.roomId,
      courseId: args.courseId,
      year: args.year,
      teacherId: args.teacherId,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("subjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);

    if (!existing) {
      throw new Error("Subject not found");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});