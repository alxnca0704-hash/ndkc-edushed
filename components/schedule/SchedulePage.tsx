"use client";

import { useState } from "react";
import { CalendarClock, Loader2, SlidersHorizontal, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { ScheduleGenerationError } from "@/components/schedule/ScheduleGenerationError";
import { ScheduleGrid } from "@/components/schedule/ScheduleGrid";
import { ScheduleGridSkeleton } from "@/components/schedule/ScheduleGridSkeleton";
import { ScheduleGroupSelector } from "@/components/schedule/ScheduleGroupSelector";
import { ScheduleGroupSelectorSkeleton } from "@/components/schedule/ScheduleGroupSelectorSkeleton";
import { SoftConstraintSettings } from "@/components/schedule/SoftConstraintSettings";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOFT_CONSTRAINT_LABELS } from "@/constants/scheduleSettings";
import { useSchedule } from "@/hooks/useSchedule";
import { useScheduleSettings } from "@/hooks/useScheduleSettings";

export function SchedulePage() {
  const {
    groups,
    activeKey,
    activeGroup,
    grid,
    selectGroup,
    isLoading,
    isEmpty,
    error,
    isGenerating,
    generateError,
    infeasibleSubjects,
    optimization,
    generate,
  } = useSchedule();

  const {
    settings,
    isLoading: isSettingsLoading,
    error: settingsError,
    isSaving,
    save: saveSettings,
  } = useScheduleSettings();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  function handleLoadErrorRetry() {
    window.location.reload();
  }

  async function handleGenerate() {
    const result = await generate();
    if (result.ok) {
      toast.success(
        `Schedule ${result.optimization ? "generated and optimized" : "generated"} — ${
          result.count
        } ${result.count === 1 ? "class" : "classes"} placed.`,
      );
    } else {
      toast.error("Couldn't generate a schedule");
    }
  }

  const activeSessions = activeGroup?.sessions ?? [];

  const renderContent = () => {
    if (isLoading) {
      return <ScheduleGridSkeleton />;
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

    return <ScheduleGrid grid={grid} />;
  };

  const summary = isLoading
    ? "Loading the generated schedule…"
    : isEmpty
      ? "No subjects to schedule yet."
      : // `classCount`, not the session count: a Mon+Wed pair is one class
        // drawn once in the MW column, and the number has to match the cards.
        `${grid.classCount} ${
          grid.classCount === 1 ? "class" : "classes"
        } scheduled this week for ${activeGroup?.label ?? "this course and year"}.`;

  // Only rendered when the GA actually ran — with every soft constraint off
  // there is no score, and printing a 0 or a dash would imply one.
  const optimizationLine = optimization ? (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Badge variant="secondary" className="tabular-nums">
        {optimization.fitness}
      </Badge>
      <span>
        Optimization score — lower is better
        {optimization.constraints.length > 0
          ? `, weighted by ${optimization.constraints
              .map((key) => SOFT_CONSTRAINT_LABELS[key])
              .join(", ")}`
          : ""}
        .
      </span>
    </p>
  ) : null;

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
        <div className="flex items-center gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setIsSettingsOpen(true)}
            disabled={isGenerating}
          >
            <SlidersHorizontal />
            Optimization
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {isGenerating ? "Generating…" : "Generate Schedule"}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-1">
        {optimizationLine}
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>

      {isSettingsOpen ? (
        <SoftConstraintSettings
          settings={settings}
          isLoading={isSettingsLoading}
          error={settingsError}
          isSaving={isSaving}
          onSave={saveSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
