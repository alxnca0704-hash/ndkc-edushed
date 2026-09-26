"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { groupSessionsByDayPattern, sortSessionsByWeek } from "@/lib/schedule";
import type { MyScheduleGroup, ScheduleSession } from "@/types/schedule";

const EMPTY_SESSIONS: readonly ScheduleSession[] = [];

export interface UseMyScheduleResult {
  /**
   * This teacher's own sessions grouped by day pattern (MW, then TTh), each
   * group's rows in week order with a subject's linked pair collapsed into one
   * line. Every field the table shows is already denormalized onto the
   * generated row, so nothing is joined here.
   */
  groups: readonly MyScheduleGroup[];
  /** Distinct subjects across the groups. */
  subjectCount: number;
  /** Placed sessions across the groups — two per subject for a linked pair. */
  sessionCount: number;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
}

export function useMySchedule(): UseMyScheduleResult {
  // The query resolves the teacher from the caller's Clerk identity on the
  // server, so there is no user id to read on the client and no way to ask for
  // someone else's rows.
  const mineQuery = useQuery(api.schedule.listMine);

  const isLoading = mineQuery === undefined;
  const error = mineQuery?.ok === false ? mineQuery.error : null;

  const sessions = useMemo(
    () => (mineQuery?.ok ? sortSessionsByWeek(mineQuery.data) : EMPTY_SESSIONS),
    [mineQuery],
  );

  // Derived at render time, not through an effect: a regenerate reshuffles the
  // groups without the page holding stale state.
  const groups = useMemo(() => groupSessionsByDayPattern(sessions), [sessions]);

  const isEmpty = !isLoading && !error && groups.length === 0;

  return {
    groups,
    subjectCount: groups.reduce((total, group) => total + group.rows.length, 0),
    sessionCount: sessions.length,
    isLoading,
    isEmpty,
    error,
  };
}
