"use client";

import { useCallback, useState } from "react";
import { Bell } from "lucide-react";

import { NotificationList } from "@/components/notifications/NotificationList";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";

/** Above this the badge stops counting and starts summarising — "99+" reads as full. */
const BADGE_CAP = 99;

/**
 * The bell in the shared top bar, and the only entry point to notifications.
 *
 * Deliberately not a page: a notification is a pointer to somewhere the reader
 * already works (their week, the Dean's schedule), and the read state is a
 * property of the notification, not a destination of its own. A panel that
 * appears where they already are keeps the "check what's new" habit from
 * requiring navigation.
 *
 * It sits in the shell above both role dashboards rather than inside one, so
 * being told something changed does not require being on the page for that kind
 * of change.
 *
 * The query is subscribed here, at the one place the panel and the badge are
 * both visible, so an unread count cannot be shown from a stale read of the rows
 * that is out of step with the list next to it.
 */
export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
  } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  // A notification is marked read when it is opened, not when it is seen: the
  // panel scrolls, so a row the reader never scrolled to shouldn't clear. The
  // write is awaited but not awaited by the click — navigation happens either
  // way, and Convex's query is reactive, so the badge clears when it lands.
  const handleOpen = useCallback(
    (id: string) => {
      void markRead(id);
    },
    [markRead],
  );

  const handleMarkAllRead = useCallback(() => {
    void markAllRead();
  }, [markAllRead]);

  // Reload rather than a bespoke refetch: a Convex query has no in-place
  // "run this again" to call — it re-subscribes when its args or its identity
  // change, and re-reads on reconnect — so a reload is the only retry that
  // actually re-issues the read. Same as every other retry in the app.
  function handleRetry() {
    window.location.reload();
  }

  // The trigger's accessible name states the count, so a screen reader announces
  // what changed without the badge's shape being the only signal. While loading
  // it says nothing is unread rather than claiming a number it hasn't fetched.
  const unreadLabel =
    isLoading || error
      ? "Notifications"
      : unreadCount === 0
        ? "Notifications, none unread"
        : `Notifications, ${unreadCount} unread`;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative -mr-1"
            aria-label={unreadLabel}
          />
        }
      >
        <Bell />
        {!isLoading && !error && unreadCount > 0 ? (
          <span
            aria-hidden="true"
            data-unread-badge=""
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground ring-2 ring-background"
          >
            {unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96">
        <NotificationList
          notifications={notifications}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          onOpen={handleOpen}
          onMarkAllRead={handleMarkAllRead}
        />
      </PopoverContent>
    </Popover>
  );
}