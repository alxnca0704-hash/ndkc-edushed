"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";

const EMPTY_BLOCKED: readonly string[] = [];

export interface UseAvailabilityResult {
  blockedSlots: readonly string[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isSaving: boolean;
  save: (blockedSlots: readonly string[]) => Promise<void>;
}

export function useAvailability(): UseAvailabilityResult {
  const availabilityQuery = useQuery(api.availability.getMine);
  const saveMutation = useMutation(api.availability.setMine);

  const [isSaving, setIsSaving] = useState(false);

  const isLoading = availabilityQuery === undefined;
  const error =
    availabilityQuery?.ok === false ? availabilityQuery.error : null;

  const blockedSlots = availabilityQuery?.ok
    ? availabilityQuery.data
    : EMPTY_BLOCKED;
  const isEmpty = !isLoading && !error && blockedSlots.length === 0;

  const save = useCallback(
    async (keys: readonly string[]) => {
      setIsSaving(true);
      try {
        await saveMutation({ blockedSlots: [...new Set(keys)] });
      } finally {
        setIsSaving(false);
      }
    },
    [saveMutation],
  );

  return {
    blockedSlots,
    isLoading,
    isEmpty,
    error,
    isSaving,
    save,
  };
}