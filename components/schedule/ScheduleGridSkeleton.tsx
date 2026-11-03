"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AVAILABILITY_TIME_SLOTS } from "@/constants/availability";
import { DAY_PATTERN_OPTIONS } from "@/constants/dayPatterns";
import { LANE_MIN, TIME_GUTTER } from "@/lib/schedule";
import { cn } from "@/lib/utils";

/**
 * A fixed scatter of filled slots, so the skeleton reads as a partly-booked
 * week rather than a solid block. Hardcoded rather than random: a loading
 * placeholder must render identically on the server and the client.
 */
const SKELETON_SLOTS: readonly { columnIndex: number; slotIndex: number }[] = [
  { columnIndex: 0, slotIndex: 0 },
  { columnIndex: 0, slotIndex: 2 },
  { columnIndex: 0, slotIndex: 6 },
  { columnIndex: 1, slotIndex: 1 },
  { columnIndex: 1, slotIndex: 3 },
  { columnIndex: 1, slotIndex: 7 },
];

/**
 * Mirrors `ScheduleGrid`'s shape: the two day-pair headings and one
 * block-shaped `Skeleton` per filled slot. Both views use it, since both render
 * the same grid.
 *
 * The lane geometry is imported rather than repeated, and the unsplit
 * `1fr`-per-day-pair template is deliberate: the week is not known yet, so the
 * skeleton shows the resting two-column layout. It shares the grid's track
 * widths and row height, which is what keeps the loaded grid from jumping.
 */
export function ScheduleGridSkeleton({ className }: { className?: string }) {
  const gridTemplateColumns = [
    TIME_GUTTER,
    ...DAY_PATTERN_OPTIONS.map(() => `minmax(${LANE_MIN}, 1fr)`),
  ].join(" ");

  return (
    <div className={cn("flex flex-col gap-3", className)} aria-hidden="true">
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 p-2">
        <div
          className="grid"
          style={{
            gridTemplateColumns,
            gridTemplateRows: `auto repeat(${AVAILABILITY_TIME_SLOTS.length}, var(--schedule-row-height))`,
            columnGap: "0.5rem",
            rowGap: 0,
          }}
        >
          {/* Same three background layers as `ScheduleGrid`, so the frame, the
              green day-pair washes and the hour rules are already in place when
              the real grid swaps in. */}
          {DAY_PATTERN_OPTIONS.map((dayPattern, columnIndex) => (
            <div
              key={`column-${dayPattern}`}
              style={{ gridRow: "1 / -1", gridColumn: columnIndex + 2 }}
              className="rounded-lg bg-schedule-column"
            />
          ))}

          {AVAILABILITY_TIME_SLOTS.map((slot, rowIndex) => (
            <div
              key={`rule-${slot.index}`}
              style={{ gridRow: rowIndex + 2, gridColumn: "2 / -1" }}
              className="border-t border-schedule-rule/70"
            />
          ))}

          <div className="h-8" />

          {DAY_PATTERN_OPTIONS.map((dayPattern) => (
            <div
              key={dayPattern}
              style={{ gridRow: 1 }}
              className="flex flex-col items-center justify-center gap-0.5 pb-1"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-8" />
              <span className="sr-only">{dayPattern}</span>
            </div>
          ))}

          {AVAILABILITY_TIME_SLOTS.map((slot, rowIndex) => {
            const filled = SKELETON_SLOTS.filter(
              (cell) => cell.slotIndex === slot.index,
            );

            return [
              <div
                key={`time-${slot.index}`}
                style={{ gridRow: rowIndex + 2, gridColumn: 1 }}
                className="m-1 flex items-start justify-end pr-1"
              >
                <Skeleton className="h-3 w-11" />
              </div>,

              ...DAY_PATTERN_OPTIONS.map((dayPattern, columnIndex) =>
                filled.some((cell) => cell.columnIndex === columnIndex) ? (
                  <Skeleton
                    key={`${dayPattern}-${slot.index}`}
                    style={{
                      gridRow: rowIndex + 2,
                      gridColumn: columnIndex + 2,
                    }}
                    className="m-1 size-auto rounded-lg bg-schedule-card"
                  />
                ) : null,
              ),
            ];
          })}
        </div>
      </div>
    </div>
  );
}
