export interface AvailabilityDay {
  index: number;
  name: string;
  shortName: string;
}

export interface AvailabilityTimeSlot {
  index: number;
  startMinutes: number;
  endMinutes: number;
  label: string;
  rangeLabel: string;
}

export type AvailabilitySlotKey = string;