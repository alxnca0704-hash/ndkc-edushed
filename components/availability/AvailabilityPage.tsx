"use client";

import { useMemo, useState } from "react";
import { CalendarOff, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import { AvailabilityGridSkeleton } from "@/components/availability/AvailabilityGridSkeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import {
  AVAILABILITY_TIME_SLOTS,
  availabilityPatternKey,
} from "@/constants/availability";
import { DAY_PATTERN_OPTIONS, type DayPattern } from "@/constants/dayPatterns";
import { useAvailability } from "@/hooks/useAvailability";
import { errorMessage } from "@/lib/result";

function slotSetsEqual(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const key of a) {
    if (!b.has(key)) {
      return false;
    }
  }
  return true;
}

export function AvailabilityPage() {
  const { blockedSlots, isLoading, isEmpty, error, isSaving, save } =
    useAvailability();

  const [savedKeys, setSavedKeys] = useState<readonly string[]>(blockedSlots);
  const [draft, setDraft] = useState<ReadonlySet<string>>(
    () => new Set(blockedSlots),
  );

  if (savedKeys !== blockedSlots) {
    setSavedKeys(blockedSlots);
    setDraft(new Set(blockedSlots));
  }

  const savedSet = useMemo(() => new Set(savedKeys), [savedKeys]);
  const isDirty = !slotSetsEqual(draft, savedSet);

  function toggleSlot(dayPattern: DayPattern, timeSlotIndex: number) {
    const key = availabilityPatternKey(dayPattern, timeSlotIndex);
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function resetDraft() {
    setDraft(new Set(savedKeys));
  }

  async function handleSave() {
    try {
      await save([...draft]);
      toast.success("Availability saved");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function handleRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return <AvailabilityGridSkeleton />;
    }

    if (error) {
      return (
        <ErrorState
          title="Couldn't load your availability"
          message={error}
          onRetry={handleRetry}
        />
      );
    }

    return (
      <AvailabilityGrid
        blocked={draft}
        onToggle={toggleSlot}
        disabled={isSaving}
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Availability</h1>
        <p className="text-sm text-muted-foreground">
          Mark the weekly time slots when you&apos;re unavailable. Each block
          applies to both days of a schedule pair — Mon &amp; Wed (MW) or
          Tue &amp; Thu (TTh). The scheduler will avoid scheduling you then.
        </p>
      </div>

      {!isLoading && !error && isEmpty ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <CalendarOff className="size-4 shrink-0" />
          <span>
            No unavailable slots marked yet — toggle cells below to block time
            for a schedule pair.
          </span>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>

      {!isLoading && !error ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {draft.size} of{" "}
            {DAY_PATTERN_OPTIONS.length * AVAILABILITY_TIME_SLOTS.length}{" "}
            slots blocked
            {isDirty ? " (unsaved changes)" : ""}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={resetDraft}
              disabled={!isDirty || isSaving}
            >
              <RotateCcw />
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!isDirty || isSaving}>
              <Save />
              {isSaving ? "Saving…" : "Save availability"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}