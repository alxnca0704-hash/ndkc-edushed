import { DeanManagement } from "@/components/deans/DeanManagement";
import { ROLES } from "@/constants/roles";
import { requireRole } from "@/hooks/useAuth";

export default async function AdminDeansPage() {
  await requireRole(ROLES.admin);

  return <DeanManagement />;
}
