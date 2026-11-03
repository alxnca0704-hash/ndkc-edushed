export interface Department {
  _id: string;
  name: string;
  code: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DepartmentFormValues {
  name: string;
  code: string;
  description?: string;
}
