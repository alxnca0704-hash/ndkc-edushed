import type { RoomType } from "@/types/rooms";
import type { SubjectYearLevel } from "@/types/course";
import type { SubjectColorToken } from "@/constants/subjectColors";

export interface Subject {
  _id: string;
  name: string;
  durationMinutes: number;
  roomId: string;
  courseId: string;
  year: SubjectYearLevel;
  teacherId: string;
  /**
   * A palette token from `SUBJECT_COLOR_TOKENS`. Typed as a string because that
   * is what the table stores — a doc written before colors existed, or a token
   * since dropped from the palette, is normalized with `asSubjectColorToken`
   * before it is ever read as one.
   */
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface SubjectListItem extends Subject {
  roomName: string;
  roomType: RoomType;
  courseName: string;
  courseCode: string;
  teacherName: string;
}

export interface SubjectFormValues {
  name: string;
  durationMinutes: number;
  roomId: string;
  courseId: string;
  year: SubjectYearLevel;
  teacherId: string;
  /**
   * Always a real token: the form previews the deterministic default a create
   * would be given, so the Dean sees the color before the subject exists rather
   * than after.
   */
  color: SubjectColorToken;
}

export interface TeacherOption {
  clerkId: string;
  name: string;
}
