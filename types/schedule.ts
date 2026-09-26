import type { SubjectYearLevel } from "@/types/course";
import type { RoomType } from "@/types/rooms";

export interface ScheduleSession {
  _id: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  year: SubjectYearLevel;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  roomType: RoomType;
  dayPattern: "MW" | "TTh";
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * One Course + Year bucket of the generated schedule, e.g. "BSCS – 1st
 * Year". A group exists as soon as a subject is assigned to that course/year
 * pair, so `sessions` can legitimately be empty (nothing generated yet).
 */
export interface GroupedSchedule {
  key: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  year: SubjectYearLevel;
  label: string;
  subjectCount: number;
  sessions: ScheduleSession[];
}

export type InfeasibilityCause =
  | "no-shared-teacher-window"
  | "no-room-available"
  | "unknown";

export interface FreeWindow {
  start: number;
  end: number;
}

export interface InfeasiblePattern {
  dayPattern: "MW" | "TTh";
  day1FreeWindows: readonly FreeWindow[];
  day2FreeWindows: readonly FreeWindow[];
  cause: InfeasibilityCause;
  message: string;
}

export interface InfeasibleSubject {
  subjectName: string;
  durationMinutes: number;
  patterns: readonly InfeasiblePattern[];
}

export type GenerateScheduleResult =
  | { ok: true; count: number }
  | {
      ok: false;
      error: string;
      infeasibleSubjects?: readonly InfeasibleSubject[];
    };