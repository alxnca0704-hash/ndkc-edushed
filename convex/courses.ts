import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

import { isAdmin, isDean } from "./roles";

const courseFields = {
  name: v.string(),
  code: v.string(),
  departmentId: v.optional(v.id("departments")),
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
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

      if (!isDean(identity) && !isAdmin(identity)) {
        return { ok: true as const, data: [] };
      }

      const courses = await ctx.db.query("courses").order("asc").collect();

      return {
        ok: true as const,
        data: courses,
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

async function assertCodeAvailable(
  db: QueryCtx["db"],
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db
    .query("courses")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();

  if (existing && existing._id !== excludeId) {
    throw new Error(`Course code "${code}" is already in use`);
  }
}

export const create = mutation({
  args: courseFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity) && !isAdmin(identity)) {
      throw new Error("Unauthorized");
    }

    const code = normalizeCode(args.code);

    if (!code) {
      throw new Error("Course code is required");
    }

    await assertCodeAvailable(ctx.db, code);

    const now = Date.now();

    return ctx.db.insert("courses", {
      name: args.name.trim(),
      code,
      departmentId: args.departmentId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("courses"),
    ...courseFields,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity) && !isAdmin(identity)) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);

    if (!existing) {
      throw new Error("Course not found");
    }

    const code = normalizeCode(args.code);

    if (!code) {
      throw new Error("Course code is required");
    }

    await assertCodeAvailable(ctx.db, code, args.id);

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      code,
      departmentId: args.departmentId,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity) && !isAdmin(identity)) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);

    if (!existing) {
      throw new Error("Course not found");
    }

    const referencingSubjects = await ctx.db
      .query("subjects")
      .withIndex("by_courseId", (q) => q.eq("courseId", args.id))
      .first();

    if (referencingSubjects) {
      throw new Error(
        `"${referencingSubjects.name}" still uses this course. Reassign it to another course first.`,
      );
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});
