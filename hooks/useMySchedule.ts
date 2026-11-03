"use client";

import { useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import {
  DAY_PATTERN_LABELS,
  DAY_PATTERN_OPTIONS,
  type DayPattern,
} from "@/constants/dayPatterns";
import { formatClock } from "@/constants/availability";
import { buildScheduleGrid, sortSessionsByWeek } from "@/lib/schedule";
import type { ScheduleGrid, ScheduleSession } from "@/types/schedule";

const EMPTY_SESSIONS: readonly ScheduleSession[] = [];
const EMPTY_GRID: ScheduleGrid = buildScheduleGrid(EMPTY_SESSIONS);
const ALL_FILTER = "all";

export interface ScheduleTimeOption {
  value: string;
  label: string;
}

export interface ScheduleRoomOption {
  value: string;
  label: string;
}

export interface MyScheduleFilters {
  search: string;
  day: "all" | DayPattern;
  time: string;
  room: string;
}

const INITIAL_FILTERS: MyScheduleFilters = {
  search: "",
  day: ALL_FILTER,
  time: ALL_FILTER,
  room: ALL_FILTER,
};

export interface UseMyScheduleResult {
  /** The signed-in teacher's generated rows in week order. */
  sessions: readonly ScheduleSession[];
  filteredSessions: readonly ScheduleSession[];
  filteredClassCount: number;
  filters: MyScheduleFilters;
  dayOptions: readonly { value: string; label: string }[];
  timeOptions: readonly ScheduleTimeOption[];
  roomOptions: readonly ScheduleRoomOption[];
  hasActiveFilters: boolean;
  setSearch: (search: string) => void;
  setDay: (day: MyScheduleFilters["day"]) => void;
  setTime: (time: string) => void;
  setRoom: (room: string) => void;
  clearFilters: () => void;
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

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const dayOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: "All days" },
      ...DAY_PATTERN_OPTIONS.map((day) => ({
        value: day,
        label: DAY_PATTERN_LABELS[day],
      })),
    ],
    [],
  );
  const timeOptions = useMemo(() => {
    const byTime = new Map<string, ScheduleTimeOption>();
    for (const session of sessions) {
      const value = `${session.startMinutes}-${session.endMinutes}`;
      byTime.set(value, {
        value,
        label: `${formatClock(session.startMinutes)} – ${formatClock(session.endMinutes)}`,
      });
    }
    return [
      { value: ALL_FILTER, label: "All times" },
      ...[...byTime.values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })),
    ];
  }, [sessions]);
  const roomOptions = useMemo(() => {
    const byRoom = new Map<string, ScheduleRoomOption>();
    for (const session of sessions) {
      byRoom.set(session.roomId, { value: session.roomId, label: session.roomName });
    }
    return [
      { value: ALL_FILTER, label: "All rooms" },
      ...[...byRoom.values()].sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (filters.day !== ALL_FILTER && session.dayPattern !== filters.day) {
        return false;
      }
      if (
        filters.time !== ALL_FILTER &&
        filters.time !== `${session.startMinutes}-${session.endMinutes}`
      ) {
        return false;
      }
      if (filters.room !== ALL_FILTER && session.roomId !== filters.room) {
        return false;
      }
      if (
        query &&
        ![
          session.subjectName,
          session.teacherName,
          session.roomName,
          session.courseName,
          session.courseCode,
        ].some((value) => value.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  }, [filters, sessions]);
  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.day !== ALL_FILTER ||
    filters.time !== ALL_FILTER ||
    filters.room !== ALL_FILTER;
  const filteredClassCount = useMemo(
    () =>
      new Set(
        filteredSessions.map((session) =>
          [
            session.subjectId,
            session.dayPattern,
            session.startMinutes,
            session.endMinutes,
            session.roomId,
          ].join(":"),
        ),
      ).size,
    [filteredSessions],
  );

  const setSearch = useCallback((search: string) => {
    setFilters((current) => ({ ...current, search }));
  }, []);
  const setDay = useCallback((day: MyScheduleFilters["day"]) => {
    setFilters((current) => ({ ...current, day }));
  }, []);
  const setTime = useCallback((time: string) => {
    setFilters((current) => ({ ...current, time }));
  }, []);
  const setRoom = useCallback((room: string) => {
    setFilters((current) => ({ ...current, room }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

  // Derived at render time, not through an effect: a regenerate reshuffles the
  // week without the page holding stale state.
  const grid = useMemo(
    () => (sessions.length === 0 ? EMPTY_GRID : buildScheduleGrid(sessions)),
    [sessions],
  );

  const isEmpty = !isLoading && !error && grid.sessionCount === 0;

  return {
    sessions,
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
    grid,
    subjectCount: grid.subjectCount,
    classCount: grid.classCount,
    sessionCount: grid.sessionCount,
    isLoading,
    isEmpty,
    error,
  };
}
