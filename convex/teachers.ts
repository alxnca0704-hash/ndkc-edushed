import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

import { isDean } from "./roles";
import { userDisplayName } from "./userNames";

const CLERK_API_URL = "https://api.clerk.com/v1";
const PAGE_LIMIT = 500;

interface ClerkUser {
  id: string;
  email_addresses: { email_address: string }[];
  first_name: string | null;
  last_name: string | null;
  public_metadata: { role?: string } | null;
}

export const upsertTeacher = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email || existing.email,
        firstName: args.firstName ?? existing.firstName,
        lastName: args.lastName ?? existing.lastName,
        role: "teacher",
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const syncFromClerk = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured");
    }

    let synced = 0;
    let offset = 0;

    while (true) {
      const response = await fetch(
        `${CLERK_API_URL}/users?limit=${PAGE_LIMIT}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Clerk API error (${response.status})`);
      }

      const users = (await response.json()) as ClerkUser[];

      const teachers = users.filter(
        (user) => user.public_metadata?.role === "teacher",
      );

      for (const teacher of teachers) {
        await ctx.runMutation(api.teachers.upsertTeacher, {
          clerkId: teacher.id,
          email: teacher.email_addresses[0]?.email_address ?? "",
          firstName: teacher.first_name ?? undefined,
          lastName: teacher.last_name ?? undefined,
        });
        synced += 1;
      }

      if (users.length < PAGE_LIMIT) {
        break;
      }
      offset += users.length;
    }

    return { synced };
  },
});

export const getTeachers = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isDean(identity)) {
        return { ok: true as const, data: [] };
      }

      const teachers = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "teacher"))
        .collect();

      return {
        ok: true as const,
        data: teachers.map((teacher) => ({
          clerkId: teacher.clerkId,
          name: userDisplayName(teacher),
        })),
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}