"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Save, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/result";
import { deanFormSchema } from "@/lib/validation/dean";
import type { AvailableAccount, Dean, DeanFormValues } from "@/types/deans";
import type { Department } from "@/types/departments";

export interface DeanFormDialogProps {
  dean?: Dean;
  departments: Department[];
  availableAccounts: AvailableAccount[];
  onSubmit: (values: DeanFormValues) => Promise<void>;
  onClose: () => void;
  onSync?: () => Promise<void>;
  isSyncing?: boolean;
}

type FieldErrors = Partial<Record<keyof DeanFormValues, string>>;

export function DeanFormDialog({
  dean,
  departments,
  availableAccounts,
  onSubmit,
  onClose,
  onSync,
  isSyncing = false,
}: DeanFormDialogProps) {
  const formId = useId();
  const isEditing = Boolean(dean);

  const [selectedClerkId, setSelectedClerkId] = useState<string>(
    dean?.clerkId ?? "",
  );
  const [departmentId, setDepartmentId] = useState<string>(
    dean?.departmentId ?? "none",
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = availableAccounts.find(
    (acc) => acc.clerkId === selectedClerkId,
  );
  const selectedDepartment = departments.find((d) => d._id === departmentId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = deanFormSchema.safeParse({
      clerkId: isEditing ? dean?.clerkId : selectedClerkId,
      departmentId: departmentId === "none" ? undefined : departmentId,
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (messages?.[0]) {
          errors[key as keyof DeanFormValues] = messages[0];
        }
      }
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);

    try {
      await onSubmit({
        clerkId: parsed.data.clerkId,
        departmentId: parsed.data.departmentId,
        email: isEditing ? dean?.email : selectedAccount?.email,
        firstName: isEditing ? dean?.firstName : selectedAccount?.firstName,
        lastName: isEditing ? dean?.lastName : selectedAccount?.lastName,
      });
      onClose();
    } catch (submitErr) {
      setSubmitError(errorMessage(submitErr));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Dean" : "Add Dean"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update department assignment for this dean."
              : "Select an available account from Clerk or the database and assign them to a department."}
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} className="space-y-4">
          {isEditing && dean ? (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-none truncate">
                  {dean.displayName}
                </div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  {dean.email}
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                Dean
              </Badge>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${formId}-account`}>Available Account</Label>
                  {onSync && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onSync}
                      disabled={isSyncing}
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw
                        className={`mr-1 size-3 ${isSyncing ? "animate-spin" : ""}`}
                      />
                      Sync Clerk
                    </Button>
                  )}
                </div>

                <Select
                  value={selectedClerkId}
                  onValueChange={(val) => setSelectedClerkId(val ?? "")}
                  modal={false}
                >
                  <SelectTrigger id={`${formId}-account`} className="w-full">
                    <SelectValue>
                      {selectedAccount
                        ? `${selectedAccount.displayName} (${selectedAccount.email})`
                        : availableAccounts.length === 0
                          ? "No available accounts"
                          : "Select an account..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No available accounts found. Try syncing from Clerk.
                      </div>
                    ) : (
                      availableAccounts.map((acc) => (
                        <SelectItem key={acc.clerkId} value={acc.clerkId}>
                          <span className="font-medium">{acc.displayName}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                            ({acc.email})
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {fieldErrors.clerkId && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.clerkId}
                  </p>
                )}
              </div>

              {selectedAccount && (
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-none truncate">
                      {selectedAccount.displayName}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {selectedAccount.email}
                    </div>
                  </div>
                  {selectedAccount.role && (
                    <Badge variant="outline" className="capitalize text-xs">
                      {selectedAccount.role}
                    </Badge>
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-department`}>Assigned Department</Label>
            <Select
              value={departmentId}
              onValueChange={(val) => setDepartmentId(val || "none")}
              modal={false}
            >
              <SelectTrigger id={`${formId}-department`} className="w-full">
                <SelectValue>
                  {selectedDepartment
                    ? `${selectedDepartment.name} (${selectedDepartment.code})`
                    : "Unassigned / None"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned / None</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept._id} value={dept._id}>
                    {dept.name} ({dept.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {submitError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || (!isEditing && !selectedClerkId)}
            >
              {submitting ? (
                "Saving..."
              ) : isEditing ? (
                <>
                  <Save className="size-4" />
                  Save Changes
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Add Dean
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
