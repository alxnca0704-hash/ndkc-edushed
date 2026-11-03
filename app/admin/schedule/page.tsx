import { AdminCompiledSchedule } from "@/components/admin/schedule/AdminCompiledSchedule";
import { ROLES } from "@/constants/roles";
import { requireRole } from "@/hooks/useAuth";

export default async function AdminSchedulePage() {
  await requireRole(ROLES.admin);

  return <AdminCompiledSchedule />;
}
