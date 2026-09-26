"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatClock } from "@/constants/availability";
import { scheduleGridBlockWidth, scheduleGridTracks } from "@/lib/schedule";
import { subjectPaletteClasses } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";
import type {
  ScheduleGrid as ScheduleGridModel,
  ScheduleGridBlock,
} from "@/types/schedule";

export interface ScheduleGridProps {
  grid: ScheduleGridModel;
  className?: string;
}

function timeRange(block: ScheduleGridBlock): string {
  return `${formatClock(block.startMinutes)} – ${formatClock(block.endMinutes)}`;
}

function ariaLabel(block: ScheduleGridBlock): string {
  return `${block.subjectName}, ${block.teacherName}, ${block.roomName}, ${timeRange(block)}`;
}

/**
 * Read-only timetable: a column per day pair (MW, then TTh), a row per
 * school-hour time block, and a class spanning the rows it occupies.
 *
 * The grid is a regular matrix of equal boxes. Both day pairs always get the
 * same number of lanes — the widest one the week needs — and every row is
 * `--schedule-row-height`, so a block's footprint is its duration in hours by a
 * fixed cell size, and MW and TTh are always the same width. Lanes only ever
 * appear when two classes genuinely overlap, which after the course/year hard
 * constraint means two different courses (or years) at once; a week with no
 * overlaps is simply two equal columns.
 *
 * Blocks are colored by **subject**, not by teacher and not by a flat green: the
 * palette is the schedule's one identity system, and a subject's color is the
 * same token on the Dean's card and the Teacher's, because both read the one
 * `subjectColor` field the generated row already carries. The cards are lifted
 * off the column with a shadow, so a card keeps a readable edge against whatever
 * color it is without a border around every cell, and the day-pair wash and hour
 * rules behind them stay neutral so they never compete with the colors they sit
 * under. The legend in `SubjectColorLegend` is the key, and the subject name is
 * printed on the card and in the tooltip, so color is never the only channel.
 *
 * The header, the three background layers and the body are one grid, not
 * several stacked ones, so a time label cannot drift out of line with the
 * column header above it, and a block spanning rows and lanes is positioned in
 * the same coordinate space as everything else.
 *
 * Deliberately inert: no drag, no editing. Manual schedule editing is Out of
 * Scope in `project-overview.md` and conflict validation belongs to the engine
 * (Invariant 5), so a cell is a readout, not a target.
 */
export function ScheduleGrid({ grid, className }: ScheduleGridProps) {
  const { templateColumns, offsets, laneCount } = scheduleGridTracks(grid.columns);

  return (
    <TooltipProvider delay={0}>
      <div className={cn("flex flex-col gap-3", className)}>
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 p-2">
          <div
            role="grid"
            aria-label="Weekly timetable by day pair and time"
            className="grid"
            style={{
              gridTemplateColumns: templateColumns,
              // Row 1 is the header; each time block after it is one fixed
              // height, so a block spanning three of them is exactly three tall.
              gridTemplateRows: `auto repeat(${grid.rows.length}, var(--schedule-row-height))`,
              // No row gap: blocks carry their own margin, so the row pitch
              // stays exactly `--schedule-row-height` and the vertical rhythm
              // is identical whether a cell holds a 1-hour class or nothing.
              columnGap: "0.5rem",
              rowGap: 0,
            }}
          >
            {/* Painted first so everything after it — header, rules, blocks —
                lands on top of these three layers. They are grid items in their
                own cells rather than an absolutely-positioned backdrop, so they
                track the track layout instead of guessing at it. */}
            {grid.columns.map((column, columnIndex) => (
              <div
                key={`column-${column.dayPattern}`}
                aria-hidden="true"
                style={{
                  gridRow: `1 / -1`,
                  gridColumn: `${offsets[columnIndex]} / span ${laneCount}`,
                }}
                className="rounded-lg bg-schedule-column"
              />
            ))}

            {grid.rows.map((row, rowIndex) => (
              <div
                key={`rule-${row.slot.index}`}
                aria-hidden="true"
                style={{
                  gridRow: rowIndex + 2,
                  gridColumn: `2 / -1`,
                }}
                className="border-t border-schedule-rule/70"
              />
            ))}

            <div aria-hidden="true" className="h-8" />

            {grid.columns.map((column, columnIndex) => (
              <div
                key={column.dayPattern}
                role="columnheader"
                style={{
                  gridRow: 1,
                  gridColumn: `${offsets[columnIndex]} / span ${laneCount}`,
                }}
                className="flex flex-col items-center justify-center gap-0.5 pb-1 text-center"
              >
                <span className="text-xs font-medium text-foreground">
                  {column.label}
                </span>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {column.dayPattern}
                </span>
              </div>
            ))}

            {grid.rows.flatMap((row, rowIndex) => [
              <div
                key={`time-${row.slot.index}`}
                role="rowheader"
                style={{ gridRow: rowIndex + 2, gridColumn: 1 }}
                // `m-1` and `items-start` put the label's cap height on the same
                // line as the top edge of a block in this row, rather than
                // floating between two of them.
                className="m-1 flex items-start justify-end pr-1 text-xs tabular-nums text-muted-foreground"
              >
                {row.slot.label}
              </div>,

              ...row.blocks.map((block) => {
                // One lane per block; only a block alone in its cluster takes
                // its day pair's full width. See `scheduleGridBlockWidth`.
                const width = scheduleGridBlockWidth(block, laneCount);
                // One lookup per block, off the same token the legend reads, so a
                // card and its swatch cannot disagree.
                const palette = subjectPaletteClasses(block.subjectColor);

                return (
                  <Tooltip key={block.key}>
                    <TooltipTrigger
                      style={{
                        gridRow: `${block.startSlot + 2} / span ${block.span}`,
                        gridColumn: `${
                          offsets[block.columnIndex] + block.lane
                        } / span ${width}`,
                      }}
                      aria-label={ariaLabel(block)}
                      className={cn(
                        "m-1 flex flex-col items-start gap-0.5 overflow-hidden rounded-lg p-1.5 text-left shadow-sm transition-shadow hover:shadow-md",
                        palette.card,
                      )}
                    >
                      <span className="truncate text-xs font-medium sm:text-sm">
                        {block.subjectName}
                      </span>
                      <span
                        className={cn(
                          "truncate text-[0.6875rem] sm:text-xs",
                          palette.muted,
                        )}
                      >
                        {block.teacherName}
                      </span>
                      {/* A single-slot block only has room for two lines, so the
                          room is left to the tooltip and the aria-label rather
                          than clipped to a sliver. Taller blocks show it. */}
                      {block.span > 1 ? (
                        <span
                          className={cn(
                            "truncate text-[0.6875rem] sm:text-xs",
                            palette.muted,
                          )}
                        >
                          {block.roomName}
                        </span>
                      ) : null}
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-medium">{block.subjectName}</span>
                      <span>{block.teacherName}</span>
                      <span>{block.roomName}</span>
                      <span className="tabular-nums">{timeRange(block)}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              }),
            ])}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
