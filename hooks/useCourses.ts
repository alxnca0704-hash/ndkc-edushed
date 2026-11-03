"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Course, CourseFormValues } from "@/types/course";

export interface UseCoursesResult {
  courses: Course[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isMutating: boolean;
  addCourse: (values: CourseFormValues) => Promise<void>;
  updateCourse: (id: string, values: CourseFormValues) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
}

export function useCourses(): UseCoursesResult {
  const listQuery = useQuery(api.courses.listAll);
  const addCourseMutation = useMutation(api.courses.create);
  const updateCourseMutation = useMutation(api.courses.update);
  const deleteCourseMutation = useMutation(api.courses.remove);

  const [isMutating, setIsMutating] = useState(false);

  const isLoading = listQuery === undefined;
  const error = listQuery?.ok === false ? listQuery.error : null;

  const courses = listQuery?.ok ? listQuery.data : [];
  const isEmpty = !isLoading && !error && courses.length === 0;

  const addCourse = useCallback(
    async (values: CourseFormValues) => {
      setIsMutating(true);
      try {
        await addCourseMutation(values);
      } finally {
        setIsMutating(false);
      }
    },
    [addCourseMutation],
  );

  const updateCourse = useCallback(
    async (id: string, values: CourseFormValues) => {
      setIsMutating(true);
      try {
        await updateCourseMutation({ id: id as Id<"courses">, ...values });
      } finally {
        setIsMutating(false);
      }
    },
    [updateCourseMutation],
  );

  const deleteCourse = useCallback(
    async (id: string) => {
      setIsMutating(true);
      try {
        await deleteCourseMutation({ id: id as Id<"courses"> });
      } finally {
        setIsMutating(false);
      }
    },
    [deleteCourseMutation],
  );

  return {
    courses,
    isLoading,
    isEmpty,
    error,
    isMutating,
    addCourse,
    updateCourse,
    deleteCourse,
  };
}
