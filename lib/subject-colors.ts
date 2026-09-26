import {
  DEFAULT_SUBJECT_COLOR_TOKEN,
  type SubjectColorToken,
} from "@/constants/subjectColors";

/**
 * Tailwind classes for one palette token.
 *
 * Each slot is a tone + soft-wash pair rather than one flat color, the same way
 * the per-teacher palette was: the wash paints the surface (a card, a swatch
 * well) and the full tone carries the ink on it, so contrast does the work a
 * border would otherwise do. The classes are static literals because Tailwind v4
 * only emits the classes it can see in the source — a class assembled from a
 * variable renders unstyled, silently.
 */
export interface SubjectPaletteClasses {
  /** Card surface plus the ink on it, as one string for the grid's block. */
  card: string;
  /** The teacher/room line inside a block of this color. */
  muted: string;
  /** The legend swatch, the picker dot, and the dot in the subjects table. */
  dot: string;
}

export const SUBJECT_PALETTE_CLASSES: Record<
  SubjectColorToken,
  SubjectPaletteClasses
> = {
  "subject-green": {
    card: "bg-subject-green-surface text-subject-green-foreground",
    muted: "text-subject-green-muted",
    dot: "bg-subject-green-foreground",
  },
  "subject-olive": {
    card: "bg-subject-olive-surface text-subject-olive-foreground",
    muted: "text-subject-olive-muted",
    dot: "bg-subject-olive-foreground",
  },
  "subject-amber": {
    card: "bg-subject-amber-surface text-subject-amber-foreground",
    muted: "text-subject-amber-muted",
    dot: "bg-subject-amber-foreground",
  },
  "subject-rose": {
    card: "bg-subject-rose-surface text-subject-rose-foreground",
    muted: "text-subject-rose-muted",
    dot: "bg-subject-rose-foreground",
  },
  "subject-magenta": {
    card: "bg-subject-magenta-surface text-subject-magenta-foreground",
    muted: "text-subject-magenta-muted",
    dot: "bg-subject-magenta-foreground",
  },
  "subject-violet": {
    card: "bg-subject-violet-surface text-subject-violet-foreground",
    muted: "text-subject-violet-muted",
    dot: "bg-subject-violet-foreground",
  },
  "subject-indigo": {
    card: "bg-subject-indigo-surface text-subject-indigo-foreground",
    muted: "text-subject-indigo-muted",
    dot: "bg-subject-indigo-foreground",
  },
  "subject-sky": {
    card: "bg-subject-sky-surface text-subject-sky-foreground",
    muted: "text-subject-sky-muted",
    dot: "bg-subject-sky-foreground",
  },
  "subject-teal": {
    card: "bg-subject-teal-surface text-subject-teal-foreground",
    muted: "text-subject-teal-muted",
    dot: "bg-subject-teal-foreground",
  },
  "subject-slate": {
    card: "bg-subject-slate-surface text-subject-slate-foreground",
    muted: "text-subject-slate-muted",
    dot: "bg-subject-slate-foreground",
  },
};

/** The classes for a stored token, falling back to the default slot. */
export function subjectPaletteClasses(
  token: SubjectColorToken,
): SubjectPaletteClasses {
  return (
    SUBJECT_PALETTE_CLASSES[token] ??
    SUBJECT_PALETTE_CLASSES[DEFAULT_SUBJECT_COLOR_TOKEN]
  );
}
