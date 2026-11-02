import type { Role } from "@/types/auth";

export const ROLES: Record<Role, Role> = {
  admin: "admin",
  dean: "dean",
  teacher: "teacher",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  dean: "Dean",
  teacher: "Teacher",
};
