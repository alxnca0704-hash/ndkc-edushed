"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The bell's list while it loads: a header line plus row-shaped placeholders,
 * the same silhouette the real rows have (icon square, two lines of text, a dot
 * of trailing space) so opening the popover doesn't shift the panel when the
 * content lands.
 *
 * Three rows, not twenty: a skeleton standing in for twenty notifications would
 * be taller than the popover and would scroll, which reads as broken rather than
 * as loading.
 */
export function NotificationListSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <p className="text-xs font-medium text-muted-foreground">
          Notifications
        </p>
        <Skeleton className="h-4 w-20" />
      </div>
      <ul className="grid gap-1.5">
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-start gap-3 rounded-lg px-2 py-2">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="grid flex-1 gap-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="ml-auto h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}