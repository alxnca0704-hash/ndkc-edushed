"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ScheduleGroupSelectorSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-1.5 h-8 w-full sm:w-72" />
    </div>
  );
}
