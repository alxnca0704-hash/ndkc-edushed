import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import {
  asSubjectColorToken,
  isSubjectColorToken,
  subjectColorTokenForName,
} from "../constants/subjectColors";
import { isDean } from "./roles";
import { userDisplayName } from "./userNames";

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
  /**
   * Optional so a caller that never heard of colors still works: the mutation
   * assigns a deterministic one instead of rejecting the write. An unrecognized
   * token is treated as absent rather than stored, since a token outside
   * `SUBJECT_COLOR_TOKENS` has no classes to render.
   */
  color: v.optional(v.string()),
};

/**
 * The color to store: the Dean's pick when they made one, the color the doc
 * already has otherwise, and a deterministic hash of the name when there is
 * neither.
 *
 * The middle case is the point of storing the color at all — an edit that says
 * nothing about color must not move a subject off the color every generated
 * schedule has been drawn in. The last case covers a doc written before colors
 * existed, or one holding a token the palette has since dropped.
 */
function resolveColor(requested: unknown, existing: unknown, name: string): string {
  if (isSubjectColorToken(requested)) {
    return requested;
  }
  if (isSubjectColorToken(existing)) {
    return existing;
  }
  return subjectColorTokenForName(name);
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
          userDisplayName(teacher),
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
            // The schema field is optional (see the note there), so a subject
            // stored before colors existed reads as `undefined` here. Resolved
            // in the query so `SubjectListItem.color` can stay a `string` and no
            // component has to handle a subject that has no color.
            color: asSubjectColorToken(subject.color),
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
      // Assigned once, here, and stored from then on: the Dean can repick it
      // later, but nothing about editing a name or a room silently moves a
      // subject off the color it has been drawn in.
      color: resolveColor(args.color, undefined, args.name),
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
      color: resolveColor(args.color, existing.color, args.name),
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