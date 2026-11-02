"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AppNotification } from "@/types/notifications";

const EMPTY_NOTIFICATIONS: readonly AppNotification[] = [];

export interface UseNotificationsResult {
  /** Newest first, at most `NOTIFICATION_LIST_LIMIT` of them. */
  notifications: readonly AppNotification[];
  /** The bell's badge. Unread among the scanned rows — see `NOTIFICATION_SCAN_LIMIT`. */
  unreadCount: number;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  /** Marks one read — called when the reader opens a notification. */
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * The signed-in user's notifications, for the bell in the shared top bar.
 *
 * Not a per-page hook: this data belongs to the shell both role dashboards sit
 * inside, and the query resolves the recipient from the caller's Clerk identity
 * on the server, so there is no user id to read here and no way to ask for
 * someone else's (Invariant 3).
 */
export function useNotifications(): UseNotificationsResult {
  const listQuery = useQuery(api.notifications.listMine);
  const markReadMutation = useMutation(api.notifications.markRead);
  const markAllReadMutation = useMutation(api.notifications.markAllRead);

  const isLoading = listQuery === undefined;
  const error = listQuery?.ok === false ? listQuery.error : null;

  const notifications =
    listQuery?.ok ? listQuery.data.notifications : EMPTY_NOTIFICATIONS;
  const unreadCount = listQuery?.ok ? listQuery.data.unreadCount : 0;

  const isEmpty = !isLoading && !error && notifications.length === 0;

  // Marking read is optimistic-free on purpose: the query is reactive, so the
  // badge clears when Convex confirms the write, and a failure is surfaced by the
  // mutation rejecting rather than by the number sitting wrong.
  const markRead = useCallback(
    async (id: string) => {
      await markReadMutation({ id: id as Id<"notifications"> });
    },
    [markReadMutation],
  );

  const markAllRead = useCallback(async () => {
    await markAllReadMutation({});
  }, [markAllReadMutation]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isEmpty,
    error,
    markRead,
    markAllRead,
  };
}