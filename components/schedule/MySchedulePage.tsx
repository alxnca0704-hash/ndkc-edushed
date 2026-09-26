"use client";

import { CalendarRange } from "lucide-react";

import { ScheduleGrid } from "@/components/schedule/ScheduleGrid";
import { ScheduleGridSkeleton } from "@/components/schedule/ScheduleGridSkeleton";
import { SubjectColorLegend } from "@/components/schedule/SubjectColorLegend";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useMySchedule } from "@/hooks/useMySchedule";

/**
 * Read-only "My Schedule" view: only the signed-in teacher's own sessions,
 * arranged by time and day pair. Editing is Dean-only, so there are no actions
 * here — the empty state tells the teacher who to wait for instead of offering
 * a button they can't use. The legend lists only this teacher's own subjects,
 * because the grid it sits above is built from the same rows.
 */
export function MySchedulePage() {
  const {
    grid,
    subjectCount,
    classCount,
    isLoading,
    isEmpty,
    error,
  } = useMySchedule();

  function handleRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return <ScheduleGridSkeleton />;
    }

    if (error) {
      return (
        <ErrorState
          title="Couldn't load your schedule"
          message={error}
          onRetry={handleRetry}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={CalendarRange}
          title="No classes assigned yet"
          description="The Dean hasn't generated a schedule yet, or nothing is assigned to you. Your classes appear here as soon as the schedule is generated."
        />
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <SubjectColorLegend subjects={grid.subjects} />
        <ScheduleGrid grid={grid} />
      </div>
    );
  };

  const summary = isLoading
    ? "Loading your schedule…"
    : isEmpty
      ? "No classes assigned to you yet."
      : `${subjectCount} ${
          subjectCount === 1 ? "subject" : "subjects"
        } · ${classCount} ${
          classCount === 1 ? "class" : "classes"
        } this week, arranged by day pair and time.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">My Schedule</h1>
        <p className="text-sm text-muted-foreground">
          The classes assigned to you in the generated schedule, arranged by time
          and by the days they meet on.
        </p>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{summary}</p>

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>
    </div>
  );
}
