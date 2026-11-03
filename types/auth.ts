export type Role = "admin" | "dean" | "teacher";

export interface SessionClaimsMetadata {
  role?: Role;
}

export interface CurrentUser {
  userId: string;
  role: Role | null;
}
