"use client";

import { useAction, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import { SUBJECT_YEAR_LEVEL_LABELS } from "@/constants/courses";
import { sortSessionsByWeek } from "@/lib/schedule";
import type { SubjectYearLevel } from "@/types/course";
import type { OptimizationResult } from "@/types/scheduleSettings";
import type {
  GenerateScheduleResult,
  GroupedSchedule,
  InfeasibleSubject,
  ScheduleSession,
} from "@/types/schedule";

export interface UseScheduleResult {
  groups: GroupedSchedule[];
  activeKey: string | null;
  activeGroup: GroupedSchedule | null;
  selectGroup: (key: string) => void;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isGenerating: boolean;
  generateError: string | null;
  infeasibleSubjects: InfeasibleSubject[] | null;
  /**
   * Fitness of the schedule currently on screen. Only set by a generation that
   * actually ran the GA, and cleared when a new generation starts — it describes
   * one specific run, not the schedule table.
   */
  optimization: OptimizationResult | null;
  generate: () => Promise<GenerateScheduleResult>;
}

function groupKey(courseId: string, year: SubjectYearLevel): string {
  return `${courseId}-${year}`;
}

function groupLabel(courseCode: string, year: SubjectYearLevel): string {
  return `${courseCode} – ${SUBJECT_YEAR_LEVEL_LABELS[year]}`;
}

function byCourseThenYear(a: GroupedSchedule, b: GroupedSchedule): number {
  return (
    a.courseName.localeCompare(b.courseName) ||
    a.courseCode.localeCompare(b.courseCode) ||
    a.year - b.year
  );
}

export function useSchedule(): UseScheduleResult {
  const listQuery = useQuery(api.schedule.listAll);
  const subjectsQuery = useQuery(api.subjects.listAll);
  const generateAction = useAction(api.schedule.generate);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [infeasibleSubjects, setInfeasibleSubjects] = useState<
    InfeasibleSubject[] | null
  >(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(
    null,
  );
  const [preferredKey, setPreferredKey] = useState<string | null>(null);

  const isLoading = listQuery === undefined || subjectsQuery === undefined;
  const error =
    (listQuery?.ok === false ? listQuery.error : null) ??
    (subjectsQuery?.ok === false ? subjectsQuery.error : null);

  const sessions = useMemo<ScheduleSession[]>(
    () => (listQuery?.ok ? sortSessionsByWeek(listQuery.data) : []),
    [listQuery],
  );

  const groups = useMemo<GroupedSchedule[]>(() => {
    const buckets = new Map<string, GroupedSchedule>();

    function emptyGroup(
      courseId: string,
      courseCode: string,
      courseName: string,
      year: SubjectYearLevel,
    ): GroupedSchedule {
      return {
        key: groupKey(courseId, year),
        courseId,
        courseCode,
        courseName,
        year,
        label: groupLabel(courseCode, year),
        subjectCount: 0,
        sessions: [],
      };
    }

    // Subjects come first: every Course + Year that has a subject must be
    // selectable even before a schedule is generated, and their (live) course
    // code/name is what the group is labelled with.
    for (const subject of subjectsQuery?.ok ? subjectsQuery.data : []) {
      const key = groupKey(subject.courseId, subject.year);
      const bucket =
        buckets.get(key) ??
        emptyGroup(
          subject.courseId,
          subject.courseCode,
          subject.courseName,
          subject.year,
        );
      bucket.subjectCount += 1;
      buckets.set(key, bucket);
    }

    // Sessions are grouped by the course/year snapshot written at generation
    // time, so a bucket can exist here that no longer matches a subject (e.g.
    // a subject reassigned to another course/year after generating).
    for (const session of sessions) {
      const key = groupKey(session.courseId, session.year);
      const bucket =
        buckets.get(key) ??
        emptyGroup(
          session.courseId,
          session.courseCode,
          session.courseName,
          session.year,
        );
      bucket.sessions.push(session);
      buckets.set(key, bucket);
    }

    return [...buckets.values()].sort(byCourseThenYear);
  }, [sessions, subjectsQuery]);

  // Resolved at render time instead of through an effect: a selection that no
  // longer exists (group removed, or nothing generated yet) falls back to the
  // first available group.
  const activeGroup =
    groups.find((group) => group.key === preferredKey) ?? groups[0] ?? null;
  const isEmpty = !isLoading && !error && groups.length === 0;

  const selectGroup = useCallback((key: string) => {
    setPreferredKey(key);
  }, []);

  const generate = useCallback(async (): Promise<GenerateScheduleResult> => {
    setIsGenerating(true);
    setGenerateError(null);
    setInfeasibleSubjects(null);
    // The score belongs to one generation, so a new one starts without it
    // rather than leaving the previous run's number next to the button.
    setOptimization(null);
    try {
      const result = await generateAction();
      if (!result.ok) {
        setGenerateError(result.error);
        if (result.infeasibleSubjects && result.infeasibleSubjects.length > 0) {
          setInfeasibleSubjects([...result.infeasibleSubjects]);
        }
      } else {
        setOptimization(result.optimization);
      }
      return result;
    } finally {
      setIsGenerating(false);
    }
  }, [generateAction]);

  return {
    groups,
    activeKey: activeGroup?.key ?? null,
    activeGroup,
    selectGroup,
    isLoading,
    isEmpty,
    error,
    isGenerating,
    generateError,
    infeasibleSubjects,
    optimization,
    generate,
  };
}
