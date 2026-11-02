// Imported relatively, not through the `@/` alias, so the Convex-side compiler
// can resolve this module: `convex/notifications.ts` returns `AppNotification`
// and therefore consumes this file (same rule as `constants/scheduleSettings.ts`).
import type { NotificationKind } from "../constants/notifications";

/**
 * One notification as the app reads it: a stored row shaped for the UI.
 *
 * The `title`/`body` pair is written when the notification is created rather
 * than composed from current data, so the message cannot change after the fact
 * (a teacher's class count in a "your schedule was updated" note is a claim
 * about one generation, not about the week as it stands now). The UI renders
 * both strings verbatim; `kind` only chooses an icon and a destination.
 */
export interface AppNotification {
  _id: string;
  kind: NotificationKind;
  /** One line, already complete — read on its own without the body. */
  title: string;
  /** The rest of the sentence(s). May be empty, never `null`. */
  body: string;
  isRead: boolean;
  createdAt: number;
  /** When it was marked read, or `null` while it is still unread. */
  readAt: number | null;
}

/** `notifications.listMine`'s payload: the newest rows plus the unread count. */
export interface NotificationFeed {
  notifications: AppNotification[];
  /**
   * Unread notifications among the scanned rows (see `NOTIFICATION_SCAN_LIMIT`).
   * The bell's badge; saturates rather than growing without bound.
   */
  unreadCount: number;
}