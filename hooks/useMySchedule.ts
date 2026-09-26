"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { buildScheduleGrid, sortSessionsByWeek } from "@/lib/schedule";
import type { ScheduleGrid, ScheduleSession } from "@/types/schedule";

const EMPTY_SESSIONS: readonly ScheduleSession[] = [];
const EMPTY_GRID: ScheduleGrid = buildScheduleGrid(EMPTY_SESSIONS);

export interface UseMyScheduleResult {
  /**
   * This teacher's own week as a grid: a column per day pair, a row per time
   * block, each class spanning the slots it occupies. Derived entirely from the
   * generated rows, which already carry subject, teacher, room, course, year
   * and the chosen `dayPattern`, so nothing is joined here.
   */
  grid: ScheduleGrid;
  /** Distinct subjects across the week. */
  subjectCount: number;
  /** Cards the grid draws — one per class, not one per day it meets. */
  classCount: number;
  /** Placed sessions across the week — two per subject for a linked pair. */
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
  // week without the page holding stale state.
  const grid = useMemo(
    () => (sessions.length === 0 ? EMPTY_GRID : buildScheduleGrid(sessions)),
    [sessions],
  );

  const isEmpty = !isLoading && !error && grid.sessionCount === 0;

  return {
    grid,
    subjectCount: grid.subjectCount,
    classCount: grid.classCount,
    sessionCount: grid.sessionCount,
    isLoading,
    isEmpty,
    error,
  };
}
