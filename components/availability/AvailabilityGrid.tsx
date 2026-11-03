"use client";

import { Fragment } from "react";

import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AVAILABILITY_TIME_SLOTS,
  areaPatternLabel,
  availabilityPatternKey,
} from "@/constants/availability";
import {
  DAY_PATTERN_OPTIONS,
  type DayPattern,
} from "@/constants/dayPatterns";
import { cn } from "@/lib/utils";

export interface AvailabilityGridProps {
  blocked: ReadonlySet<string>;
  onToggle: (dayPattern: DayPattern, timeSlotIndex: number) => void;
  disabled?: boolean;
}

export function AvailabilityGrid({
  blocked,
  onToggle,
  disabled = false,
}: AvailabilityGridProps) {
  return (
    <TooltipProvider delay={0}>
      <div className="overflow-x-auto">
        <div
          role="grid"
          aria-label="Weekly availability by schedule pattern"
          className="grid min-w-[24rem] grid-cols-[3.25rem_repeat(2,minmax(7rem,1fr))] gap-1.5"
        >
          <div aria-hidden="true" className="h-8" />
          {DAY_PATTERN_OPTIONS.map((dayPattern) => (
            <div
              key={dayPattern}
              className="flex flex-col items-center justify-center gap-0.5"
            >
              <span className="text-xs font-medium text-foreground">
                {areaPatternLabel(dayPattern)}
              </span>
              <span className="text-[0.6875rem] text-muted-foreground">
                {dayPattern}
              </span>
            </div>
          ))}

          {AVAILABILITY_TIME_SLOTS.map((slot) => (
            <Fragment key={slot.index}>
              <div
                role="rowheader"
                className="flex items-center justify-end pr-1 text-xs text-muted-foreground"
              >
                {slot.label}
              </div>
              {DAY_PATTERN_OPTIONS.map((dayPattern) => {
                const key = availabilityPatternKey(dayPattern, slot.index);
                const isBlocked = blocked.has(key);
                const patternLabel = areaPatternLabel(dayPattern);

                return (
                  <Tooltip key={key}>
                    <TooltipTrigger
                      render={
                        <Toggle
                          pressed={isBlocked}
                          onPressedChange={() =>
                            onToggle(dayPattern, slot.index)
                          }
                          aria-label={`${patternLabel} ${slot.rangeLabel}${
                            isBlocked
                              ? ", unavailable"
                              : ", available"
                          }`}
                          variant="outline"
                          disabled={disabled}
                          className={cn(
                            "h-9 w-full rounded-md",
                            isBlocked
                              ? "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90 aria-pressed:bg-destructive"
                              : "border-border bg-background hover:bg-muted",
                          )}
                        />
                      }
                    />
                    <TooltipContent>
                      {patternLabel} {slot.rangeLabel}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}