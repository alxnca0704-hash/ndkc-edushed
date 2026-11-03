/**
 * How a `users` doc is shown to a person.
 *
 * One definition, because "first last, or the email if there is no name" is
 * copied into every place that has to name a teacher — the subjects table, the
 * teacher's dropdown, and now the Dean's notification about a teacher's
 * availability. Two copies would eventually disagree about which teacher is
 * which, which is exactly the ambiguity Invariant 3 exists to prevent.
 */
export function userDisplayName(user: {
  firstName?: string;
  lastName?: string;
  email: string;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

/** The same name, from a Clerk identity, for callers that have no `users` doc. */
export function identityDisplayName(identity: {
  givenName?: string;
  familyName?: string;
  email?: string | null;
}): string {
  const name = [identity.givenName, identity.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || identity.email || "";
}