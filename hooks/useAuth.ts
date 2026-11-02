import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ROLES } from "@/constants/roles";
import { APP_ROUTES } from "@/constants/routes";
import type { CurrentUser, Role } from "@/types/auth";

export async function getCurrentUser(): Promise<CurrentUser> {
  const { userId, sessionClaims } = await auth();

  return {
    userId: userId ?? "",
    role: sessionClaims?.metadata?.role ?? null,
  };
}

export async function redirectForRoleHome(): Promise<void> {
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
  redirect(APP_ROUTES.noRole);
}

export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user.userId) {
    redirect(APP_ROUTES.signIn);
  }
  if (user.role !== role) {
    redirect(
      user.role === ROLES.dean
        ? APP_ROUTES.dean
        : user.role === ROLES.teacher
          ? APP_ROUTES.teacher
          : user.role === ROLES.admin
            ? APP_ROUTES.admin
            : APP_ROUTES.noRole,
    );
  }

  return user;
}
