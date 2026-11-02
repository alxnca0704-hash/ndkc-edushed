"use client";

import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  MyScheduleFilters as MyScheduleFilterValues,
  ScheduleRoomOption,
  ScheduleTimeOption,
} from "@/hooks/useMySchedule";

export interface MyScheduleFiltersProps {
  filters: MyScheduleFilterValues;
  dayOptions: readonly { value: string; label: string }[];
  timeOptions: readonly ScheduleTimeOption[];
  roomOptions: readonly ScheduleRoomOption[];
  hasActiveFilters: boolean;
  onSearchChange: (search: string) => void;
  onDayChange: (day: MyScheduleFilterValues["day"]) => void;
  onTimeChange: (time: string) => void;
  onRoomChange: (room: string) => void;
  onClear: () => void;
}

export function MyScheduleFilters({
  filters,
  dayOptions,
  timeOptions,
  roomOptions,
  hasActiveFilters,
  onSearchChange,
  onDayChange,
  onTimeChange,
  onRoomChange,
  onClear,
}: MyScheduleFiltersProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(15rem,1.4fr)_repeat(3,minmax(0,1fr))]">
      <div className="grid gap-1.5">
        <Label htmlFor="teacher-schedule-search">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="teacher-schedule-search"
            type="search"
            value={filters.search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Subject, teacher, room, or course"
            className="pl-8"
          />
        </div>
      </div>

      <FilterSelect
        id="teacher-schedule-day"
        label="Day"
        value={filters.day}
        options={dayOptions}
        onValueChange={(value) => {
          if (value === "all" || value === "MW" || value === "TTh") {
            onDayChange(value);
          }
        }}
      />
      <FilterSelect
        id="teacher-schedule-time"
        label="Time"
        value={filters.time}
        options={timeOptions}
        onValueChange={onTimeChange}
      />
      <FilterSelect
        id="teacher-schedule-room"
        label="Room"
        value={filters.room}
        options={roomOptions}
        onValueChange={onRoomChange}
      />

      {hasActiveFilters ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <RotateCcw />
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onValueChange,
}: FilterSelectProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onValueChange(nextValue);
        }}
        modal={false}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(selected) =>
              options.find((option) => option.value === selected)?.label ??
              options[0]?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
