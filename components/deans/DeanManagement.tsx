"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RefreshCw, Search, Trash2, UserCheck } from "lucide-react";

import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DeanDeleteDialog } from "@/components/deans/DeanDeleteDialog";
import { DeanFormDialog } from "@/components/deans/DeanFormDialog";
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
import { useDeans } from "@/hooks/useDeans";
import type { Dean, DeanFormValues } from "@/types/deans";

const SKELETON_ROWS = 5;

export function DeanManagement() {
  const router = useRouter();
  const {
    deans,
    departments,
    availableAccounts,
    isLoading,
    isEmpty,
    error,
    isSyncing,
    addDean,
    updateDean,
    deleteDean,
    syncDeans,
  } = useDeans();

  const [search, setSearch] = useState("");
  const [formSession, setFormSession] = useState<{
    dean: Dean | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<Dean | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const filteredDeans = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return deans;
    }
    return deans.filter(
      (dean) =>
        dean.displayName.toLowerCase().includes(query) ||
        dean.email.toLowerCase().includes(query) ||
        (dean.departmentName && dean.departmentName.toLowerCase().includes(query)) ||
        (dean.departmentCode && dean.departmentCode.toLowerCase().includes(query)),
    );
  }, [deans, search]);

  function openCreate() {
    setFormSession({ dean: null });
  }

  function openEdit(dean: Dean) {
    setFormSession({ dean });
  }

  async function handleSync() {
    setSyncStatus(null);
    try {
      const count = await syncDeans();
      setSyncStatus(`Synced ${count} dean(s) from Clerk.`);
    } catch {
      setSyncStatus("Failed to sync from Clerk. Check configuration.");
    }
  }

  function handleDeanErrorRetry() {
    window.location.reload();
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dean Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Assigned Department</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-24" />
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
          title="Couldn't load deans"
          message={error}
          onRetry={handleDeanErrorRetry}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={UserCheck}
          title="No deans yet"
          description="Add dean accounts and assign them to departments to manage departmental schedules."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Add Dean
            </Button>
          }
        />
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dean Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Assigned Department</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredDeans.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No deans match &ldquo;{search}&rdquo;
              </TableCell>
            </TableRow>
          ) : (
            filteredDeans.map((dean) => (
              <TableRow key={dean._id}>
                <TableCell className="font-medium">
                  {dean.displayName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dean.email}
                </TableCell>
                <TableCell>
                  {dean.departmentName ? (
                    <Badge variant="outline" className="font-normal">
                      <span className="font-semibold mr-1 font-mono">
                        {dean.departmentCode}
                      </span>
                      — {dean.departmentName}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      Unassigned
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(dean)}
                      aria-label={`Edit ${dean.displayName}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleting(dean)}
                      aria-label={`Remove ${dean.displayName}`}
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
          <h1 className="text-xl font-semibold tracking-tight">Manage Deans</h1>
          <p className="text-sm text-muted-foreground">
            Manage Dean profiles and assign leadership to each department.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
            className="self-start sm:self-auto"
          >
            <RefreshCw
              className={`size-4 mr-1.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Sync from Clerk"}
          </Button>
          <Button onClick={openCreate} className="self-start sm:self-auto">
            <Plus className="size-4" />
            Add Dean
          </Button>
        </div>
      </div>

      {syncStatus && (
        <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {syncStatus}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deans or departments..."
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {deans.length} {deans.length === 1 ? "dean" : "deans"}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-2 overflow-x-auto">
        {renderContent()}
      </div>

      {formSession && (
        <DeanFormDialog
          dean={formSession.dean ?? undefined}
          departments={departments}
          availableAccounts={availableAccounts}
          onSync={async () => {
            await handleSync();
          }}
          isSyncing={isSyncing}
          onSubmit={async (values: DeanFormValues) => {
            if (formSession.dean) {
              await updateDean(formSession.dean._id, values);
            } else {
              await addDean(values);
            }
            router.refresh();
          }}
          onClose={() => setFormSession(null)}
        />
      )}

      {deleting && (
        <DeanDeleteDialog
          dean={deleting}
          onConfirm={async (id) => {
            await deleteDean(id);
            router.refresh();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
