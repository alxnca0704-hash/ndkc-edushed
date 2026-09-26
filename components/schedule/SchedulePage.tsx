"use client";

import { CalendarClock, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { ScheduleGenerationError } from "@/components/schedule/ScheduleGenerationError";
import { ScheduleGroupSelector } from "@/components/schedule/ScheduleGroupSelector";
import { ScheduleGroupSelectorSkeleton } from "@/components/schedule/ScheduleGroupSelectorSkeleton";
import { ScheduleTable } from "@/components/schedule/ScheduleTable";
import { ScheduleTableSkeleton } from "@/components/schedule/ScheduleTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { useSchedule } from "@/hooks/useSchedule";

export function SchedulePage() {
  const {
    groups,
    activeKey,
    activeGroup,
    selectGroup,
    isLoading,
    isEmpty,
    error,
    isGenerating,
    generateError,
    infeasibleSubjects,
    generate,
  } = useSchedule();

  function handleLoadErrorRetry() {
    window.location.reload();
  }

  async function handleGenerate() {
    const result = await generate();
    if (result.ok) {
      toast.success(
        `Schedule generated — ${result.count} ${
          result.count === 1 ? "class" : "classes"
        } placed.`,
      );
    } else {
      toast.error("Couldn't generate a schedule");
    }
  }

  const activeSessions = activeGroup?.sessions ?? [];

  const renderContent = () => {
    if (isLoading) {
      return <ScheduleTableSkeleton />;
    }

    if (error) {
      return (
        <ErrorState
          title="Couldn't load the schedule"
          message={error}
          onRetry={handleLoadErrorRetry}
        />
      );
    }

    if (generateError) {
      if (infeasibleSubjects && infeasibleSubjects.length > 0) {
        return (
          <ScheduleGenerationError
            summary={generateError}
            reasons={infeasibleSubjects}
            onRetry={handleGenerate}
            isRetrying={isGenerating}
          />
        );
      }
      return (
        <ErrorState
          title="Couldn't generate a schedule"
          message={generateError}
          onRetry={handleGenerate}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={WandSparkles}
          title="No schedule yet"
          description="Make sure rooms, subjects, and teacher availability are set up, then generate the timetable."
          action={
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : null}
              Generate Schedule
            </Button>
          }
        />
      );
    }

    if (activeSessions.length === 0) {
      const subjectCount = activeGroup?.subjectCount ?? 0;
      return (
        <EmptyState
          icon={CalendarClock}
          title={`No classes for ${activeGroup?.label ?? "this course and year"} yet`}
          description={`${subjectCount} ${
            subjectCount === 1 ? "subject has" : "subjects have"
          } no classes in the generated schedule. Generate the schedule to place them.`}
          action={
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : null}
              {isGenerating ? "Generating…" : "Generate Schedule"}
            </Button>
          }
        />
      );
    }

    return <ScheduleTable sessions={activeSessions} />;
  };

  const summary = isLoading
    ? "Loading the generated schedule…"
    : isEmpty
      ? "No subjects to schedule yet."
      : `${activeSessions.length} ${
          activeSessions.length === 1 ? "class" : "classes"
        } scheduled this week for ${activeGroup?.label ?? "this course and year"}.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Generate Schedule
        </h1>
        <p className="text-sm text-muted-foreground">
          Build a conflict-free timetable from rooms, subjects, and teacher
          availability, grouped by course and year level.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {isLoading ? (
          <ScheduleGroupSelectorSkeleton />
        ) : (
          <ScheduleGroupSelector
            groups={groups}
            value={activeKey}
            onValueChange={selectGroup}
          />
        )}
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          {isGenerating ? "Generating…" : "Generate Schedule"}
        </Button>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{summary}</p>

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>
    </div>
  );
}
