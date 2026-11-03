import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { isAdmin, isDean } from "./roles";

const ROOM_TYPES = v.union(v.literal("lecture"), v.literal("lab"));

const roomFields = {
  name: v.string(),
  type: ROOM_TYPES,
};

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

      const rooms = await ctx.db.query("rooms").order("asc").collect();

      return {
        ok: true as const,
        data: rooms,
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const create = mutation({
  args: roomFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can create rooms");
    }

    const now = Date.now();

    return ctx.db.insert("rooms", {
      name: args.name.trim(),
      type: args.type,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("rooms"),
    ...roomFields,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can update rooms");
    }

    const existing = await ctx.db.get(args.id);

    if (!existing) {
      throw new Error("Room not found");
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      type: args.type,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("rooms") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isAdmin(identity)) {
      throw new Error("Unauthorized: Only Admin can delete rooms");
    }

    const existing = await ctx.db.get(args.id);

    if (!existing) {
      throw new Error("Room not found");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});
