"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
import { DEFAULT_SCHEDULE_SETTINGS } from "@/constants/scheduleSettings";
import type { ScheduleSettings } from "@/types/scheduleSettings";

export interface UseScheduleSettingsResult {
  settings: ScheduleSettings;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  save: (settings: ScheduleSettings) => Promise<void>;
}

export function useScheduleSettings(): UseScheduleSettingsResult {
  const settingsQuery = useQuery(api.scheduleSettings.get);
  const saveMutation = useMutation(api.scheduleSettings.save);

  const [isSaving, setIsSaving] = useState(false);

  const isLoading = settingsQuery === undefined;
  const error = settingsQuery?.ok === false ? settingsQuery.error : null;
  // The defaults are also the query's own fallback, so an unsaved record and a
  // record that was never written behave identically.
  const settings = settingsQuery?.ok
    ? settingsQuery.data
    : DEFAULT_SCHEDULE_SETTINGS;

  const save = useCallback(
    async (next: ScheduleSettings) => {
      setIsSaving(true);
      try {
        await saveMutation(next);
      } finally {
        setIsSaving(false);
      }
    },
    [saveMutation],
  );

  return { settings, isLoading, error, isSaving, save };
}
