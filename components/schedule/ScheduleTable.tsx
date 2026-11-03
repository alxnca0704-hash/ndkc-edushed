import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DAY_PATTERNS } from "@/constants/dayPatterns";
import { formatClock } from "@/constants/availability";
import type { ScheduleSession } from "@/types/schedule";

export interface ScheduleTableProps {
  sessions: readonly ScheduleSession[];
}

export function ScheduleTableSkeleton() {
  return (
    <Table aria-label="Loading schedule">
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Teacher</TableHead>
          <TableHead>Room</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }, (_, index) => (
          <TableRow key={index}>
            {Array.from({ length: 5 }, (_, cellIndex) => (
              <TableCell key={cellIndex}>
                <Skeleton className="h-4 w-24" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ScheduleTable({ sessions }: ScheduleTableProps) {
  const seenPairs = new Set<string>();
  const classes = sessions.filter((session) => {
    const key = [
      session.subjectId,
      session.dayPattern,
      session.startMinutes,
      session.endMinutes,
      session.roomId,
    ].join(":");
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    return true;
  });

  return (
    <div className="overflow-x-auto rounded-lg bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Day</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Room</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map((session) => (
            <TableRow key={session._id}>
              <TableCell className="whitespace-nowrap font-medium">
                {DAY_PATTERNS[session.dayPattern].join(" & ")}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatClock(session.startMinutes)} –{" "}
                {formatClock(session.endMinutes)}
              </TableCell>
              <TableCell className="font-medium">{session.subjectName}</TableCell>
              <TableCell className="text-muted-foreground">
                {session.teacherName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {session.roomName}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
