"use client";

import { useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DepartmentDeleteDialog } from "@/components/departments/DepartmentDeleteDialog";
import { DepartmentFormDialog } from "@/components/departments/DepartmentFormDialog";
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
import { useDepartments } from "@/hooks/useDepartments";
import type { Department, DepartmentFormValues } from "@/types/departments";

const SKELETON_ROWS = 5;

export function DepartmentManagement() {
  const {
    departments,
    isLoading,
    isEmpty,
    error,
    addDepartment,
    updateDepartment,
    deleteDepartment,
  } = useDepartments();

  const [search, setSearch] = useState("");
  const [formSession, setFormSession] = useState<{
    department: Department | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const filteredDepartments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return departments;
    }
    return departments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(query) ||
        dept.code.toLowerCase().includes(query) ||
        (dept.description && dept.description.toLowerCase().includes(query)),
    );
  }, [departments, search]);

  function openCreate() {
    setFormSession({ department: null });
  }

  function openEdit(department: Department) {
    setFormSession({ department });
  }

  function handleDepartmentErrorRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Code</TableHead>
              <TableHead>Department Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
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
      return (
        <ErrorState
          title="Couldn't load departments"
          message={error}
          onRetry={handleDepartmentErrorRetry}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="Get started by adding the departments or colleges in the institution."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Add Department
            </Button>
          }
        />
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Code</TableHead>
            <TableHead>Department Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredDepartments.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No departments match &ldquo;{search}&rdquo;
              </TableCell>
            </TableRow>
          ) : (
            filteredDepartments.map((department) => (
              <TableRow key={department._id}>
                <TableCell>
                  <Badge variant="secondary" className="font-mono font-semibold">
                    {department.code}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {department.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {department.description || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(department)}
                      aria-label={`Edit ${department.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleting(department)}
                      aria-label={`Delete ${department.name}`}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Manage Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure departments and colleges for multi-department scheduling.
          </p>
        </div>
        <Button onClick={openCreate} className="self-start sm:self-auto">
          <Plus className="size-4" />
          Add Department
        </Button>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search departments..."
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {departments.length}{" "}
          {departments.length === 1 ? "department" : "departments"}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-2 overflow-x-auto">
        {renderContent()}
      </div>

      {formSession && (
        <DepartmentFormDialog
          department={formSession.department ?? undefined}
          onSubmit={async (values: DepartmentFormValues) => {
            if (formSession.department) {
              await updateDepartment(formSession.department._id, values);
            } else {
              await addDepartment(values);
            }
          }}
          onClose={() => setFormSession(null)}
        />
      )}

      {deleting && (
        <DepartmentDeleteDialog
          department={deleting}
          onConfirm={async (id) => {
            await deleteDepartment(id);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
