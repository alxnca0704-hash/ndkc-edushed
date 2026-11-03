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
import { courseFormSchema } from "@/lib/validation/course";
import type { Course, CourseFormValues } from "@/types/course";

export interface CourseFormDialogProps {
  course?: Course;
  onSubmit: (values: CourseFormValues) => Promise<void>;
  onClose: () => void;
}

type FieldErrors = Partial<Record<keyof CourseFormValues, string>>;

export function CourseFormDialog({
  course,
  onSubmit,
  onClose,
}: CourseFormDialogProps) {
  const formId = useId();
  const [name, setName] = useState(course?.name ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(course);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = courseFormSchema.safeParse({ name, code });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (messages?.[0]) {
          errors[key as keyof CourseFormValues] = messages[0];
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
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
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
            {isEditing ? "Edit course" : "Add course"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the course's details below."
              : "Add a new course that subjects can be assigned to."}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          onSubmit={handleSubmit}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-name`}>Course name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. BS Computer Science"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${formId}-code`}>Course code</Label>
            <Input
              id={`${formId}-code`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. BSCS"
              aria-invalid={Boolean(fieldErrors.code)}
            />
            {fieldErrors.code ? (
              <p className="text-xs text-destructive">{fieldErrors.code}</p>
            ) : null}
          </div>

          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {isEditing ? <Save /> : <Plus />}
            {isEditing ? "Save changes" : "Add course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
