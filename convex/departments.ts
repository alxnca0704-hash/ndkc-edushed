import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

import { isAdmin, isDean } from "./roles";

const departmentFields = {
  name: v.string(),
  code: v.string(),
  description: v.optional(v.string()),
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

async function assertCodeAvailable(
  db: QueryCtx["db"],
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db
    .query("departments")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();

  if (existing && existing._id !== excludeId) {
    throw new Error(`Department code "${code}" is already in use`);
  }
}

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isAdmin(identity) && !isDean(identity)) {
        return { ok: true as const, data: [] };
      }

      const departments = await ctx.db
        .query("departments")
        .order("asc")
        .collect();

      return {
        ok: true as const,
        data: departments,
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const create = mutation({
  args: departmentFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can create departments");
    }

    const code = normalizeCode(args.code);
    if (!code) {
      throw new Error("Department code is required");
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error("Department name is required");
    }

    await assertCodeAvailable(ctx.db, code);

    const now = Date.now();

    return ctx.db.insert("departments", {
      name,
      code,
      description: args.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("departments"),
    ...departmentFields,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can update departments");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Department not found");
    }

    const code = normalizeCode(args.code);
    if (!code) {
      throw new Error("Department code is required");
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error("Department name is required");
    }

    await assertCodeAvailable(ctx.db, code, args.id);

    await ctx.db.patch(args.id, {
      name,
      code,
      description: args.description?.trim() || undefined,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("departments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can delete departments");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Department not found");
    }

    // Check if any courses are assigned to this department
    const courses = await ctx.db.query("courses").collect();
    const linkedCourse = courses.find((course) => course.departmentId === args.id);
    if (linkedCourse) {
      throw new Error(
        `Cannot delete department: course "${linkedCourse.name}" (${linkedCourse.code}) is assigned to it`,
      );
    }

    // Unassign department from deans / users
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      if (user.departmentId === args.id) {
        await ctx.db.patch(user._id, { departmentId: undefined, updatedAt: Date.now() });
      }
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});
