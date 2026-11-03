import { DAY_PATTERN_DAY_INDEXES } from "../../constants/dayPatterns";
import type { SchedulingAvailability } from "./types";

export interface Interval {
  startMinutes: number;
  endMinutes: number;
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Resolves the pattern-level availability into a per-day blocked map.
 *
 * A blocked slot on a day pattern applies to BOTH days of the pair (MW →
 * Mon+Wed, TTh → Tue+Thu), so a teacher's per-day blocked sets are always
 * identical on the two days of a pattern. A mismatched Mon-vs-Wed (or
 * Tue-vs-Thu) block is therefore structurally impossible to express, which
 * is the point of the per-pattern availability model.
 */
export function blockedByDayFor(
  teacherId: string,
  availability: readonly SchedulingAvailability[],
): ReadonlyMap<number, ReadonlySet<number>> {
  const match = availability.find((entry) => entry.teacherId === teacherId);
  const map = new Map<number, Set<number>>();
  for (const blockedPattern of match?.blockedByPattern ?? []) {
    const dayIndexes =
      DAY_PATTERN_DAY_INDEXES[blockedPattern.dayPattern] ?? [];
    for (const dayIndex of dayIndexes) {
      let set = map.get(dayIndex);
      if (!set) {
        set = new Set();
        map.set(dayIndex, set);
      }
      for (const slotIndex of blockedPattern.slotIndexes) {
        set.add(slotIndex);
      }
    }
  }
  return map;
}