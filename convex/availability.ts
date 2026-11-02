import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

import { roleOf } from "./roles";
import { identityDisplayName, userDisplayName } from "./userNames";
import { insertNotification } from "./notifications";
import { parseAvailabilityPatternKey } from "../constants/availability";

export function isValidSlotKey(key: string): boolean {
  return parseAvailabilityPatternKey(key) !== null;
}

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

/**
 * Whether the slots a teacher just saved are different from the ones already
 * stored — the test for "something happened".
 *
 * Compared as sets, not as arrays: `blockedSlots` is an unordered collection of
 * grid cells, and re-saving the same week in a different order is not a change
 * worth telling the Dean about.
 */
function slotsChanged(
  previous: readonly string[],
  next: ReadonlySet<string>,
): boolean {
  if (previous.length !== next.size) {
    return true;
  }
  return previous.some((key) => !next.has(key));
}

/**
 * Tells every Dean that a teacher's availability moved.
 *
 * A teacher's availability is the one thing a Dean can never see happen — the
 * teacher edits it on their own page and the Dean's dashboard is unchanged until
 * the next generation reads it. Without this the Dean generates against last
 * week's constraints and finds out from the result.
 *
 * "Every Dean", not "the Dean", because the prototype has one school and the
 * `users` table is the only record of who holds the role; if a second Dean
 * account is seeded, both are told rather than one chosen arbitrarily. A school
 * whose Deans should each get their own copy of this is a different model (and
 * would be a per-teacher audience, like `schedules.teacherId`).
 */
async function notifyDeansOfAvailabilityChange(
  ctx: MutationCtx,
  input: { teacherName: string; blockedCount: number; now: number },
): Promise<number> {
  const deans = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "dean"))
    .collect();

  for (const dean of deans) {
    await insertNotification(ctx, {
      recipientId: dean.clerkId,
      kind: "availability-updated",
      title: `${input.teacherName} updated their availability`,
      body: `${input.blockedCount} ${
        input.blockedCount === 1 ? "slot" : "slots"
      } blocked this week. It is used the next time you generate a schedule.`,
      createdAt: input.now,
    });
  }

  return deans.length;
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

    const blocked = new Set(args.blockedSlots);
    const blockedSlots = [...blocked];
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

    // Tell the Dean, because this is the one change to the schedule's inputs the
    // Dean cannot see happening. Only when the slots actually differ, so a
    // re-save of the same week doesn't produce a duplicate notice — and the
    // name comes from the `users` doc the rest of the app names teachers from,
    // so the notification and the subjects table call them the same thing.
    if (slotsChanged(doc?.blockedSlots ?? [], blocked)) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", teacherId))
        .unique();

      await notifyDeansOfAvailabilityChange(ctx, {
        teacherName: teacher
          ? userDisplayName(teacher)
          : identityDisplayName(identity) || "A teacher",
        blockedCount: blocked.size,
        now,
      });
    }

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