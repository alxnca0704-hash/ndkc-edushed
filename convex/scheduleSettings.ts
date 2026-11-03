import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import {
  DEFAULT_SCHEDULE_SETTINGS,
  SOFT_CONSTRAINT_LABELS,
  SOFT_CONSTRAINT_MAX_WEIGHT,
  SOFT_CONSTRAINT_MIN_WEIGHT,
} from "../constants/scheduleSettings";
import type {
  ScheduleSettings,
  SoftConstraint,
  SoftConstraintKey,
} from "../types/scheduleSettings";
import { isDean } from "./roles";

const softConstraintArgs = v.object({
  enabled: v.boolean(),
  weight: v.number(),
});

const settingsArgs = v.object({
  workloadBalance: softConstraintArgs,
  daySpread: softConstraintArgs,
  gapMinimization: softConstraintArgs,
});

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

function validatedWeight(key: SoftConstraintKey, weight: number): number {
  if (
    !Number.isInteger(weight) ||
    weight < SOFT_CONSTRAINT_MIN_WEIGHT ||
    weight > SOFT_CONSTRAINT_MAX_WEIGHT
  ) {
    throw new Error(
      `"${SOFT_CONSTRAINT_LABELS[key]}" weight must be a whole number between ${SOFT_CONSTRAINT_MIN_WEIGHT} and ${SOFT_CONSTRAINT_MAX_WEIGHT}`,
    );
  }
  return weight;
}

function validatedSettings(args: ScheduleSettings): ScheduleSettings {
  return {
    workloadBalance: validatedConstraint("workloadBalance", args.workloadBalance),
    daySpread: validatedConstraint("daySpread", args.daySpread),
    gapMinimization: validatedConstraint(
      "gapMinimization",
      args.gapMinimization,
    ),
  };
}

function validatedConstraint(
  key: SoftConstraintKey,
  constraint: SoftConstraint,
): SoftConstraint {
  return {
    enabled: constraint.enabled,
    weight: validatedWeight(key, constraint.weight),
  };
}

/**
 * The single settings record. Falls back to the defaults (every constraint off)
 * until the Dean saves something, so a fresh deployment needs no seed.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!isDean(identity)) {
        return { ok: false as const, error: "Unauthorized" };
      }

      // `unique` rather than `first`: this table is a singleton, so a second
      // row is a bug worth surfacing instead of silently ignoring.
      const doc = await ctx.db.query("scheduleSettings").unique();

      if (!doc) {
        return { ok: true as const, data: DEFAULT_SCHEDULE_SETTINGS };
      }

      return {
        ok: true as const,
        data: {
          workloadBalance: doc.workloadBalance,
          daySpread: doc.daySpread,
          gapMinimization: doc.gapMinimization,
        } satisfies ScheduleSettings,
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

export const save = mutation({
  args: settingsArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!isDean(identity)) {
      throw new Error("Unauthorized");
    }

    const settings = validatedSettings(args);
    const now = Date.now();
    const existing = await ctx.db.query("scheduleSettings").unique();

    if (existing) {
      await ctx.db.patch(existing._id, { ...settings, updatedAt: now });
      return existing._id;
    }

    return ctx.db.insert("scheduleSettings", {
      ...settings,
      createdAt: now,
      updatedAt: now,
    });
  },
});
