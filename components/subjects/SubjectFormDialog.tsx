"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, Plus, Save } from "lucide-react";

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
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUBJECT_YEAR_LEVEL_LABELS,
  SUBJECT_YEAR_LEVELS,
} from "@/constants/courses";
import { ROOM_TYPE_LABELS } from "@/constants/rooms";
import {
  SUBJECT_COLOR_LABELS,
  SUBJECT_COLOR_TOKENS,
  asSubjectColorToken,
  subjectColorTokenForName,
  type SubjectColorToken,
} from "@/constants/subjectColors";
import { errorMessage } from "@/lib/result";
import { subjectPaletteClasses } from "@/lib/subject-colors";
import { subjectFormSchema } from "@/lib/validation/subject";
import { cn } from "@/lib/utils";
import type { SubjectYearLevel } from "@/types/course";
import type {
  SubjectFormValues,
  SubjectListItem,
  TeacherOption,
} from "@/types/subjects";
import type { Course } from "@/types/course";
import type { Room } from "@/types/rooms";

export interface SubjectFormDialogProps {
  subject?: SubjectListItem;
  teachers: TeacherOption[];
  rooms: Room[];
  courses: Course[];
  onSubmit: (values: SubjectFormValues) => Promise<void>;
  onClose: () => void;
}

type FieldErrors = Partial<Record<keyof SubjectFormValues, string>>;

export function SubjectFormDialog({
  subject,
  teachers,
  rooms,
  courses,
  onSubmit,
  onClose,
}: SubjectFormDialogProps) {
  const formId = useId();
  const [name, setName] = useState(subject?.name ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    subject ? String(subject.durationMinutes) : "",
  );
  const [roomId, setRoomId] = useState<string | null>(subject?.roomId ?? null);
  const [courseId, setCourseId] = useState<string | null>(
    subject?.courseId ?? null,
  );
  const [year, setYear] = useState<string | null>(
    subject ? String(subject.year) : null,
  );
  const [teacherId, setTeacherId] = useState<string | null>(
    subject?.teacherId ?? null,
  );
  // The color the Dean picked, and whether they have picked one at all. Until
  // they do, it follows the name — the same hash the create mutation applies —
  // so the swatch previews what will actually be stored instead of showing a
  // blank the Dean has to think about.
  const [pickedColor, setPickedColor] = useState<SubjectColorToken | null>(
    subject ? asSubjectColorToken(subject.color) : null,
  );
  const [isColorOpen, setIsColorOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(subject);
  const noTeachers = teachers.length === 0;
  const noRooms = rooms.length === 0;
  const noCourses = courses.length === 0;
  const color = pickedColor ?? subjectColorTokenForName(name);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = subjectFormSchema.safeParse({
      name,
      durationMinutes,
      roomId: roomId ?? "",
      courseId: courseId ?? "",
      year: year ?? "",
      teacherId: teacherId ?? "",
      color,
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (messages?.[0]) {
          errors[key as keyof SubjectFormValues] = messages[0];
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
          <DialogTitle>{isEditing ? "Edit subject" : "Add subject"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the subject's details below."
              : "Add a new subject to the schedule."}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          onSubmit={handleSubmit}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-name`}>Subject name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Mathematics"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-duration`}>Duration (minutes)</Label>
              <Input
                id={`${formId}-duration`}
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                placeholder="60"
                aria-invalid={Boolean(fieldErrors.durationMinutes)}
              />
              {fieldErrors.durationMinutes ? (
                <p className="text-xs text-destructive">
                  {fieldErrors.durationMinutes}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Room</Label>
            <Select
              value={roomId}
              onValueChange={setRoomId}
              modal={false}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    const room = rooms.find((r) => r._id === value);
                    return room ? (
                      `${room.name} (${ROOM_TYPE_LABELS[room.type]})`
                    ) : noRooms ? (
                      "No rooms available"
                    ) : (
                      "Select a room"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room._id} value={room._id}>
                    {room.name} ({ROOM_TYPE_LABELS[room.type]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.roomId ? (
              <p className="text-xs text-destructive">{fieldErrors.roomId}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Course</Label>
            <Select
              value={courseId}
              onValueChange={setCourseId}
              modal={false}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    const course = courses.find((c) => c._id === value);
                    return (
                      course?.name ??
                      (noCourses
                        ? "No courses available"
                        : "Select a course")
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course._id} value={course._id}>
                    {course.name} ({course.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.courseId ? (
              <p className="text-xs text-destructive">{fieldErrors.courseId}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Year level</Label>
            <Select
              value={year}
              onValueChange={setYear}
              modal={false}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) =>
                    value
                      ? SUBJECT_YEAR_LEVEL_LABELS[
                          Number(value) as SubjectYearLevel
                        ]
                      : "Select a year level"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_YEAR_LEVELS.map((yearLevel) => (
                  <SelectItem key={yearLevel} value={String(yearLevel)}>
                    {SUBJECT_YEAR_LEVEL_LABELS[yearLevel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.year ? (
              <p className="text-xs text-destructive">{fieldErrors.year}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Assigned teacher</Label>
            <Select
              value={teacherId}
              onValueChange={setTeacherId}
              modal={false}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    const teacher = teachers.find((t) => t.clerkId === value);
                    return (
                      teacher?.name ??
                      (noTeachers
                        ? "No teachers available"
                        : "Select a teacher")
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.clerkId} value={teacher.clerkId}>
                    {teacher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.teacherId ? (
              <p className="text-xs text-destructive">{fieldErrors.teacherId}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label id={`${formId}-color-label`}>Color</Label>
            <Popover
              open={isColorOpen}
              onOpenChange={setIsColorOpen}
            >
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-labelledby={`${formId}-color-label`}
                    className="w-full justify-start gap-2"
                  />
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0 rounded-full",
                    subjectPaletteClasses(color).dot,
                  )}
                />
                {SUBJECT_COLOR_LABELS[color]}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-(--width)">
                <PopoverTitle className="px-1 text-xs font-normal text-muted-foreground">
                  Color
                </PopoverTitle>
                {/* Ten swatches, one per palette token. The label is on the
                    trigger rather than each swatch, so the grid stays a grid of
                    colors instead of a grid of words; the pick itself is a
                    button with its own accessible name. */}
                <div className="grid grid-cols-5 gap-1.5">
                  {SUBJECT_COLOR_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      aria-label={SUBJECT_COLOR_LABELS[token]}
                      aria-pressed={token === color}
                      onClick={() => {
                        setPickedColor(token);
                        setIsColorOpen(false);
                      }}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg ring-1 ring-foreground/10 transition-shadow hover:shadow-sm",
                        subjectPaletteClasses(token).card,
                        token === color && "ring-2 ring-foreground/70",
                      )}
                    >
                      {token === color ? <Check className="size-4" /> : null}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Painted on this subject&apos;s classes in the generated schedule.
              Left alone, it follows the subject name.
            </p>
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
            {isEditing ? "Save changes" : "Add subject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}