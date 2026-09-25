import type { RoomType } from "@/types/rooms";
import type { SubjectYearLevel } from "@/types/course";

export interface Subject {
  _id: string;
  name: string;
  durationMinutes: number;
  roomId: string;
  courseId: string;
  year: SubjectYearLevel;
  teacherId: string;
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
}

export interface TeacherOption {
  clerkId: string;
  name: string;
}
