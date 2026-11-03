import { NoRolePage } from "@/components/NoRolePage";
import { ROLES } from "@/constants/roles";
import { APP_ROUTES } from "@/constants/routes";
import { getCurrentUser } from "@/hooks/useAuth";
import { redirect } from "next/navigation";

export default async function NoRoleRoute() {
  const { userId, role } = await getCurrentUser();

  if (!userId) {
    redirect(APP_ROUTES.signIn);
  }
  if (role === ROLES.dean) {
    redirect(APP_ROUTES.dean);
  }
  if (role === ROLES.teacher) {
    redirect(APP_ROUTES.teacher);
  }
  if (role === ROLES.admin) {
    redirect(APP_ROUTES.admin);
  }

  return <NoRolePage />;
}
