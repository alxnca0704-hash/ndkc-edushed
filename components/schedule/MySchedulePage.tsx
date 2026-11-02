"use client";

import { CalendarRange, Search } from "lucide-react";

import {
  ScheduleTable,
  ScheduleTableSkeleton,
} from "@/components/schedule/ScheduleTable";
import { MyScheduleFilters } from "@/components/schedule/MyScheduleFilters";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useMySchedule } from "@/hooks/useMySchedule";

/**
 * Read-only "My Schedule" view: only the signed-in teacher's own sessions,
 * arranged by time and day pair. Editing is Dean-only, so there are no actions
 * here — the empty state tells the teacher who to wait for instead of offering
 * a button they can't use. It uses the same responsive table as the Dean view,
 * scoped to the signed-in teacher's own generated rows.
 */
export function MySchedulePage() {
  const {
    filteredSessions,
    filteredClassCount,
    filters,
    dayOptions,
    timeOptions,
    roomOptions,
    hasActiveFilters,
    setSearch,
    setDay,
    setTime,
    setRoom,
    clearFilters,
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
      return <ScheduleTableSkeleton />;
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

    if (filteredSessions.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <MyScheduleFilters
            filters={filters}
            dayOptions={dayOptions}
            timeOptions={timeOptions}
            roomOptions={roomOptions}
            hasActiveFilters={hasActiveFilters}
            onSearchChange={setSearch}
            onDayChange={setDay}
            onTimeChange={setTime}
            onRoomChange={setRoom}
            onClear={clearFilters}
          />
          <EmptyState
            icon={Search}
            title="No matching classes"
            description="Try another search or change your filters."
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {hasActiveFilters ? (
          <p className="text-sm text-muted-foreground">
            Showing {filteredClassCount} of {classCount} classes this week.
          </p>
        ) : null}
        <MyScheduleFilters
          filters={filters}
          dayOptions={dayOptions}
          timeOptions={timeOptions}
          roomOptions={roomOptions}
          hasActiveFilters={hasActiveFilters}
          onSearchChange={setSearch}
          onDayChange={setDay}
          onTimeChange={setTime}
          onRoomChange={setRoom}
          onClear={clearFilters}
        />
        <ScheduleTable sessions={filteredSessions} />
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
