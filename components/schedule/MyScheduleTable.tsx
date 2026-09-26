"use client";

import { AVAILABILITY_DAYS, formatClock } from "@/constants/availability";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MyScheduleGroup, ScheduleSession } from "@/types/schedule";

export interface MyScheduleTableProps {
  /** This teacher's week, grouped by day pattern (MW, then TTh). */
  groups: readonly MyScheduleGroup[];
  className?: string;
}

function sessionDayLabel(dayIndex: number): string {
  return AVAILABILITY_DAYS[dayIndex]?.shortName ?? `Day ${dayIndex + 1}`;
}

function sessionTimeLabel(session: ScheduleSession): string {
  return `${formatClock(session.startMinutes)} – ${formatClock(session.endMinutes)}`;
}

/**
 * Read-only week view, one section per day pattern. A subject's linked pair
 * (the same class on both days of the pattern) is a single line labelled with
 * the pair, so the two days are never split apart.
 *
 * `code-standards.md` asks tables to collapse to a stacked/card layout on
 * small screens, so the cards are the base (mobile) and the table takes over
 * from `sm` up — a teacher checking their week on a phone gets one card per
 * class instead of a horizontally-scrolled six-column table.
 */
export function MyScheduleTable({ groups, className }: MyScheduleTableProps) {
  return (
    <div className={className}>
      {groups.map((group) => {
        const rows = group.rows.flatMap((row) =>
          row.isLinkedPair
            ? [{ key: row.key, session: row.sessions[0], dayLabel: group.label }]
            : row.sessions.map((session) => ({
                key: session._id,
                session,
                dayLabel: sessionDayLabel(session.dayIndex),
              })),
        );

        return (
          <section
            key={group.dayPattern}
            className="flex flex-col gap-2 [&+section]:mt-6"
          >
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Badge variant="secondary">{group.dayPattern}</Badge>
              <span className="text-muted-foreground">{group.label}</span>
            </h2>

            <ul className="flex flex-col gap-2 sm:hidden">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{row.session.subjectName}</p>
                    <span className="text-sm text-muted-foreground">
                      {row.dayLabel}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {sessionTimeLabel(row.session)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">
                      {row.session.courseCode}
                    </Badge>
                    <span>{row.session.courseName}</span>
                    <Badge variant="outline">Year {row.session.year}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Room{" "}
                    <span className="text-foreground">
                      {row.session.roomName}
                    </span>
                  </p>
                </li>
              ))}
            </ul>

            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Subject</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">
                        {row.session.subjectName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {row.session.courseCode}
                          </Badge>
                          <span className="text-muted-foreground">
                            {row.session.courseName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          Year {row.session.year}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.dayLabel}</TableCell>
                      <TableCell className="tabular-nums">
                        {sessionTimeLabel(row.session)}
                      </TableCell>
                      <TableCell>{row.session.roomName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
