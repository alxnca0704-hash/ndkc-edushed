/**
 * The notification vocabulary.
 *
 * A `kind` is the only thing stored that the UI branches on — every sentence a
 * reader sees is written when the notification is created (see
 * `convex/notifications.ts`), because a notification reports what was true at
 * one moment and re-deriving it from current data would quietly rewrite history.
 * The kind exists to pick an icon and a destination, both `Record<kind, …>` maps
 * in `components/notifications/NotificationList.tsx`, so adding one here fails
 * `tsc` until the UI handles it.
 *
 * `schedule-generated` is written for a **teacher** and `availability-updated`
 * for the **Dean**, and only those two directions exist: a teacher cannot
 * generate a week, and the Dean's availability is not a thing in this app.
 *
 * **No imports**, so the Convex-side compiler can consume this file
 * (`convex/schema.ts` builds its validator from the tuple below) the same way
 * `constants/dayPatterns.ts` is consumed.
 */
export const NOTIFICATION_KINDS = [
  "schedule-generated",
  "availability-updated",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: unknown): value is NotificationKind {
  return (
    typeof value === "string" &&
    (NOTIFICATION_KINDS as readonly string[]).includes(value)
  );
}

/**
 * How many notifications the bell's list shows, newest first.
 *
 * There is no history page in this app, so this is the whole of a user's
 * notifications as far as the UI is concerned. The table itself is not capped —
 * see `NOTIFICATION_SCAN_LIMIT` for what the unread badge is computed over.
 */
export const NOTIFICATION_LIST_LIMIT = 20;

/**
 * How far back the unread badge counts.
 *
 * The badge and the list come out of one indexed read, so the count is taken
 * from the same rows the list is built from rather than from a second scan over
 * everything the user has ever been sent. A user with more unread
 * notifications than this sees a badge that saturates instead of an exact
 * number — the honest trade for a single cheap read, and far past what this
 * prototype produces.
 */
export const NOTIFICATION_SCAN_LIMIT = 100;