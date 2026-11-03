"use client";

import Link from "next/link";
import { CalendarClock, CalendarRange, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NotificationListSkeleton } from "@/components/notifications/NotificationListSkeleton";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/constants/routes";
import type { NotificationKind } from "@/constants/notifications";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/notifications";
import type { AppNotification } from "@/types/notifications";

/**
 * Where a notification takes you, and what it looks like.
 *
 * Two kinds, two destinations, and the split is by role rather than by choice:
 * an availability change is the Dean's problem (they decide when to regenerate)
 * and a generated week is the teacher's problem (they need to know their hours
 * moved). A teacher opening "availability updated" has nothing to do there, so
 * the kind — not the current role — chooses the link. Sent as routes from the
 * one place they are defined, never as literal paths.
 */
const KIND_PRESENTATION: Record<
  NotificationKind,
  { icon: LucideIcon; href: string; openInNewTab: boolean }
> = {
  "schedule-generated": {
    icon: CalendarClock,
    href: APP_ROUTES.teacherSchedule,
    // The teacher's own week. Replaces the page behind the popover, because
    // "my schedule" is the one destination they are very likely already on.
    openInNewTab: false,
  },
  "availability-updated": {
    icon: CalendarRange,
    href: APP_ROUTES.deanSchedule,
    // The Dean's dashboard, where the notification arrived from. A new tab keeps
    // whatever they were doing underneath — they chose to check, not to leave.
    openInNewTab: true,
  },
};

export interface NotificationListProps {
  notifications: readonly AppNotification[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onMarkAllRead: () => void;
  className?: string;
}

/**
 * The bell's contents: the newest notifications, newest at the top, with a header
 * carrying the one action that applies to all of them.
 *
 * Takes the hook's state as props rather than calling the hook itself, so the
 * query lives in `NotificationBell` alone — the trigger's badge and this list are
 * two views of one result, and two subscriptions would be two reads of the same
 * rows. Opens a notification by reporting it upward: marking read and navigating
 * are the shell's decision, because only the shell knows what is behind the bell.
 */
export function NotificationList({
  notifications,
  isLoading,
  error,
  onRetry,
  onOpen,
  onMarkAllRead,
  className,
}: NotificationListProps) {
  if (isLoading) {
    return <NotificationListSkeleton className={className} />;
  }

  if (error) {
    return (
      <ErrorState
        className={cn("min-h-32 rounded-none", className)}
        title="Couldn't load notifications"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <p className="text-xs font-medium text-muted-foreground">
          Notifications
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          // With nothing unread there is nothing to do, so the control is absent
          // rather than present and inert.
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
        >
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          className="min-h-32 rounded-none"
          title="Nothing yet"
          description="You'll be told here when something changes that needs your attention."
        />
      ) : (
        <ul className="max-h-80 grid gap-0.5 overflow-y-auto">
          {notifications.map((notification) => {
            const { icon: Icon, href, openInNewTab } =
              KIND_PRESENTATION[notification.kind];

            return (
              <li key={notification._id}>
                <Link
                  href={href}
                  {...(openInNewTab
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                  onClick={() => onOpen(notification._id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
                    // Unread is carried by weight and surface, not by a dot alone:
                    // the dot is hidden from assistive tech because "unread" is
                    // already implied by the row's own title text.
                    !notification.isRead && "bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      notification.isRead
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="grid flex-1 gap-0.5">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          notification.isRead
                            ? "font-normal"
                            : "font-semibold",
                        )}
                      >
                        {notification.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {notification.body}
                    </span>
                  </span>
                  {!notification.isRead ? (
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}