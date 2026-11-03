/**
 * The subject color palette: the token vocabulary and the assignment rule.
 *
 * Deliberately free of any UI class strings so `convex/` can import it (nothing
 * here may use `@/` aliases, the same constraint `constants/courses.ts` and
 * `constants/pressureTest.ts` carry). The Tailwind classes that actually paint a
 * token live in `lib/subject-colors.ts`, which is client-side only.
 *
 * A subject's color is one of these token names. It is stored on
 * `subjects.color` and snapshotted onto every generated `schedules` row as
 * `subjectColor`, so the Dean and the Teacher read the same color for the same
 * subject off the same row instead of each deriving one of their own.
 *
 * The hues are spread around the wheel in muted, low-chroma steps (per
 * `code-standards.md`'s no-neon rule) and are documented in `ui-context.md`. The
 * first token is the app's existing green (hue 152, `--accent-primary`), so a
 * subject nobody picked a color for reads like the timetable did before colors
 * existed.
 */

export const SUBJECT_COLOR_TOKENS = [
  "subject-green",
  "subject-olive",
  "subject-amber",
  "subject-rose",
  "subject-magenta",
  "subject-violet",
  "subject-indigo",
  "subject-sky",
  "subject-teal",
  "subject-slate",
] as const;

export type SubjectColorToken = (typeof SUBJECT_COLOR_TOKENS)[number];

/** Shown in the subject form's picker and read out to assistive tech. */
export const SUBJECT_COLOR_LABELS: Record<SubjectColorToken, string> = {
  "subject-green": "Green",
  "subject-olive": "Olive",
  "subject-amber": "Amber",
  "subject-rose": "Rose",
  "subject-magenta": "Magenta",
  "subject-violet": "Violet",
  "subject-indigo": "Indigo",
  "subject-sky": "Sky",
  "subject-teal": "Teal",
  "subject-slate": "Slate",
};

/**
 * The fallback for a row whose stored token is missing or no longer in the
 * palette — a subject saved before colors existed, or a token dropped from the
 * vocabulary above. It is the same green the schedule used before it had
 * subject colors, so nothing renders colorless.
 */
export const DEFAULT_SUBJECT_COLOR_TOKEN: SubjectColorToken = "subject-green";

export function isSubjectColorToken(value: unknown): value is SubjectColorToken {
  return (
    typeof value === "string" &&
    (SUBJECT_COLOR_TOKENS as readonly string[]).includes(value)
  );
}

/** A token, or the default one — the only way a stored color reaches a class. */
export function asSubjectColorToken(value: unknown): SubjectColorToken {
  return isSubjectColorToken(value) ? value : DEFAULT_SUBJECT_COLOR_TOKEN;
}

/**
 * The palette slot for a seed, by FNV-1a hash. A plain integer hash rather than
 * a real digest: the client and the Convex runtime have to agree on the slot for
 * the same subject without sharing a dependency, and nothing here is
 * security-sensitive.
 */
export function subjectColorTokenFor(seed: string): SubjectColorToken {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return SUBJECT_COLOR_TOKENS[(hash >>> 0) % SUBJECT_COLOR_TOKENS.length];
}

/**
 * The slot a subject gets when nobody chose one: a hash of its name, so the same
 * name always lands on the same color, on any device and after a rebuild.
 *
 * Two differently-named subjects can still land on the same slot — ten slots is
 * a small space, and a collision is only a legend that lists two names against
 * one swatch, never a wrong color on a card, because the card prints the subject
 * name as text. That is the trade the picker exists to undo: one click moves a
 * subject off a slot another one is using.
 */
export function subjectColorTokenForName(name: string): SubjectColorToken {
  return subjectColorTokenFor(name.trim().toLowerCase());
}
