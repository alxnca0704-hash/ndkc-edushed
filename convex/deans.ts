import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

import { isAdmin } from "./roles";
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

      if (!isAdmin(identity)) {
        return { ok: true as const, data: [] };
      }

      const deans = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "dean"))
        .collect();

      const departments = await ctx.db.query("departments").collect();
      const departmentMap = new Map(
        departments.map((dept) => [dept._id, dept]),
      );

      return {
        ok: true as const,
        data: deans.map((dean) => {
          const dept = dean.departmentId
            ? departmentMap.get(dean.departmentId)
            : undefined;
          return {
            _id: dean._id,
            clerkId: dean.clerkId,
            email: dean.email,
            firstName: dean.firstName,
            lastName: dean.lastName,
            displayName: userDisplayName(dean),
            departmentId: dean.departmentId,
            departmentName: dept?.name,
            departmentCode: dept?.code,
          };
        }),
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const listAvailableAccounts = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isAdmin(identity)) {
        return { ok: true as const, data: [] };
      }

      const allUsers = await ctx.db.query("users").collect();
      const assignedDeanClerkIds = new Set(
        allUsers
          .filter((u) => u.role === "dean" && Boolean(u.departmentId))
          .map((u) => u.clerkId),
      );

      const available = allUsers.filter(
        (u) => u.role !== "admin" && !assignedDeanClerkIds.has(u.clerkId),
      );

      return {
        ok: true as const,
        data: available.map((u) => ({
          _id: u._id,
          clerkId: u.clerkId,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: userDisplayName(u),
          role: u.role,
        })),
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const assignDean = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can assign deans");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const now = Date.now();
    if (!user) {
      return ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email?.trim().toLowerCase() ?? "",
        firstName: args.firstName?.trim(),
        lastName: args.lastName?.trim(),
        role: "dean",
        departmentId: args.departmentId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(user._id, {
      role: "dean",
      email: args.email?.trim().toLowerCase() || user.email,
      firstName: args.firstName?.trim() || user.firstName,
      lastName: args.lastName?.trim() || user.lastName,
      departmentId: args.departmentId,
      updatedAt: now,
    });

    return user._id;
  },
});

export const updateDepartment = mutation({
  args: {
    id: v.id("users"),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can update deans");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Dean not found");
    }

    await ctx.db.patch(args.id, {
      departmentId: args.departmentId,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const upsertClerkUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("dean"), v.literal("teacher")),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email || existing.email,
        firstName: args.firstName ?? existing.firstName,
        lastName: args.lastName ?? existing.lastName,
        ...(args.role ? { role: args.role } : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertDean = mutation({
  args: {
    clerkId: v.optional(v.string()),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can manage deans");
    }

    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    const clerkId = args.clerkId?.trim() || `dean_${Date.now()}`;

    const existing =
      (await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
        .unique()) ??
      (await ctx.db.query("users").collect()).find(
        (u) => u.email.toLowerCase() === email,
      );

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        firstName: args.firstName?.trim() || existing.firstName,
        lastName: args.lastName?.trim() || existing.lastName,
        role: "dean",
        departmentId: args.departmentId ?? existing.departmentId,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("users", {
      clerkId,
      email,
      firstName: args.firstName?.trim(),
      lastName: args.lastName?.trim(),
      role: "dean",
      departmentId: args.departmentId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.string(),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can update deans");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Dean not found");
    }

    await ctx.db.patch(args.id, {
      firstName: args.firstName?.trim(),
      lastName: args.lastName?.trim(),
      email: args.email.trim().toLowerCase(),
      departmentId: args.departmentId,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can delete deans");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Dean not found");
    }

    await ctx.db.patch(args.id, {
      role: "teacher",
      departmentId: undefined,
      updatedAt: Date.now(),
    });

    return { id: args.id, clerkId: existing.clerkId };
  },
});

export const syncFromClerk = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can sync deans");
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

      for (const user of users) {
        const email = user.email_addresses[0]?.email_address ?? "";
        if (!email) continue;
        const role = user.public_metadata?.role;
        const validRole =
          role === "dean" || role === "teacher" || role === "admin"
            ? (role as "dean" | "teacher" | "admin")
            : undefined;

        await ctx.runMutation(api.deans.upsertClerkUser, {
          clerkId: user.id,
          email,
          firstName: user.first_name ?? undefined,
          lastName: user.last_name ?? undefined,
          role: validRole,
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
