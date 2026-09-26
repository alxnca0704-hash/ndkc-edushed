"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBJECT_YEAR_LEVEL_LABELS } from "@/constants/courses";
import type { GroupedSchedule } from "@/types/schedule";

export interface ScheduleGroupSelectorProps {
  groups: readonly GroupedSchedule[];
  value: string | null;
  onValueChange: (key: string) => void;
}

interface CourseGroup {
  courseId: string;
  courseCode: string;
  courseName: string;
  groups: GroupedSchedule[];
}

function groupByCourse(groups: readonly GroupedSchedule[]): CourseGroup[] {
  const byCourse = new Map<string, CourseGroup>();

  for (const group of groups) {
    let entry = byCourse.get(group.courseId);
    if (!entry) {
      entry = {
        courseId: group.courseId,
        courseCode: group.courseCode,
        courseName: group.courseName,
        groups: [],
      };
      byCourse.set(group.courseId, entry);
    }
    entry.groups.push(group);
  }

  return [...byCourse.values()];
}

function sessionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "class" : "classes"}`;
}

export function ScheduleGroupSelector({
  groups,
  value,
  onValueChange,
}: ScheduleGroupSelectorProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div>
      <Label htmlFor="schedule-group">Course &amp; year</Label>
      <Select
        value={value}
        onValueChange={(key) => {
          if (key) {
            onValueChange(key);
          }
        }}
        modal={false}
      >
        <SelectTrigger id="schedule-group" className="mt-1.5 w-full sm:w-72">
          <SelectValue>
            {(selected) =>
              groups.find((group) => group.key === selected)?.label ??
              "Select a course and year"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {groupByCourse(groups).map((course) => (
            <SelectGroup key={course.courseId}>
              <SelectLabel>
                {course.courseCode} · {course.courseName}
              </SelectLabel>
              {course.groups.map((group) => (
                <SelectItem key={group.key} value={group.key}>
                  {SUBJECT_YEAR_LEVEL_LABELS[group.year]} ·{" "}
                  {sessionCountLabel(group.sessions.length)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
