"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  SubjectFormValues,
  SubjectListItem,
  TeacherOption,
} from "@/types/subjects";
import type { Room } from "@/types/rooms";
import type { Course } from "@/types/course";

export interface UseSubjectsResult {
  subjects: SubjectListItem[];
  teachers: TeacherOption[];
  rooms: Room[];
  courses: Course[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isMutating: boolean;
  addSubject: (values: SubjectFormValues) => Promise<void>;
  updateSubject: (id: string, values: SubjectFormValues) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;
}

export function useSubjects(): UseSubjectsResult {
  const listQuery = useQuery(api.subjects.listAll);
  const teachersQuery = useQuery(api.teachers.getTeachers);
  const roomsQuery = useQuery(api.rooms.listAll);
  const coursesQuery = useQuery(api.courses.listAll);
  const syncTeachers = useAction(api.teachers.syncFromClerk);
  const addSubjectMutation = useMutation(api.subjects.create);
  const updateSubjectMutation = useMutation(api.subjects.update);
  const deleteSubjectMutation = useMutation(api.subjects.remove);

  const [isMutating, setIsMutating] = useState(false);

  const syncedTeachersRef = useRef(false);

  useEffect(() => {
    if (syncedTeachersRef.current) {
      return;
    }
    syncedTeachersRef.current = true;
    void syncTeachers().catch((error) => {
      console.error("Failed to sync teachers from Clerk", error);
    });
  }, [syncTeachers]);

  const isLoading =
    listQuery === undefined ||
    teachersQuery === undefined ||
    roomsQuery === undefined ||
    coursesQuery === undefined;
  const error =
    listQuery?.ok === false
      ? listQuery.error
      : teachersQuery?.ok === false
        ? teachersQuery.error
        : roomsQuery?.ok === false
          ? roomsQuery.error
          : coursesQuery?.ok === false
            ? coursesQuery.error
            : null;

  const subjects = listQuery?.ok ? listQuery.data : [];
  const teachers = teachersQuery?.ok ? teachersQuery.data : [];
  const rooms = roomsQuery?.ok ? roomsQuery.data : [];
  const courses = coursesQuery?.ok ? coursesQuery.data : [];
  const isEmpty = !isLoading && !error && subjects.length === 0;

  const addSubject = useCallback(
    async (values: SubjectFormValues) => {
      setIsMutating(true);
      try {
        await addSubjectMutation({
          ...values,
          roomId: values.roomId as Id<"rooms">,
          courseId: values.courseId as Id<"courses">,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [addSubjectMutation],
  );

  const updateSubject = useCallback(
    async (id: string, values: SubjectFormValues) => {
      setIsMutating(true);
      try {
        await updateSubjectMutation({
          id: id as Id<"subjects">,
          ...values,
          roomId: values.roomId as Id<"rooms">,
          courseId: values.courseId as Id<"courses">,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [updateSubjectMutation],
  );

  const deleteSubject = useCallback(
    async (id: string) => {
      setIsMutating(true);
      try {
        await deleteSubjectMutation({ id: id as Id<"subjects"> });
      } finally {
        setIsMutating(false);
      }
    },
    [deleteSubjectMutation],
  );

  return {
    subjects,
    teachers,
    rooms,
    courses,
    isLoading,
    isEmpty,
    error,
    isMutating,
    addSubject,
    updateSubject,
    deleteSubject,
  };
}