export interface CompiledScheduleSession {
  _id: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  departmentId?: string;
  departmentCode?: string;
  departmentName?: string;
  year: 1 | 2 | 3 | 4;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  roomType: "lecture" | "lab";
  dayPattern: "MW" | "TTh";
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}

export interface ScheduleConflict {
  kind: string;
  message: string;
  subjectIds: string[];
}

export interface CspResolutionResult {
  ok: boolean;
  resolved: boolean;
  message: string;
  movedCount?: number;
  stats?: {
    variables: number;
    maxDomainSize: number;
    nodes: number;
    backtracks: number;
    timeLimitHit: boolean;
    elapsedMs: number;
    outcome: string;
  };
}
