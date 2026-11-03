"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AvailableAccount, Dean, DeanFormValues } from "@/types/deans";
import type { Department } from "@/types/departments";

export interface UseDeansResult {
  deans: Dean[];
  departments: Department[];
  availableAccounts: AvailableAccount[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  isMutating: boolean;
  isSyncing: boolean;
  addDean: (values: DeanFormValues) => Promise<void>;
  updateDean: (id: string, values: DeanFormValues) => Promise<void>;
  deleteDean: (id: string) => Promise<void>;
  syncDeans: () => Promise<number>;
}

export function useDeans(): UseDeansResult {
  const deansQuery = useQuery(api.deans.listAll);
  const availableAccountsQuery = useQuery(api.deans.listAvailableAccounts);
  const departmentsQuery = useQuery(api.departments.listAll);
  const assignDeanMutation = useMutation(api.deans.assignDean);
  const updateDepartmentMutation = useMutation(api.deans.updateDepartment);
  const removeDeanMutation = useMutation(api.deans.remove);
  const syncFromClerkAction = useAction(api.deans.syncFromClerk);

  const [isMutating, setIsMutating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncedDeansRef = useRef(false);
  useEffect(() => {
    if (syncedDeansRef.current) {
      return;
    }
    syncedDeansRef.current = true;
    void syncFromClerkAction({}).catch((err) => {
      console.error("Initial background sync of Clerk accounts:", err);
    });
  }, [syncFromClerkAction]);

  const isLoading =
    deansQuery === undefined ||
    departmentsQuery === undefined ||
    availableAccountsQuery === undefined;

  const error =
    deansQuery?.ok === false
      ? deansQuery.error
      : departmentsQuery?.ok === false
        ? departmentsQuery.error
        : availableAccountsQuery?.ok === false
          ? availableAccountsQuery.error
          : null;

  const deans = useMemo(
    () => (deansQuery?.ok ? deansQuery.data : []),
    [deansQuery],
  );
  const departments = useMemo(
    () => (departmentsQuery?.ok ? departmentsQuery.data : []),
    [departmentsQuery],
  );
  const availableAccounts = useMemo(
    () => (availableAccountsQuery?.ok ? availableAccountsQuery.data : []),
    [availableAccountsQuery],
  );
  const isEmpty = !isLoading && !error && deans.length === 0;

  const addDean = useCallback(
    async (values: DeanFormValues) => {
      setIsMutating(true);
      try {
        // 1. Update user role in Clerk so session claims and page routes reflect "dean"
        const clerkRes = await fetch("/api/admin/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkId: values.clerkId,
            role: "dean",
          }),
        });

        if (!clerkRes.ok) {
          const errData = (await clerkRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errData.error || "Failed to update role in Clerk");
        }

        // 2. Persist in Convex database
        await assignDeanMutation({
          clerkId: values.clerkId,
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          departmentId: values.departmentId
            ? (values.departmentId as Id<"departments">)
            : undefined,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [assignDeanMutation],
  );

  const updateDean = useCallback(
    async (id: string, values: DeanFormValues) => {
      setIsMutating(true);
      try {
        await updateDepartmentMutation({
          id: id as Id<"users">,
          departmentId: values.departmentId
            ? (values.departmentId as Id<"departments">)
            : undefined,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [updateDepartmentMutation],
  );

  const deleteDean = useCallback(
    async (id: string) => {
      setIsMutating(true);
      try {
        const targetDean = deans.find((d) => d._id === id);

        if (targetDean?.clerkId) {
          await fetch("/api/admin/role", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clerkId: targetDean.clerkId,
              role: "teacher",
            }),
          }).catch((err) => {
            console.error("Failed to revert Clerk role on delete:", err);
          });
        }

        await removeDeanMutation({ id: id as Id<"users"> });
      } finally {
        setIsMutating(false);
      }
    },
    [deans, removeDeanMutation],
  );

  const syncDeans = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await syncFromClerkAction({});
      return res.synced;
    } finally {
      setIsSyncing(false);
    }
  }, [syncFromClerkAction]);

  return {
    deans,
    departments,
    availableAccounts,
    isLoading,
    isEmpty,
    error,
    isMutating,
    isSyncing,
    addDean,
    updateDean,
    deleteDean,
    syncDeans,
  };
}
