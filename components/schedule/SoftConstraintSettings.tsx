"use client";

import { useId, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  SOFT_CONSTRAINT_DESCRIPTIONS,
  SOFT_CONSTRAINT_KEYS,
  SOFT_CONSTRAINT_LABELS,
  SOFT_CONSTRAINT_MAX_WEIGHT,
  SOFT_CONSTRAINT_MIN_WEIGHT,
} from "@/constants/scheduleSettings";
import { errorMessage } from "@/lib/result";
import type {
  ScheduleSettings,
  SoftConstraintKey,
} from "@/types/scheduleSettings";

export interface SoftConstraintSettingsProps {
  settings: ScheduleSettings;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  onSave: (settings: ScheduleSettings) => Promise<void>;
  onClose: () => void;
}

function RowSkeleton() {
  return (
    <div className="rounded-lg bg-muted/40 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full max-w-72" />
        </div>
        <Skeleton className="h-[18px] w-8 shrink-0 rounded-full" />
      </div>
    </div>
  );
}

/**
 * The Dean's soft-constraint configuration. Every row switches one constraint
 * on or off and, while it is on, sets how much it counts (0–10). A weight of 0
 * is treated as "off" by the generator, so the switch stays the single source
 * of truth for whether a constraint applies.
 */
export function SoftConstraintSettings({
  settings,
  isLoading,
  error,
  isSaving,
  onSave,
  onClose,
}: SoftConstraintSettingsProps) {
  const formId = useId();
  const [saved, setSaved] = useState(settings);
  const [draft, setDraft] = useState(settings);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // A save (or another Dean's change) replaces the settings object, so re-sync
  // the draft from it during render rather than in an effect.
  if (saved !== settings) {
    setSaved(settings);
    setDraft(settings);
  }

  const isDirty = draft !== saved;

  function updateConstraint(
    key: SoftConstraintKey,
    patch: Partial<ScheduleSettings[SoftConstraintKey]>,
  ) {
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  async function handleSave() {
    setSubmitError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (saveError) {
      setSubmitError(errorMessage(saveError));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule optimization</DialogTitle>
          <DialogDescription>
            Soft constraints shape the generated timetable without ever breaking
            a hard rule. With every constraint off, the schedule is the plain
            conflict-free result.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid gap-3">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="grid gap-3">
            {SOFT_CONSTRAINT_KEYS.map((key) => {
              const constraint = draft[key];
              const switchId = `${formId}-${key}-switch`;
              const descriptionId = `${formId}-${key}-description`;
              const weightId = `${formId}-${key}-weight`;

              return (
                <div key={key} className="rounded-lg bg-muted/40 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <Label htmlFor={switchId} className="cursor-pointer">
                        {SOFT_CONSTRAINT_LABELS[key]}
                      </Label>
                      <p
                        id={descriptionId}
                        className="text-xs text-muted-foreground"
                      >
                        {SOFT_CONSTRAINT_DESCRIPTIONS[key]}
                      </p>
                    </div>
                    <Switch
                      id={switchId}
                      checked={constraint.enabled}
                      onCheckedChange={(checked) =>
                        updateConstraint(key, { enabled: checked })
                      }
                      aria-describedby={descriptionId}
                      disabled={isSaving}
                      className="mt-0.5"
                    />
                  </div>

                  {constraint.enabled ? (
                    <div className="mt-3 flex items-center gap-3">
                      <span
                        id={weightId}
                        className="text-xs text-muted-foreground"
                      >
                        Weight
                      </span>
                      <Slider
                        value={constraint.weight}
                        min={SOFT_CONSTRAINT_MIN_WEIGHT}
                        max={SOFT_CONSTRAINT_MAX_WEIGHT}
                        step={1}
                        onValueChange={(value) =>
                          // The primitive types its callback as a range, but a
                          // single-thumb slider always reports a number.
                          updateConstraint(key, {
                            weight: typeof value === "number" ? value : value[0],
                          })
                        }
                        aria-labelledby={weightId}
                        aria-describedby={descriptionId}
                        disabled={isSaving}
                        className="flex-1"
                      />
                      <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">
                        {constraint.weight}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || Boolean(error) || !isDirty || isSaving}
          >
            <Save />
            {isSaving ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
