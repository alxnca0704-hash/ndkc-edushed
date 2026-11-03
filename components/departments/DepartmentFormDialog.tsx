"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/result";
import { departmentFormSchema } from "@/lib/validation/department";
import type { Department, DepartmentFormValues } from "@/types/departments";

export interface DepartmentFormDialogProps {
  department?: Department;
  onSubmit: (values: DepartmentFormValues) => Promise<void>;
  onClose: () => void;
}

type FieldErrors = Partial<Record<keyof DepartmentFormValues, string>>;

export function DepartmentFormDialog({
  department,
  onSubmit,
  onClose,
}: DepartmentFormDialogProps) {
  const formId = useId();
  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(department);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = departmentFormSchema.safeParse({
      name,
      code,
      description: description || undefined,
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (messages?.[0]) {
          errors[key as keyof DepartmentFormValues] = messages[0];
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
      await onSubmit(parsed.data);
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
          <DialogTitle>
            {isEditing ? "Edit Department" : "Add Department"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the department details below."
              : "Add a new department/college to the institution."}
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-name`}>Department Name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. College of Computer Studies"
              aria-invalid={Boolean(fieldErrors.name)}
              disabled={submitting}
            />
            {fieldErrors.name && (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-code`}>Code / Acronym</Label>
            <Input
              id={`${formId}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CCS"
              aria-invalid={Boolean(fieldErrors.code)}
              disabled={submitting}
            />
            {fieldErrors.code && (
              <p className="text-xs text-destructive">{fieldErrors.code}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-description`}>
              Description (Optional)
            </Label>
            <Input
              id={`${formId}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the department"
              aria-invalid={Boolean(fieldErrors.description)}
              disabled={submitting}
            />
            {fieldErrors.description && (
              <p className="text-xs text-destructive">
                {fieldErrors.description}
              </p>
            )}
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
            <Button type="submit" disabled={submitting}>
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
                  Add Department
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
