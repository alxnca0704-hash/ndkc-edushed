import type {
  AvailabilityDay,
  AvailabilitySlotKey,
  AvailabilityTimeSlot,
} from "../types/availability";
import {
  DAY_PATTERN_OPTIONS,
  DAY_PATTERNS,
  type DayPattern,
} from "./dayPatterns";

export const AVAILABILITY_START_MINUTES = 7 * 60 + 30;
export const AVAILABILITY_END_MINUTES = 19 * 60 + 30;
export const AVAILABILITY_SLOT_DURATION_MINUTES = 60;

export function formatClock(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 < 12 ? "AM" : "PM";
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutePart = mins.toString().padStart(2, "0");
  return `${hours}:${minutePart} ${period}`;
}

export const AVAILABILITY_DAYS: readonly AvailabilityDay[] = [
  { index: 0, name: "Monday", shortName: "Mon" },
  { index: 1, name: "Tuesday", shortName: "Tue" },
  { index: 2, name: "Wednesday", shortName: "Wed" },
  { index: 3, name: "Thursday", shortName: "Thu" },
  { index: 4, name: "Friday", shortName: "Fri" },
  { index: 5, name: "Saturday", shortName: "Sat" },
];

export const AVAILABILITY_TIME_SLOTS: readonly AvailabilityTimeSlot[] =
  (() => {
    const slots: AvailabilityTimeSlot[] = [];
    for (
      let start = AVAILABILITY_START_MINUTES;
      start < AVAILABILITY_END_MINUTES;
      start += AVAILABILITY_SLOT_DURATION_MINUTES
    ) {
      const end = start + AVAILABILITY_SLOT_DURATION_MINUTES;
      slots.push({
        index: slots.length,
        startMinutes: start,
        endMinutes: end,
        label: formatClock(start),
        rangeLabel: `${formatClock(start)} – ${formatClock(end)}`,
      });
    }
    return slots;
  })();

export function areaPatternLabel(dayPattern: DayPattern): string {
  return DAY_PATTERNS[dayPattern].join(" & ");
}

export const AVAILABILITY_PATTERNS: readonly DayPattern[] =
  DAY_PATTERN_OPTIONS;

export function availabilityPatternKey(
  dayPattern: DayPattern,
  timeSlotIndex: number,
): AvailabilitySlotKey {
  return `${dayPattern}-${timeSlotIndex}`;
}

export function parseAvailabilityPatternKey(
  key: AvailabilitySlotKey,
): { dayPattern: DayPattern; timeSlotIndex: number } | null {
  const match = /^(MW|TTh)-(\d+)$/.exec(key);
  if (!match) {
    return null;
  }
  const timeSlotIndex = Number(match[2]);
  if (
    timeSlotIndex < 0 ||
    timeSlotIndex >= AVAILABILITY_TIME_SLOTS.length
  ) {
    return null;
  }
  return { dayPattern: match[1] as DayPattern, timeSlotIndex };
}

export function availabilityPatternSlotLabel(
  key: AvailabilitySlotKey,
): string {
  const parsed = parseAvailabilityPatternKey(key);
  if (!parsed) {
    return key;
  }
  const slot = AVAILABILITY_TIME_SLOTS[parsed.timeSlotIndex];
  return `${areaPatternLabel(parsed.dayPattern)} ${slot.rangeLabel}`;
}