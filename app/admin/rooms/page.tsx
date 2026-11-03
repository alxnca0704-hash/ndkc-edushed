import { RoomManagement } from "@/components/rooms/RoomManagement";
import { ROLES } from "@/constants/roles";
import { requireRole } from "@/hooks/useAuth";

export default async function AdminRoomsPage() {
  await requireRole(ROLES.admin);

  return <RoomManagement />;
}
