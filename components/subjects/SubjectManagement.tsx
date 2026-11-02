"use client";

import { useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { SubjectDeleteDialog } from "@/components/subjects/SubjectDeleteDialog";
import { SubjectFormDialog } from "@/components/subjects/SubjectFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SUBJECT_YEAR_LEVEL_LABELS } from "@/constants/courses";
import { ROOM_TYPE_LABELS } from "@/constants/rooms";
import { useSubjects } from "@/hooks/useSubjects";
import type { SubjectFormValues, SubjectListItem } from "@/types/subjects";

const SKELETON_ROWS = 5;

export function SubjectManagement() {
  const {
    subjects,
    teachers,
    rooms,
    courses,
    isLoading,
    isEmpty,
    error,
    addSubject,
    updateSubject,
    deleteSubject,
  } = useSubjects();

  const [search, setSearch] = useState("");
  const [formSession, setFormSession] = useState<{
    subject: SubjectListItem | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<SubjectListItem | null>(null);

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return subjects;
    }
    return subjects.filter(
      (subject) =>
        subject.name.toLowerCase().includes(query) ||
        subject.teacherName.toLowerCase().includes(query) ||
        subject.roomName.toLowerCase().includes(query) ||
        subject.courseName.toLowerCase().includes(query) ||
        subject.courseCode.toLowerCase().includes(query) ||
        ROOM_TYPE_LABELS[subject.roomType].toLowerCase().includes(query) ||
        SUBJECT_YEAR_LEVEL_LABELS[subject.year].toLowerCase().includes(query),
    );
  }, [subjects, search]);

  function openCreate() {
    setFormSession({ subject: null });
  }

  function openEdit(subject: SubjectListItem) {
    setFormSession({ subject });
  }

  function handleSubjectErrorRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Subject</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-7 w-14" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (error) {
      return <ErrorState message={error} onRetry={handleSubjectErrorRetry} />;
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Add your first subject to start building the schedule."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Add subject
            </Button>
          }
        />
      );
    }

    if (filteredSubjects.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title="No matching subjects"
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Subject</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredSubjects.map((subject) => (
            <TableRow key={subject._id}>
              <TableCell className="font-medium">
                <span className="truncate">{subject.name}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{subject.courseCode}</Badge>
                  <span className="text-muted-foreground">
                    {subject.courseName}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">Year {subject.year}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {ROOM_TYPE_LABELS[subject.roomType]}
                  </Badge>
                  <span className="text-muted-foreground">
                    {subject.roomName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {subject.durationMinutes} min
              </TableCell>
              <TableCell className="text-muted-foreground">
                {subject.teacherName}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${subject.name}`}
                    onClick={() => openEdit(subject)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${subject.name}`}
                    onClick={() => setDeleting(subject)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Manage Subjects
        </h1>
        <p className="text-sm text-muted-foreground">
          Add, update, and remove subjects for scheduling.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subjects..."
            className="pl-8"
            aria-label="Search subjects"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add subject
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:p-4">
        {renderContent()}
      </div>

      {formSession ? (
        <SubjectFormDialog
          key={formSession.subject?._id ?? "new"}
          subject={formSession.subject ?? undefined}
          teachers={teachers}
          rooms={rooms}
          courses={courses}
          onSubmit={
            formSession.subject
              ? (values: SubjectFormValues) =>
                  updateSubject(formSession.subject!._id, values)
              : addSubject
          }
          onClose={() => setFormSession(null)}
        />
      ) : null}

      {deleting ? (
        <SubjectDeleteDialog
          key={`subject-delete-${deleting._id}`}
          subject={deleting}
          onConfirm={deleteSubject}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
