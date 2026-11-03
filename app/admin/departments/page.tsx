import { DepartmentManagement } from "@/components/departments/DepartmentManagement";
import { ROLES } from "@/constants/roles";
import { requireRole } from "@/hooks/useAuth";

export default async function AdminDepartmentsPage() {
  await requireRole(ROLES.admin);

  return <DepartmentManagement />;
}
