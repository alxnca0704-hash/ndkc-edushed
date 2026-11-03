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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROOM_TYPE_LABELS, ROOM_TYPES } from "@/constants/rooms";
import { errorMessage } from "@/lib/result";
import { roomFormSchema } from "@/lib/validation/room";
import type { Room, RoomFormValues, RoomType } from "@/types/rooms";

export interface RoomFormDialogProps {
  room?: Room;
  onSubmit: (values: RoomFormValues) => Promise<void>;
  onClose: () => void;
}

type FieldErrors = Partial<Record<keyof RoomFormValues, string>>;

export function RoomFormDialog({ room, onSubmit, onClose }: RoomFormDialogProps) {
  const formId = useId();
  const [name, setName] = useState(room?.name ?? "");
  const [type, setType] = useState<RoomType | null>(room?.type ?? null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(room);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = roomFormSchema.safeParse({
      name,
      type: type ?? "",
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (messages?.[0]) {
          errors[key as keyof RoomFormValues] = messages[0];
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
          <DialogTitle>{isEditing ? "Edit room" : "Add room"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the room's details below."
              : "Add a new room to the schedule."}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          onSubmit={handleSubmit}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-name`}>Room name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Room 201"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as RoomType | null)}
              modal={false}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) =>
                    value
                      ? ROOM_TYPE_LABELS[value as RoomType]
                      : "Select a category"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((roomType) => (
                  <SelectItem key={roomType} value={roomType}>
                    {ROOM_TYPE_LABELS[roomType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.type ? (
              <p className="text-xs text-destructive">{fieldErrors.type}</p>
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
            {isEditing ? "Save changes" : "Add room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}