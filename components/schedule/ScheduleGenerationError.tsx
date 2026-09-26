"use client";

import { Loader2, RotateCw } from "lucide-react";

import { ConflictAlert } from "@/components/schedule/ConflictAlert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InfeasibleSubject } from "@/types/schedule";

export interface ScheduleGenerationErrorProps {
  title?: string;
  summary: string;
  reasons: readonly InfeasibleSubject[];
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

/**
 * Region shown when generation failed. Each unplaceable subject gets its own
 * `ConflictAlert`; when several subjects fail the list collapses into an
 * accordion (first subject open) so the page never becomes a wall of alerts.
 */
export function ScheduleGenerationError({
  title = "Couldn't generate a schedule",
  summary,
  reasons,
  onRetry,
  isRetrying = false,
  className,
}: ScheduleGenerationErrorProps) {
  const firstValue =
    reasons.length > 0 ? `${reasons[0].subjectName}-0` : "";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4 rounded-xl bg-muted/30 px-4 py-6 sm:px-6",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>

      {reasons.length === 1 ? (
        <ConflictAlert reason={reasons[0]} />
      ) : reasons.length > 1 ? (
        <Accordion multiple defaultValue={[firstValue]} className="w-full">
          {reasons.map((reason, index) => {
            const value = `${reason.subjectName}-${index}`;
            return (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="truncate">{reason.subjectName}</span>
                    <span className="text-xs text-muted-foreground">
                      {reason.durationMinutes} min
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Both patterns blocked
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ConflictAlert reason={reason} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : null}

      {onRetry ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCw />}
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
