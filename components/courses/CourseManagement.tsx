"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Plus, Search } from "lucide-react";

import { CoursesTable } from "@/components/courses/CoursesTable";
import { CoursesTableSkeleton } from "@/components/courses/CoursesTableSkeleton";
import { CourseDeleteDialog } from "@/components/courses/CourseDeleteDialog";
import { CourseFormDialog } from "@/components/courses/CourseFormDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCourses } from "@/hooks/useCourses";
import type { Course, CourseFormValues } from "@/types/course";

export function CourseManagement() {
  const {
    courses,
    isLoading,
    isEmpty,
    error,
    addCourse,
    updateCourse,
    deleteCourse,
  } = useCourses();

  const [search, setSearch] = useState("");
  const [formSession, setFormSession] = useState<{
    course: Course | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return courses;
    }
    return courses.filter(
      (course) =>
        course.name.toLowerCase().includes(query) ||
        course.code.toLowerCase().includes(query),
    );
  }, [courses, search]);

  function openCreate() {
    setFormSession({ course: null });
  }

  function openEdit(course: Course) {
    setFormSession({ course });
  }

  function handleCourseErrorRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return <CoursesTableSkeleton />;
    }

    if (error) {
      return (
        <ErrorState
          title="Couldn't load courses"
          message={error}
          onRetry={handleCourseErrorRetry}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="Add your first course so subjects can be assigned to it."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Add course
            </Button>
          }
        />
      );
    }

    if (filteredCourses.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title="No matching courses"
          description={`Nothing matches "${search}".`}
          action={
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      );
    }

    return (
      <CoursesTable
        courses={filteredCourses}
        onEdit={openEdit}
        onDelete={setDeleting}
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Manage Courses
        </h1>
        <p className="text-sm text-muted-foreground">
          Add, update, and remove the courses subjects are assigned to.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search courses..."
            className="pl-8"
            aria-label="Search courses"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add course
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>

      {formSession ? (
        <CourseFormDialog
          key={formSession.course?._id ?? "new"}
          course={formSession.course ?? undefined}
          onSubmit={
            formSession.course
              ? (values: CourseFormValues) =>
                  updateCourse(formSession.course!._id, values)
              : addCourse
          }
          onClose={() => setFormSession(null)}
        />
      ) : null}

      {deleting ? (
        <CourseDeleteDialog
          key={`course-delete-${deleting._id}`}
          course={deleting}
          onConfirm={deleteCourse}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
