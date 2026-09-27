import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

import { roleOf } from "./roles";
import { parseAvailabilityPatternKey } from "../constants/availability";

export function isValidSlotKey(key: string): boolean {
  return parseAvailabilityPatternKey(key) !== null;
}

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity || roleOf(identity) !== "teacher") {
        return { ok: true as const, data: [] };
      }

      const doc = await ctx.db
        .query("availability")
        .withIndex("by_teacherId", (q) => q.eq("teacherId", identity.subject))
        .unique();

      return {
        ok: true as const,
        data: doc?.blockedSlots ?? [],
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const setMine = mutation({
  args: { blockedSlots: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity || roleOf(identity) !== "teacher") {
      throw new Error("Unauthorized");
    }

    for (const key of args.blockedSlots) {
      if (!isValidSlotKey(key)) {
        throw new Error(`Invalid availability slot: ${key}`);
      }
    }

    const blockedSlots = [...new Set(args.blockedSlots)];
    const now = Date.now();
    const teacherId = identity.subject;

    const doc = await ctx.db
      .query("availability")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .unique();

    const availabilityId = doc
      ? await (async () => {
          await ctx.db.patch(doc._id, { blockedSlots, updatedAt: now });
          return doc._id;
        })()
      : await ctx.db.insert("availability", {
          teacherId,
          blockedSlots,
          createdAt: now,
          updatedAt: now,
        });

    // Saving availability is a schedule modification, and a modification is the
    // trigger the CSP repair reacts to (§7). The system repairs the affected
    // classes by itself — there is nothing for the teacher to ask for, and
    // nothing is stored unless the repair succeeds.
    //
    // A repair that cannot succeed is reported, not thrown: the availability
    // change itself is legitimate and is already saved, and a teacher must not
    // lose it because their week no longer fits. The classes they already had
    // stay exactly where they were.
    const repair = await ctx.runMutation(
      internal.schedule.repairAfterAvailabilityChange,
      { teacherId },
    );
    if (repair.outcome === "failed") {
      console.warn(
        `Availability saved for ${teacherId} but the schedule could not be repaired: ${repair.reason ?? "unknown reason"}`,
      );
    }

    return availabilityId;
  },
});