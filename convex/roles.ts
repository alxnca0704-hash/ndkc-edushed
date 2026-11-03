import type { UserIdentity } from "convex/server";

export type AppRole = "admin" | "dean" | "teacher";

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function roleOf(identity: unknown): AppRole | undefined {
  const record = toRecord(identity);
  if (!record) {
    return undefined;
  }

  const topLevel = record.role;
  const metadata = toRecord(record.metadata);
  const role = metadata ? (metadata.role ?? topLevel) : topLevel;

  return role === "admin" || role === "dean" || role === "teacher"
    ? role
    : undefined;
}

export function isDean(identity: UserIdentity | null): boolean {
  return roleOf(identity) === "dean";
}

export function isAdmin(identity: UserIdentity | null): boolean {
  return roleOf(identity) === "admin";
}
