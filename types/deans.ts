export interface Dean {
  _id: string;
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
}

export interface AvailableAccount {
  _id: string;
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  role?: "admin" | "dean" | "teacher";
}

export interface DeanFormValues {
  clerkId: string;
  departmentId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}
