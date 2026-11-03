import { AVAILABILITY_TIME_SLOTS } from "@/constants/availability";
import { DAY_PATTERN_OPTIONS } from "@/constants/dayPatterns";
import { Skeleton } from "@/components/ui/skeleton";

export function AvailabilityGridSkeleton() {
  return (
    <div className="overflow-x-auto">
      <div
        aria-hidden="true"
        className="grid min-w-[24rem] grid-cols-[3.25rem_repeat(2,minmax(7rem,1fr))] gap-1.5"
      >
        <Skeleton className="h-8" />
        {DAY_PATTERN_OPTIONS.map((dayPattern) => (
          <Skeleton key={dayPattern} className="h-8" />
        ))}
        {AVAILABILITY_TIME_SLOTS.map((slot) =>
          DAY_PATTERN_OPTIONS.map((dayPattern) => (
            <Skeleton
              key={`${dayPattern}-${slot.index}`}
              className="h-9 rounded-md"
            />
          )),
        )}
      </div>
    </div>
  );
}