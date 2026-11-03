"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Department, DepartmentFormValues } from "@/types/departments";

export interface UseDepartmentsResult {
  departments: Department[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isMutating: boolean;
  addDepartment: (values: DepartmentFormValues) => Promise<void>;
  updateDepartment: (id: string, values: DepartmentFormValues) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
}

export function useDepartments(): UseDepartmentsResult {
  const listQuery = useQuery(api.departments.listAll);
  const addDepartmentMutation = useMutation(api.departments.create);
  const updateDepartmentMutation = useMutation(api.departments.update);
  const deleteDepartmentMutation = useMutation(api.departments.remove);

  const [isMutating, setIsMutating] = useState(false);

  const isLoading = listQuery === undefined;
  const error = listQuery?.ok === false ? listQuery.error : null;

  const departments = listQuery?.ok ? listQuery.data : [];
  const isEmpty = !isLoading && !error && departments.length === 0;

  const addDepartment = useCallback(
    async (values: DepartmentFormValues) => {
      setIsMutating(true);
      try {
        await addDepartmentMutation(values);
      } finally {
        setIsMutating(false);
      }
    },
    [addDepartmentMutation],
  );

  const updateDepartment = useCallback(
    async (id: string, values: DepartmentFormValues) => {
      setIsMutating(true);
      try {
        await updateDepartmentMutation({
          id: id as Id<"departments">,
          ...values,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [updateDepartmentMutation],
  );

  const deleteDepartment = useCallback(
    async (id: string) => {
      setIsMutating(true);
      try {
        await deleteDepartmentMutation({ id: id as Id<"departments"> });
      } finally {
        setIsMutating(false);
      }
    },
    [deleteDepartmentMutation],
  );

  return {
    departments,
    isLoading,
    isEmpty,
    error,
    isMutating,
    addDepartment,
    updateDepartment,
    deleteDepartment,
  };
}
