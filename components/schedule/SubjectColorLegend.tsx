"use client";

import { subjectPaletteClasses } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";
import type { ScheduleGridSubject } from "@/types/schedule";

export interface SubjectColorLegendProps {
  /** Exactly the subjects the grid above it draws — see `ScheduleGrid.subjects`. */
  subjects: readonly ScheduleGridSubject[];
  className?: string;
}

/**
 * The schedule's color key: one swatch per subject, in the color its classes are
 * drawn in.
 *
 * Both views render it, and both feed it the same field, so the swatch next to a
 * name is the color that name has on the grid below — there is no second
 * mapping to drift out of step. The Dean's copy lists the subjects in the
 * selected Course + Year; the Teacher's lists their own, because each hook
 * builds its grid from only the sessions that view may see.
 *
 * The subject name is text next to the swatch, never color alone, so the legend
 * still works for a reader who cannot separate two muted hues.
 */
export function SubjectColorLegend({
  subjects,
  className,
}: SubjectColorLegendProps) {
  if (subjects.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="Subjects in this schedule"
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}
    >
      {subjects.map((subject) => (
        <li key={subject.id} className="flex items-center gap-1.5 text-xs">
          <span
            aria-hidden="true"
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              subjectPaletteClasses(subject.color).dot,
            )}
          />
          <span className="font-medium text-foreground">{subject.name}</span>
          <span className="text-muted-foreground tabular-nums">
            {subject.classCount} {subject.classCount === 1 ? "class" : "classes"}
          </span>
        </li>
      ))}
    </ul>
  );
}
