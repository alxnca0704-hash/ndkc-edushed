"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  CheckCircle2,
  Cpu,
  Flame,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DAY_PATTERNS } from "@/constants/dayPatterns";
import { formatClock } from "@/constants/availability";
import { useAdminSchedule } from "@/hooks/useAdminSchedule";


const SKELETON_ROWS = 6;

export function AdminCompiledSchedule() {
  const {
    sessions,
    conflicts,
    departments,
    isLoading,
    isEmpty,
    error,
    isResolving,
    isSimulating,
    lastResult,
    resolveConflicts,
    simulateConflict,
  } = useAdminSchedule();

  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (selectedDepartment !== "all") {
      result = result.filter(
        (s) =>
          s.departmentId === selectedDepartment ||
          s.departmentCode === selectedDepartment,
      );
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (s) =>
          s.subjectName.toLowerCase().includes(query) ||
          s.teacherName.toLowerCase().includes(query) ||
          s.roomName.toLowerCase().includes(query) ||
          s.courseCode.toLowerCase().includes(query) ||
          (s.departmentName && s.departmentName.toLowerCase().includes(query)) ||
          (s.departmentCode && s.departmentCode.toLowerCase().includes(query)),
      );
    }

    return result;
  }, [sessions, selectedDepartment, search]);

  // Deduplicate linked MW and TTh pairs for clean presentation
  const distinctClasses = useMemo(() => {
    const seen = new Set<string>();
    return filteredSessions.filter((session) => {
      const key = `${session.subjectId}:${session.dayPattern}:${session.startMinutes}:${session.endMinutes}:${session.roomId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredSessions]);

  // Set of subject IDs that are currently involved in any conflict
  const conflictingSubjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of conflicts) {
      for (const id of conflict.subjectIds) {
        ids.add(id);
      }
    }
    return ids;
  }, [conflicts]);

  async function handleResolve() {
    setActionNotice(null);
    try {
      const res = await resolveConflicts();
      setActionNotice(res.message);
    } catch {
      setActionNotice("Failed to run CSP conflict resolution.");
    }
  }

  async function handleSimulate() {
    setActionNotice(null);
    try {
      await simulateConflict();
      setActionNotice(
        "Simulated cross-department room conflict. See conflict alert below.",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to simulate conflict";
      setActionNotice(msg);
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Department & Program</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Room</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-5 w-16" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (error) {
      return (
        <ErrorState
          title="Couldn't load compiled schedule"
          message={error}
          onRetry={() => window.location.reload()}
        />
      );
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={CalendarRange}
          title="No compiled schedules yet"
          description="Department schedules have not been generated yet. Deans generate schedules within their departments, which compile here."
        />
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Day</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Department & Program</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Room</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {distinctClasses.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No classes match your filter criteria.
              </TableCell>
            </TableRow>
          ) : (
            distinctClasses.map((session) => {
              const hasConflict = conflictingSubjectIds.has(session.subjectId);
              return (
                <TableRow
                  key={session._id}
                  className={hasConflict ? "bg-destructive/5 font-medium" : undefined}
                >
                  <TableCell className="whitespace-nowrap font-medium">
                    {DAY_PATTERNS[session.dayPattern]?.join(" & ") ?? session.dayPattern}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatClock(session.startMinutes)} –{" "}
                    {formatClock(session.endMinutes)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {session.subjectName}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold uppercase text-foreground">
                        {session.departmentCode} — {session.courseCode}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {session.departmentName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {session.teacherName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {session.roomName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {hasConflict ? (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <AlertTriangle className="size-3" />
                        Conflict
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-xs text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
                      >
                        <CheckCircle2 className="size-3" />
                        Valid
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Compiled Department Schedules
          </h1>
          <p className="text-sm text-muted-foreground">
            Master timetable combined across all departments. Cross-department
            resource conflicts are resolved using the CSP algorithm.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSimulate}
            disabled={isSimulating || isResolving || sessions.length < 2}
            title="Inject a deliberate room collision between departments to demonstrate CSP conflict repair"
          >
            <Flame className="size-3.5 mr-1.5 text-amber-500" />
            {isSimulating ? "Simulating..." : "Simulate Conflict"}
          </Button>
          <Button
            size="sm"
            onClick={handleResolve}
            disabled={isResolving || conflicts.length === 0}
            className="gap-1.5"
          >
            {isResolving ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Wrench className="size-4" />
            )}
            {isResolving ? "Resolving CSP..." : "Resolve Conflicts (CSP)"}
          </Button>
        </div>
      </div>

      {/* Action Notice */}
      {actionNotice && (
        <div className="mt-4 rounded-lg border border-border bg-muted/60 p-3 text-sm text-foreground flex items-center justify-between">
          <span>{actionNotice}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionNotice(null)}
            className="h-6 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Conflict Alert Banner */}
      {conflicts.length > 0 && (
        <div className="mt-6">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle className="flex items-center justify-between">
              <span>
                {conflicts.length} Cross-Department Schedule Conflict
                {conflicts.length === 1 ? "" : "s"} Detected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResolve}
                disabled={isResolving}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 h-7 text-xs"
              >
                <Sparkles className="size-3.5 mr-1" />
                {isResolving ? "Resolving..." : "Auto-Resolve with CSP"}
              </Button>
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-1">
              <p className="text-xs opacity-90">
                Different departments have clashing resource requirements
                (shared rooms or overlapping teachers):
              </p>
              <ul className="list-disc pl-5 text-xs space-y-1 pt-1">
                {conflicts.map((conflict, idx) => (
                  <li key={idx} className="font-mono">
                    {conflict.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* CSP Optimization / Resolution Stats Banner */}
      {lastResult?.resolved && lastResult.stats && (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-950 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-sm">
              Constraint Satisfaction (CSP) Execution Report
            </span>
          </div>
          <p className="mt-1 text-xs opacity-90">
            {lastResult.message}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs font-mono">
            <div className="rounded bg-background/80 p-2 shadow-xs">
              <span className="text-muted-foreground block text-[10px]">
                Search Time
              </span>
              <span className="font-bold">{lastResult.stats.elapsedMs} ms</span>
            </div>
            <div className="rounded bg-background/80 p-2 shadow-xs">
              <span className="text-muted-foreground block text-[10px]">
                Backtracking Steps
              </span>
              <span className="font-bold">{lastResult.stats.backtracks}</span>
            </div>
            <div className="rounded bg-background/80 p-2 shadow-xs">
              <span className="text-muted-foreground block text-[10px]">
                Variables Moved
              </span>
              <span className="font-bold">
                {lastResult.movedCount ?? lastResult.stats.variables}
              </span>
            </div>
            <div className="rounded bg-background/80 p-2 shadow-xs">
              <span className="text-muted-foreground block text-[10px]">
                CSP Heuristics
              </span>
              <span className="font-bold">MRV + LCV + FC</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Department Filter */}
          <div className="w-56">
            <Select
              value={selectedDepartment}
              onValueChange={(val) => setSelectedDepartment(val || "all")}
              modal={false}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    <span>All Departments</span>
                  </div>
                </SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.code} — {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Input */}
          <div className="relative min-w-52 flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects, rooms, teachers..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground self-end sm:self-auto">
          {distinctClasses.length}{" "}
          {distinctClasses.length === 1 ? "class session" : "class sessions"}
        </div>
      </div>

      {/* Schedule Table Container */}
      <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-2 overflow-x-auto">
        {renderContent()}
      </div>
    </div>
  );
}
