"use client";

import type { LucideIcon } from "lucide-react";
import {
  CalendarX,
  DoorClosed,
  Layers,
  TriangleAlert,
  UserX,
  UsersRound,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DAY_PATTERNS } from "@/constants/dayPatterns";
import { cn } from "@/lib/utils";
import type {
  ConflictFact,
  ConflictKind,
  InfeasiblePattern,
  InfeasibleSubject,
} from "@/types/schedule";

const CONFLICT_ICONS: Record<ConflictKind, LucideIcon> = {
  "room-occupied": DoorClosed,
  "teacher-unavailable": UserX,
  "no-shared-window": CalendarX,
  "course-year-conflict": UsersRound,
  "arrangement-conflict": Layers,
};

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  "room-occupied": "Room occupied",
  "teacher-unavailable": "Teacher unavailable",
  "no-shared-window": "No shared window",
  "course-year-conflict": "Course & year clash",
  "arrangement-conflict": "Placement conflict",
};

function ConflictFacts({ facts }: { facts: readonly ConflictFact[] }) {
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      {facts.map((conflictFact, index) => (
        <div key={`${conflictFact.label}-${index}`} className="contents">
          <dt className="text-muted-foreground">{conflictFact.label}</dt>
          <dd className="min-w-0 text-foreground">{conflictFact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PatternConflict({ pattern }: { pattern: InfeasiblePattern }) {
  const Icon = CONFLICT_ICONS[pattern.conflict.kind];
  const days = DAY_PATTERNS[pattern.dayPattern];

  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{pattern.dayPattern}</Badge>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {CONFLICT_LABELS[pattern.conflict.kind]}
        </span>
        <span className="text-xs text-muted-foreground">
          {days.join(" & ")}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium text-foreground">
        {pattern.conflict.title}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {pattern.conflict.message}
      </div>
      <ConflictFacts facts={pattern.conflict.facts} />
    </div>
  );
}

export interface ConflictAlertProps {
  /** One subject's diagnostic, as produced by `explainInfeasibility`. */
  reason: InfeasibleSubject;
  /** `destructive` for a failure; `default` for a resolved/non-blocking notice. */
  variant?: "default" | "destructive";
  className?: string;
}

/**
 * Explains, in one alert, why a subject could not be scheduled: the cause per
 * day pattern plus the concrete room / teacher / time the engine reported. All
 * wording comes from the engine's `ConflictDetail` — this component only maps
 * the conflict kind to an icon and a label.
 */
export function ConflictAlert({
  reason,
  variant = "destructive",
  className,
}: ConflictAlertProps) {
  return (
    <Alert variant={variant} className={cn("gap-2 px-3 py-3", className)}>
      <TriangleAlert className="size-4" />
      <AlertTitle>Couldn&apos;t place {reason.subjectName}</AlertTitle>
      <AlertDescription>
        <div className="text-sm text-muted-foreground">
          {reason.durationMinutes} min · no day pattern works for this subject
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {reason.patterns.map((pattern) => (
            <PatternConflict key={pattern.dayPattern} pattern={pattern} />
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
