import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { AppNotification, NotificationFeed } from "../types/notifications";
import {
  NOTIFICATION_LIST_LIMIT,
  NOTIFICATION_SCAN_LIMIT,
  isNotificationKind,
  type NotificationKind,
} from "../constants/notifications";

/**
 * A stored row whose `kind` is known to be in the vocabulary. Nothing writes a
 * row without going through `insertNotification`, which validates the kind, so
 * the guard in `listMine` is a second line of defence rather than normal flow —
 * and a row that somehow failed it is dropped instead of shown under a label it
 * doesn't have.
 */
type NotificationRow = Doc<"notifications"> & { kind: NotificationKind };

function isNotificationRow(row: Doc<"notifications">): row is NotificationRow {
  return isNotificationKind(row.kind);
}

function toErrorString(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong";
}

function asNotification(row: NotificationRow): AppNotification {
  return {
    _id: row._id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    isRead: row.readAt !== undefined,
    createdAt: row.createdAt,
    readAt: row.readAt ?? null,
  };
}

/**
 * Writes one notification, and the single place a row is created.
 *
 * Both producers (a teacher's availability change, a generated week) call this
 * rather than writing the table themselves, so the `kind` is validated in one
 * place and a row can never reach the database carrying a kind the UI has no
 * icon for. The wording is the caller's: whoever knows what happened composes
 * the sentence, because those facts are theirs and this function only stores
 * them.
 */
export async function insertNotification(
  ctx: MutationCtx,
  notification: {
    recipientId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    createdAt: number;
  },
): Promise<void> {
  await ctx.db.insert("notifications", notification);
}

/**
 * The caller's own notifications, newest first, plus how many of the scanned
 * rows are unread.
 *
 * The recipient is resolved from the verified Clerk identity on the server, never
 * from an argument — a client cannot ask for another user's notifications
 * (Invariant 3), and it is the same shape as `schedule.listMine` /
 * `availability.getMine`. Anonymous callers get the same empty result rather than
 * a throw, so a failed load surfaces through the hook's `error` (Invariant 8).
 *
 * One indexed read produces both the list and the badge: the rows come back
 * newest-first (Convex orders an index range by `_creationTime`), the newest
 * `NOTIFICATION_LIST_LIMIT` are shown, and the unread count comes from the whole
 * scanned set — so the badge counts unread items the 20-row list has already
 * scrolled past, up to `NOTIFICATION_SCAN_LIMIT`.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return {
          ok: true as const,
          data: { notifications: [], unreadCount: 0 } satisfies NotificationFeed,
        };
      }

      const rows = await ctx.db
        .query("notifications")
        .withIndex("by_recipientId", (q) =>
          q.eq("recipientId", identity.subject),
        )
        .order("desc")
        .take(NOTIFICATION_SCAN_LIMIT);

      const unreadCount = rows.filter((row) => row.readAt === undefined).length;

      const notifications = rows
        .filter(isNotificationRow)
        .slice(0, NOTIFICATION_LIST_LIMIT)
        .map(asNotification);

      return {
        ok: true as const,
        data: { notifications, unreadCount } satisfies NotificationFeed,
      };
    } catch (error) {
      return { ok: false as const, error: toErrorString(error) };
    }
  },
});

/**
 * Marks one notification read.
 *
 * The row is loaded by id and its recipient checked against the caller before
 * anything is written, so an id belonging to another user cannot be marked — the
 * same ownership check every write in this app performs. Marking an
 * already-read notification is a no-op rather than an error, because the bell can
 * be clicked twice.
 */
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized");
    }

    const notification = await ctx.db.get(args.id);

    if (!notification) {
      throw new Error("Notification not found");
    }

    if (notification.recipientId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    if (notification.readAt !== undefined) {
      return notification._id;
    }

    await ctx.db.patch(notification._id, { readAt: Date.now() });

    return notification._id;
  },
});

/** Marks everything the caller has unread as read, and nothing of anyone else's. */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized");
    }

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) =>
        q.eq("recipientId", identity.subject),
      )
      .filter((q) => q.eq(q.field("readAt"), undefined))
      .collect();

    const now = Date.now();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { readAt: now });
    }

    return unread.length;
  },
});