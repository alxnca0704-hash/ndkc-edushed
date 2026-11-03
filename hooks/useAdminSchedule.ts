"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
import type {
  CompiledScheduleSession,
  CspResolutionResult,
  ScheduleConflict,
} from "@/types/adminSchedule";

export interface UseAdminScheduleResult {
  sessions: CompiledScheduleSession[];
  conflicts: ScheduleConflict[];
  departments: { id: string; name: string; code: string }[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isResolving: boolean;
  isSimulating: boolean;
  lastResult: CspResolutionResult | null;
  resolveConflicts: () => Promise<CspResolutionResult>;
  simulateConflict: () => Promise<void>;
}

export function useAdminSchedule(): UseAdminScheduleResult {
  const compiledQuery = useQuery(api.schedule.listCompiled);
  const resolveAction = useAction(api.schedule.compileAndResolveConflicts);
  const simulateMutation = useMutation(
    api.schedule.simulateCrossDepartmentConflict,
  );

  const [isResolving, setIsResolving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastResult, setLastResult] = useState<CspResolutionResult | null>(null);

  const isLoading = compiledQuery === undefined;
  const error = compiledQuery?.ok === false ? compiledQuery.error : null;

  const sessions = (compiledQuery?.ok ? compiledQuery.data.sessions : []) as CompiledScheduleSession[];
  const conflicts = (compiledQuery?.ok ? compiledQuery.data.conflicts : []) as ScheduleConflict[];
  const departments = compiledQuery?.ok ? compiledQuery.data.departments : [];

  const isEmpty = !isLoading && !error && sessions.length === 0;

  const resolveConflicts = useCallback(async (): Promise<CspResolutionResult> => {
    setIsResolving(true);
    try {
      const res = await resolveAction({});
      const result: CspResolutionResult = {
        ok: res.ok,
        resolved: res.resolved,
        message: res.message,
        movedCount: res.movedCount,
        stats: res.stats,
      };
      setLastResult(result);
      return result;
    } finally {
      setIsResolving(false);
    }
  }, [resolveAction]);

  const simulateConflict = useCallback(async (): Promise<void> => {
    setIsSimulating(true);
    try {
      await simulateMutation({});
    } finally {
      setIsSimulating(false);
    }
  }, [simulateMutation]);

  return {
    sessions,
    conflicts,
    departments,
    isLoading,
    isEmpty,
    error,
    isResolving,
    isSimulating,
    lastResult,
    resolveConflicts,
    simulateConflict,
  };
}
