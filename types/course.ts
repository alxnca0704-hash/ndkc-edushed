export type SubjectYearLevel = 1 | 2 | 3 | 4;

export interface Course {
  _id: string;
  name: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

export interface CourseFormValues {
  name: string;
  code: string;
}
