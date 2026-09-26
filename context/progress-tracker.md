# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

Complete — Conflict Alert on the Generated Schedule page (spec 09). A
generate failure now renders one shadcn `Alert` (variant `destructive`) per
unplaceable subject, and each alert names the concrete cause the engine found
(room + the class holding it + the overlapping time, teacher + the blocked
window, or the teacher's own classes eating the pair's days). The scheduling
engine gained a structured `ConflictDetail`; the UI only maps a conflict kind
to an icon/label. Spec 09's second application point (a failed
drag-and-drop / auto-adjusted move) has **no code to attach to** — see Open
Questions.

## Current Goal

Shipped (see Completed). Remaining follow-up for this unit: force a real
generate failure in the browser with a Dean login (e.g. block a teacher's
whole MW pair, or point two subjects at one room) and eyeball the
`ConflictAlert` — icon per kind, the fact rows, the destructive (not neon red)
palette, and the single-subject vs accordion-list layouts.

## Completed

- **Conflict Status Alert on the Generated Schedule Page (spec 09)** — full
  unit:
  - Installed shadcn `alert` via the CLI as its own step (`npx shadcn add
    alert`); only `components/ui/alert.tsx` was added, no dependency or
    config changes (`cn` was already the project's class-merge helper). The
    primitive's own `destructive` variant is used as-is — no custom red.
  - `convex/scheduling/types.ts`: new `ConflictKind`
    (`"room-occupied" | "teacher-unavailable" | "no-shared-window" |
    "arrangement-conflict"`), `ConflictFact` (`{ label, value }`,
    already-formatted), and `ConflictDetail` (`{ kind, title, message, facts }`).
    `PatternInfeasibility` gains a required `conflict`, so
    `explainInfeasibility` (via `explainPatternFailure`) now returns each
    pattern's finding twice: the existing prose `message` and a structured
    version. `SchedulingSubject` gains an **optional `teacherName`** used only
    for diagnostics (matching/constraints still use `teacherId`, per Invariant
    3); `convex/schedule.ts` populates it from the already-joined
    `SubjectRow.teacherName`.
  - `convex/scheduling/cspDiagnostics.ts`: message builders
    (`sharedTeacherMessage` / `roomOccupiedMessage` /
    `arrangementConflictMessage`) so the prose and the structured copy can
    never drift; new `blockedWindowsForDay` (the inverse of
    `freeWindowsForDay` — contiguous blocked runs inside school hours) and
    `roomBlockersAtFirstClash` (earliest shared start whose room is taken,
    with the blocking placement per pattern day). Per cause:
    - `no-room-available` → `room-occupied`: title "`{room}` is already
      booked" + facts **Room / Booked by / Overlaps** ("Alpha 101",
      "Mon & Wed 7:30 AM–8:30 AM").
    - `no-shared-teacher-window` → `teacher-unavailable` when the declared
      pattern blocks are what kill the window (title "Prof. Reyes is
      unavailable Tue & Thu 7:30 AM–7:30 PM") or `no-shared-window` when
      nothing is declared and the teacher's own placed classes differ across
      the pair ("Prof. Santos has no 60-min window free on both Mon & Wed").
      Facts: **Teacher / Unavailable / Already teaching** (own classes capped
      at 3 with "+N more" so a packed week can't flood the alert).
    - `unknown` → `arrangement-conflict`: "No arrangement of the week fits" +
      facts **Teacher / Room / Free on its own at**.
  - `types/schedule.ts` mirrors the three new types plus
    `InfeasiblePattern.conflict`; the Convex action already returns
    `InfeasibilityReason[]` verbatim, so nothing changed in `useSchedule`.
  - `components/schedule/ConflictAlert.tsx` (new): one shadcn `Alert`
    (`variant="destructive"` by default, `default` accepted for a future
    non-failure notice) with a `TriangleAlert` icon, the title "Couldn't place
    {subject}", and one muted block per day pattern — pattern `Badge`, a
    kind-specific lucide icon + label (`DoorClosed` / `UserX` / `CalendarX` /
    `Layers` at `size-3.5`), the engine's title + message, and the facts as a
    `<dl>` label/value grid. Purely presentational: every sentence comes from
    `ConflictDetail`.
  - `components/schedule/ScheduleGenerationError.tsx` refactored to use it —
    the shared muted error region (title + summary + Retry) is unchanged, and
    the existing per-subject accordion now holds an alert per item (one
    `ConflictAlert` each, first open) so a multi-failure generate can't become
    a wall of alerts; a single failure renders the alert directly. The old
    `Skeleton` circle and the per-day free-window boxes are gone: the
    free windows are already stated inside the engine's message, so the alert
    shows title (what), message (why), facts (the specifics) and nothing
    twice.
  - `scripts/scheduling-smoke-test.ts`: **55/55** (was 39). New coverage —
    the room conflict's kind/title/facts (room name, the class holding it,
    "Mon & Wed 7:30 AM–8:30 AM"), the teacher-unavailable title/facts naming
    "Prof. Reyes" and the fully-blocked "Tue & Thu 7:30 AM–7:30 PM" window,
    `conflict.message` being the pattern message verbatim, and a new
    direct-diagnostics case (four linked 3-hour classes filling Mon + Wed) for
    `no-shared-window`: the fact cap, the "Busy 101" naming, and the absence
    of an `Unavailable` fact when nothing is declared blocked. The crowded-room
    fixtures gained `teacherName`s so the teacher assertions test the real
    field.
  - Verified: root `npx tsc --noEmit` clean, `npm run lint` (0 errors — the
    same 5 pre-existing warnings in `convex/_generated/*` +
    `convex/auth.config.ts`), `npm run build` passes with `/dean/schedule`
    routed, `npx tsx scripts/scheduling-smoke-test.ts` 55/55, and functions
    pushed to dev with `npx convex dev --once` (no schema change → no
    migration window).
  - Not verified in a browser (no Dean session here) — see Next Up.

- **Group Generated Schedule by Course & Year (spec 08)** — full unit:
  - `convex/schema.ts`: `schedules` gains required `courseId`
    (`v.id("courses")`), `courseCode`, `courseName`, and `year`
    (`1 | 2 | 3 | 4`) — the same course/year the subject belongs to,
    denormalized at generation time exactly like the subject/teacher/room
    names already on the row. No new index (the Dean page still reads the
    whole table and groups client-side).
  - `convex/schedule.ts`: `sessionValidator` takes the four new fields;
    `SubjectRow` mirrors the `courseId`/`courseCode`/`courseName`/`year`
    that `subjects.listAll` already joins, and each placed session writes
    them through. The placement map now throws if a placed subject is
    missing from the input instead of writing a row with an empty course
    reference (unreachable in practice — the CSP only places subjects it
    was handed — but it keeps the row valid rather than defaulting).
  - `convex/migrations.ts`: idempotent `backfillScheduleCourseAndYear`
    copies each legacy row's course/year from its subject (and the real
    `code`/`name` from `courses`), skipping rows that already carry the
    fields and reporting `{ backfilled, skipped, needsRegenerate }`.
  - Migration ran through the standard **relax → migrate → strict** window
    against dev (`astute-akita-425`): the four columns were pushed as
    `v.optional` via `npx convex dev --once`,
    `npx convex run 'migrations:backfillScheduleCourseAndYear'` backfilled
    **6** rows (OS 101 → BSCS/3, SE 101 → BSCS/4, HCI 101 → BSIT/2 —
    matching the live subject docs) with `skipped: 0`, a second run
    reported `backfilled: 0`, then the required columns were pushed
    again. Verified with `npx convex data schedules` / `npx convex data
    subjects` that every row's course/year matches its subject.
  - `types/schedule.ts`: `ScheduleSession` gains `courseId`, `courseCode`,
    `courseName`, `year`; new `GroupedSchedule` (`key`, `courseId`,
    `courseCode`, `courseName`, `year`, `label` ("BSCS – 1st Year"),
    `subjectCount`, `sessions`).
  - `hooks/useSchedule.ts` — still one hook for the page, now also
    subscribing to `api.subjects.listAll` (the same way `useSubjects`
    already reads `rooms.listAll` / `courses.listAll` for its form) and
    deriving `groups: GroupedSchedule[]`:
    - bucket key is `` `${courseId}-${year}` ``, label comes from the
      shared `SUBJECT_YEAR_LEVEL_LABELS` ("1st Year"), groups sort by
      course name then year;
    - **subjects seed the buckets, sessions fill them** — every Course +
      Year that has a subject is selectable even before anything is
      generated (and its `subjectCount` powers the empty state), while a
      session is grouped by the course/year snapshot on its own row, so a
      stale row can still surface its original group;
    - the hook owns the transient selection (`selectGroup`) and resolves
      `activeGroup` at render time (no effect): a key that no longer
      exists falls back to the first group, so regenerating or deleting
      subjects can never leave the page pointing at a missing bucket;
    - `isLoading`/`error` now cover both queries; `isEmpty` means "no
      groups at all" (no subjects and no sessions).
  - `components/schedule/ScheduleGroupSelector.tsx` (new): shadcn
    `Select` with a `SelectGroup` + `SelectLabel` per course
    ("BSCS · BS Computer Science") and one item per year
    ("1st Year · 4 classes"); the trigger shows the active group's
    `label`. Renders `null` when there are no groups. **A `Select`, not
    `Tabs`** — group count is `courses × 4 years` with courses
    Dean-managed and unbounded, so a select scales and can't overflow
    horizontally on mobile; no new shadcn primitive was needed.
  - `components/schedule/ScheduleGroupSelectorSkeleton.tsx` (new):
    label + trigger shaped `Skeleton`s for the loading state.
  - `components/schedule/SchedulePage.tsx`: selector (or its skeleton)
    above the content with the Generate button, a summary line
    ("6 classes scheduled this week for BSCS – 1st Year."), and
    `renderContent` extended with a per-group branch — a selected group
    with zero sessions renders the shared `EmptyState`
    (CalendarClock, "No classes for BSCS – 1st Year yet" + subject count +
    Generate) instead of an empty table; the table itself now receives
    only the active group's sessions. Loading/error/generate-error paths
    are unchanged.
  - `ScheduleTable` / `ScheduleTableSkeleton` untouched: inside one group
    the course + year is the same on every row, so new columns would be
    noise (the group is named in the selector and the summary line).
  - Verified: root `npx tsc --noEmit` clean, `npm run lint` (0 errors —
    the same 5 pre-existing warnings in `convex/_generated/*` +
    `convex/auth.config.ts`), `npm run build` passes with `/dean/schedule`
    routed, `npx tsx scripts/scheduling-smoke-test.ts` still 39/39 (the
    engine was not touched), and against dev: unauthenticated
    `schedule:listAll` / `subjects:listAll` return
    `{ ok: true, data: [] }` while `schedule:generate` throws
    `Unauthorized`.
  - The **write** path got a live end-to-end check: a real Dean generate ran
    from the app during the session and `npx convex data schedules` shows
    all 8 regenerated rows carrying the correct `courseCode`/`courseId`/
    `courseName`/`year` (CC 106 → BSIT/1, HCI 101 → BSIT/2, OS 101 →
    BSCS/3, SE 101 → BSCS/4 — each matching its subject doc), and
    re-running the migration on the new rows reports `backfilled: 0`. So
    dev currently yields 4 groups, 2 classes each.
  - Not verified in a browser by me (no Dean session here) — the selector
    UI itself has not been eyeballed, see Next Up.

- **Course Management + Course & Year on Subjects (spec 07)** — full unit:
  - `convex/schema.ts`: new `courses` table (`name`, `code`,
    `createdAt`/`updatedAt`) with a `by_code` index; `subjects` gains
    required `courseId` (`v.id("courses")`, new `by_courseId` index) and
    `year` (`1 | 2 | 3 | 4`).
  - `convex/courses.ts` — `listAll` (Result union, `{ ok: true, data: [] }`
    for non-Deans) + `create` / `update` / `remove`, all Dean-gated.
    Codes are normalized to uppercase and de-duplicated through the
    `by_code` index (`assertCodeAvailable` → "Course code "X" is already in
    use"); `remove` refuses while a Subject still references the course
    (names the blocking subject) so the required `subjects.courseId` can
    never dangle.
  - `types/course.ts` (`Course`, `CourseFormValues`, `SubjectYearLevel`),
    `constants/courses.ts` (`SUBJECT_YEAR_LEVELS`,
    `SUBJECT_YEAR_LEVEL_LABELS` = "1st Year"…"4th Year", `DEFAULT_COURSES`
    = BSCS/BSIT). `constants/courses.ts` imports its types **relatively**
    (`../types/course`) so the Convex compiler can consume it, same trick as
    `constants/availability.ts`.
  - `lib/validation/course.ts` (zod `courseFormSchema`: required name,
    required code, letters/numbers/dashes, uppercased on parse).
  - `hooks/useCourses.ts` — one hook for the page: `listAll` query,
    `isLoading`/`isEmpty`/`error`/`isMutating`,
    `addCourse`/`updateCourse`/`deleteCourse` (mirrors `useRooms`).
  - `components/courses/` — `CourseManagement.tsx` (page shell: search +
    add/edit/delete wiring, Skeleton loading, `ErrorState` + reload retry,
    `EmptyState` + "Add course", no-search-results `EmptyState`),
    `CoursesTable.tsx` (Name / Code badge / icon actions),
    `CoursesTableSkeleton.tsx` (row-shaped Skeletons, extracted so the
    table component only renders rows), `CourseFormDialog.tsx` (add/edit,
    zod validation, inline field errors, throw-and-catch submit error),
    `CourseDeleteDialog.tsx` (confirm + inline error). The delete dialog is
    an addition beyond the spec's file list — the Room/Subject CRUD pattern
    it mirrors includes one, and delete is in scope.
  - `app/dean/courses/page.tsx` (thin, renders `<CourseManagement />`),
    `APP_ROUTES.deanCourses` (`/dean/courses`), and a "Manage Courses"
    DeanSidebar item (GraduationCap) in the Manage group — no raw path
    strings (Invariant 2). No new shadcn primitive was needed.
  - `convex/subjects.ts`: `subjectFields` gains `courseId` + `year`;
    create/update verify the course exists ("Selected course does not
    exist"); `listAll` joins courses to expose `courseName`/`courseCode`
    (falling back to `—`), mirroring the room/teacher joins.
  - `types/subjects.ts` (`Subject.courseId`/`year`,
    `SubjectListItem.courseName`/`courseCode`, `SubjectFormValues.courseId`
    /`year`), `lib/validation/subject.ts` (`courseId` required,
    `year: z.coerce.number().pipe(z.literal(SUBJECT_YEAR_LEVELS, …))` so
    the inferred type is the `1 | 2 | 3 | 4` union).
  - `hooks/useSubjects.ts` also queries `api.courses.listAll` and exposes
    `courses` for the form — the spec said "populated from `useCourses()`",
    but one-hook-per-page means the subjects page reads the same
    `courses.listAll` query the courses page uses instead of nesting hooks
    (identical to how it already consumes `rooms.listAll` /
    `teachers.getTeachers`).
  - `components/subjects/SubjectFormDialog.tsx`: required Course select
    (name + code, "No courses available" when the list is empty) and
    required Year select, both above the teacher select, with the shared
    zod field-error treatment.
  - `components/subjects/SubjectManagement.tsx`: new **Course** column
    (code `Badge` + name, like the Category column) and **Year** column
    (`Year N` outline `Badge`); skeleton rows and the search filter
    (name/teacher/room/course code/course name/room type/year label) both
    updated.
  - Seed + migration: `convex/migrations.ts` gained `seedCourses`
    (idempotent — inserts the `DEFAULT_COURSES` BSCS/BSIT only when the
    code is absent) and `backfillSubjectCourseAndYear` (attaches each
    legacy subject to the first course and year 1, requires the seed to
    have run first). Ran through the standard **relax → migrate → strict**
    window (`npx convex dev --once`, optional columns, run both mutations,
    required columns, push again): `seedCourses` seeded 2,
    `backfillSubjectCourseAndYear` backfilled 3 (all → BSCS, year 1), and
    both report 0 on a second run. The two older subject backfills
    (`backfillSubjectRoomIds`, `backfillSubjectRemoveDayPattern`) now skip
    docs that predate Course/Year, since a `db.replace` under the strict
    schema must carry every required field.
  - Verified: root `npx tsc --noEmit` clean, `npm run lint` (0 errors — the
    same 5 pre-existing warnings in `convex/_generated/*` +
    `convex/auth.config.ts`), `npm run build` passes with `/dean/courses`
    routed, `npx tsx scripts/scheduling-smoke-test.ts` still 39/39 (the
    engine does not read Course/Year), and against dev: `convex data
    courses` shows BSCS + BSIT, `convex data subjects` shows all 3 subjects
    with a `courseId` + `year: 1`, unauthenticated `courses:listAll` /
    `subjects:listAll` return `{ ok: true, data: [] }` and
    `courses:create` throws `Unauthorized`.
  - Not verified in a browser yet (no Dean session here) — see Next Up.

- **Algorithm Chooses the Day Pattern (MW / TTh), not the Dean** — full unit:
  - `convex/scheduling/types.ts`: `SchedulingSubject` no longer carries
    `dayPattern`; `PlacedSession` gains `dayPattern`;
    `InfeasibilityReason` is now `{ subjectName, durationMinutes, patterns }`
    where `patterns: readonly PatternInfeasibility[]`
    (`{ dayPattern, day1FreeWindows, day2FreeWindows, cause, message }`);
    `CspInfeasibleReason` drops `invalid-pattern` (no pattern to validate).
  - `convex/scheduling/csp.ts` rewritten: new `SubjectDomain
    { subject, options }` — one `SubjectUnit` per pattern (MW first, then
    TTh), each with its own candidates; `expandSubjectsIntoSessions` returns
    `{ domains, reasons, reason }`, generating an infeasibility reason only
    when BOTH patterns have zero candidates. Search sorts domains by **total
    candidate count across both options** (MRV) then plans each subject by
    trying MW candidates then TTh candidates — a subject is infeasible only
    if neither pattern fits. `diagnoseFailedPlacement` greedily places
    domains the same way; `toPlacedSessions` tags each session's pattern;
    `invalid-pattern` validation removed.
  - `convex/scheduling/cspDiagnostics.ts`: new `explainPatternFailure`
    (per pattern: cause + windows + message); `explainInfeasibility` returns
    one entry per pattern (MW then TTh) so the UI can show exactly what
    blocks each. `freeWindowsForDay`/`sharedStartTimes` unchanged.
  - `convex/scheduling/validate.ts`: pattern days now come from the placed
    session's `dayPattern` (not the subject); pair/time/room/block checks
    unchanged.
  - `convex/scheduling/ga.ts`: after `expandSubjectsIntoSessions`, builds one
    unit per subject by matching each domain's option to the seed solution's
    chosen pattern (fallback: first option), locking the CSP's pattern choice
    into the GA's chromosome; decode/validate unchanged.
  - `convex/schedule.ts`: `sessionValidator` + written sessions carry
    `dayPattern`; `SubjectRow`/`buildSchedulingInput` drop it; single-subject
    infeasibility summary now references "can't place on either MW or TTh".
  - `convex/schema.ts`: `subjects` drops `dayPattern`;
    `schedules` adds required `dayPattern`.
  - `convex/subjects.ts`: `subjectFields`/create/update drop `dayPattern`.
  - `convex/migrations.ts`: added idempotent `backfillSubjectRemoveDayPattern`
    (rewrites subject docs without the field) and
    `backfillScheduleDayPatterns` (derives each old row's pattern from its
    actual days: {0,2}→MW, {1,3}→TTh); `backfillSubjectRoomIds` replace no
    longer writes `dayPattern`; obsolete `backfillSubjectDayPatterns` removed.
  - Frontend: `types/subjects.ts`, `lib/validation/subject.ts`,
    `components/subjects/SubjectFormDialog.tsx` (pattern select removed),
    `components/subjects/SubjectManagement.tsx` (pattern column + search
    terms removed); `types/schedule.ts` (`ScheduleSession.dayPattern`;
    `InfeasibleSubject.patterns: InfeasiblePattern[]`);
    `components/schedule/ScheduleTable.tsx` (pattern badge reads
    `sessions[0].dayPattern`); `components/schedule/ScheduleGenerationError.tsx`
    (per-pattern accordion entries: pattern badge + cause label + message +
    both days' free-window blocks).
  - Migration (dev): raw data had 3 subjects WITH `dayPattern` and 6 schedule
    rows WITHOUT it. Since this CLI (Convex 1.46) exposes no
    `schema:push --relax`, the window was expressed in the schema itself:
    (1) `subjects.dayPattern` / `schedules.dayPattern` made optional, push;
    (2) ran `migrations:backfillSubjectRemoveDayPattern` (cleaned 3) and
    `migrations:backfillScheduleDayPatterns` (backfilled 6 — all MW, matching
    their day indexes); (3) final schema (subject field removed, schedule
    field required), re-push. Verified via `convex data` that subjects have
    no `dayPattern` and every schedule row does.
  - Verification: `scripts/scheduling-smoke-test.ts` rewritten —
    **39/39 assertions**: feasible case with MW-default (every subject lands
    Mon+Wed), Math still pinned to slot 9, GA stays valid while keeping the
    seed-chosen pattern, **TTh fallback when MW is fully blocked**,
    25-subject one-room overflow → `no-room-available`, duration validation,
    SE 101 dev mirror, 3-subject dev seed, fully-blocked teachers → one
    reason per subject with **both** patterns explained (empty windows + "No
    matching start time"), pattern-availability mirroring, and a reworked
    room-vs-teacher distinction (TTh fully blocked so the pair can't split —
    MW reports `no-room-available`, TTh reports `no-shared-teacher-window`).
    Root `npx tsc --noEmit` clean, `npm run lint` (0 errors — same
    5 pre-existing warnings), `npm run build` passes, functions + schema
    pushed to dev.

- Initial project scaffold (Next.js 16 + Convex + Clerk)
- Convex user synchronization and user schema (upsert by Clerk user id)
- Role-based routing and dashboards for Dean and Teacher roles
- Installed shadcn (`init --defaults`, style `base-nova`, base: Base UI)
  — generated `components.json`, `lib/utils.ts`, `components/ui/*`
- Installed `lucide-react` (done by shadcn init; iconLibrary = lucide)
- Added shadcn sidebar + deps (button, input, separator, skeleton,
  tooltip, sheet, `hooks/use-mobile.ts`)
- Added dean nav routes to `constants/routes.ts`:
  `APP_ROUTES.deanRooms` ("/dean/rooms"), `APP_ROUTES.deanSubjects`
  ("/dean/subjects")
- Built `components/DeanSidebar.tsx` — shadcn Sidebar (`collapsible="icon"`)
  with lucide icons: Dashboard, Manage Rooms, Manage Subjects; uses
  `usePathname` for active state; links via `next/link`
- Built `app/dean/layout.tsx` — `SidebarProvider` + `DeanSidebar` +
  content column with `SidebarTrigger`; gateway `requireRole(ROLES.dean)`
  for every dean route
- Root layout now defines `--app-header-height` (3.5rem) on `<body>`;
  `AppHeader` uses it, and the Dean sidebar offsets below the white header
  so it never overlaps top chrome
- **Dean Subject CRUD (spec 02)** — full unit:
  - Installed shadcn `table`, `badge`, `dialog`, `select`, `label`,
    `alert-dialog` primitives; added `zod` dependency
  - Added `subjects` table to `convex/schema.ts` (name, durationMinutes,
    meetingsPerWeek, roomType `lecture|lab`, teacherId = Clerk user id,
    createdAt/updatedAt) + `by_teacherId` index; added `by_role` index on
    `users` for teacher lookup
  - `convex/subjects.ts` — `listAll` (subjects joined with teacher name),
    `getTeachers` (dropdown options), `create` / `update` / `remove`
    mutations; all write mutations gate on Dean identity; teacherId is
    verified against an existing `role=teacher` user; queries return a
    `{ ok, data } | { ok: false, error }` Result union (never throw)
  - `types/subjects.ts` (`Subject`, `SubjectListItem`, `SubjectFormValues`,
    `TeacherOption`, `RoomType`), `constants/subjects.ts` (`ROOM_TYPES`,
    `ROOM_TYPE_LABELS`), `lib/validation/subject.ts` (zod
    `subjectFormSchema`)
  - `lib/result.ts` — `Result<T>` union + `errorMessage` helper
  - `components/shared/EmptyState.tsx` and `components/shared/ErrorState.tsx`
    (Skeleton-based, per code-standards)
  - `hooks/useSubjects.ts` — one hook per page: subjects + teachers queries,
    `isLoading`/`isEmpty`/`error`, `addSubject`/`updateSubject`/`deleteSubject`
  - `components/subjects/SubjectManagement.tsx` (search, add/edit/delete
    wiring, table with Category badge column + icon actions, Skeletons),
    `SubjectFormDialog.tsx` (add/edit modal, zod validation, controlled Base
    UI selects), `SubjectDeleteDialog.tsx` (confirm + inline error)
  - `app/dean/subjects/page.tsx` now renders `<SubjectManagement />`
  - Fixed vendored `hooks/use-mobile.ts` `react-hooks/set-state-in-effect`
    lint error — rewrote with `useSyncExternalStore` (SSR-safe, no effect
    setState)
  - **Role claim fix** (teacher assignment was empty): Clerk's JWT carries
    the role at `metadata.role`, but Convex read `identity.role` (top-level)
    → `upsertUser` stored no role and `isDean` was false, so `listAll`/
    `getTeachers` returned empty and mutations threw Unauthorized. Added
    `convex/roles.ts` (`roleOf` reads `metadata.role ?? role`, `isDean`),
    used by `users.ts` and `subjects.ts`. Existing users re-patch their role
    on next `useUserSync` page load.
  - **Teacher sync from Clerk**: teacher dropdown was disabled because
    Convex `users` had no `role=teacher` rows unless the teacher had logged
    in after the role fix. Added `convex/teachers.ts` —
    `syncFromClerk` action calls the Clerk API (`users?limit=500`, paginated,
    filtered to `public_metadata.role === "teacher"`) and upserts them via
    `upsertTeacher`; set `CLERK_SECRET_KEY` as a Convex deployment env var;
    `getTeachers` query + `listAll` teacher-name join moved to read Convex.
    `useSubjects` triggers the action once per session; teacher select is no
    longer disabled.
  - **Teacher names**: dropdown + subjects table display "First Last"
    from Clerk (`firstName`/`lastName`, email only as fallback);
    `scripts/seed-users.ts` now sets first/last names for the seeded
    accounts so Clerk always carries them (run against live Clerk).
  - Verified: `npm run lint` (0 errors), `npm run build` passes
- **Dean Room CRUD (spec 03)** — full unit:
  - Added `rooms` table to `convex/schema.ts` (name, type
    `lecture|lab`, createdAt/updatedAt)
  - `convex/rooms.ts` — `listAll` (Result union), `create` / `update` /
    `remove` mutations; all write mutations gate on Dean identity
  - Moved `RoomType`/`ROOM_TYPES`/`ROOM_TYPE_LABELS` from
    `types/subjects.ts`+`constants/subjects.ts` into
    `types/rooms.ts`/`constants/rooms.ts` (deleted
    `constants/subjects.ts`); `subjects` now imports them from rooms
  - `types/rooms.ts` (`Room`, `RoomFormValues`),
    `lib/validation/room.ts` (zod `roomFormSchema`)
  - `hooks/useRooms.ts` — one hook per page: listAll query,
    `isLoading`/`isEmpty`/`error`, `addRoom`/`updateRoom`/`deleteRoom`
  - `components/rooms/RoomManagement.tsx` (search + add/edit/delete
    wiring, table with Category badge column + icon actions, Skeletons),
    `RoomFormDialog.tsx` (add/edit modal, zod validation, controlled
    Base UI select), `RoomDeleteDialog.tsx` (confirm + inline error)
  - `app/dean/rooms/page.tsx` now renders `<RoomManagement />`
  - **Subjects now select a real Room** (spec 03): `subjects.roomType`
    replaced with `subjects.roomId` (Convex `v.id("rooms")`); the
    subject form's hard-coded Lecture/Lab select is now a "Room" select
    populated from `api.rooms.listAll`; `listAll` joins rooms to expose
    `roomName`/`roomType`; create/update validate the room exists;
    `useSubjects` exposes `rooms` for the form; the subjects table shows
    the Category badge + connected room name and search covers it
  - Verified: `npm run lint` (0 errors), `npm run build` passes
- **Legacy subjects schema fix (post spec 03)** — resolved, live:
  - Existing subject docs (created pre-spec-03) stored `roomType` and had
    no `roomId`, so Convex schema validation failed on every push
    (missing `roomId`; the extra `roomType` field was also rejected once
    `roomId` was optional). Fixed the stored data, not the code:
  - Added `convex/migrations.ts` — internal, idempotent
    `backfillSubjectRoomIds`: for each subject missing `roomId`, reuse an
    existing room of the subject's stale type or create a `Legacy
    <Type>` fallback room, then `ctx.db.replace` the doc with `roomId`
    (drops the stale `roomType`)
  - Ran it against dev (astute-akita-425): temporarily relaxed the
    schema (`roomId`/`roomType` optional) so the migration could deploy
    and run — the strict push would otherwise block on the invalid doc.
    After backfill (1 doc, `SE 101` → created `Legacy Lab`), restored
    the strict schema and re-pushed; validation now passes.
  - Verified `subjects` and `rooms` via `npx convex run --inline-query`
    (inline-query sandbox works if double quotes are written as single
    quotes in PowerShell 5.1, which otherwise strips `"` from native
    args); `npm run lint` (0 errors), `npm run build` passes
- **Teacher Availability (spec 04)** — full unit:
  - Installed shadcn `toggle`, `toggle-group`, `sonner` via CLI (deps
    added: `sonner`, `next-themes`)
  - Added `availability` table to `convex/schema.ts` (teacherId = Clerk
    user id, blockedSlots `string[]`, createdAt/updatedAt) +
    `by_teacherId` index
  - `convex/availability.ts` — `getMine` query + `setMine` mutation;
    both gate on teacher role (`roleOf`); `getMine` returns the doc's
    `blockedSlots` (or `[]`); `setMine` validates every slot key against
    known bounds (6 days × 12 slots) before upserting (insert or patch)
  - Slot keys are strings `"<dayIndex>-<timeIndex>"` — `0..5` =
    Mon–Sat, `0..11` = 7:30 AM–7:30 PM 60-min slots (bounds updated by the
    school-hours unit — the validator derives them from
    `constants/availability.ts` now, no plain-number copies)
  - `types/availability.ts` (`AvailabilityDay`, `AvailabilityTimeSlot`,
    `AvailabilitySlotKey`) + `constants/availability.ts`
    (`AVAILABILITY_DAYS`, `AVAILABILITY_TIME_SLOTS`,
    `availabilitySlotKey` / `parseAvailabilitySlotKey` /
    `availabilitySlotLabel`)
  - `hooks/useAvailability.ts` — one hook per page: `getMine` query,
    `isLoading`/`isEmpty`/`error`/`isSaving`, `save` mutation (stable
    `EMPTY_BLOCKED` reference so the page can hydrate draft without
    render loops)
  - `components/availability/AvailabilityGrid.tsx` (toggle grid via
    shadcn `Toggle` + `Tooltip` per cell, horizontally scrollable on
    small screens, `overflow-x-auto` + `min-w-[42rem]`),
    `AvailabilityGridSkeleton.tsx` (matching grid-shaped Skeletons),
    `AvailabilityPage.tsx` (page-level component: draft `Set` state
    hydrated once from the hook, Save persists full set, Reset reverts,
    sonner toasts, inline blocked-count summary, `ErrorState` retry)
  - **Sidebar refactor**: extracted shared `components/shared/AppSidebar.tsx`
    (takes `groups` prop) — `DeanSidebar` now wraps it with `DEAN_NAV`;
    added `components/TeacherSidebar.tsx` with `TEACHER_NAV`
    (Dashboard / Availability / My Schedule); no duplicated sidebar code
  - New routes: `APP_ROUTES.teacherAvailability` (`/teacher/availability`),
    `APP_ROUTES.teacherSchedule` (`/teacher/schedule`)
  - `app/teacher/layout.tsx` — `SidebarProvider` + `TeacherSidebar` +
    content column, `requireRole(ROLES.teacher)` (mirrors dean layout;
    plain `<div>` for content, no nested `<main>`)
  - `app/teacher/availability/page.tsx` renders `<AvailabilityPage />`;
    `app/teacher/schedule/page.tsx` is a `"use client"` placeholder
    (EmptyState) so the My Schedule nav link doesn't 404 (no real
    schedule yet)
  - Mounted `components/ui/sonner` `<Toaster position="top-right" />` in
    the root `app/layout.tsx` (inside the main column) for save/error
    toasts
  - Fixed runtime issue caught after build: passing a lucide icon
    component from a Server Component page into client `EmptyState` is
    not allowed (`Only plain objects can be passed to Client Components`)
    → schedule page is now a client component
  - Verified: `npm run lint` (0 errors — only pre-existing warnings in
    `convex/_generated/*` and `convex/auth.config.ts`), `npm run build`
    passes; `convex codegen` pushed the schema/functions to dev; ran
    `availability:getMine` (ok/empty unauthenticated) and
    `availability:setMine` (throws Unauthorized as expected) via
    `npx convex run`
- **Schedule Generation (spec 05)** — full unit:
  - Pure scheduling engine in `convex/scheduling/` (zero Convex imports,
    runs under plain `tsx`): `types.ts` (`SchedulingInput`, `PlacedSession`,
    `CspInfeasibleReason`, `CspResult`, `GaOptions`), `util.ts`
    (`intervalsOverlap`), `csp.ts` (`runCSP` backtracking search +
    `buildSessionUnits` + `greedyDecode` + `validateSchedulingInput`),
    `validate.ts` (`validateSolution` hard-constraint check), `ga.ts`
    (`runGA` permutation GA with greedy decode, valid-by-construction)
  - CSP decides the schedule (always runs). Hard constraints: no
    double-booked teacher, no double-booked room, room type must match the
    subject's room, subject never in a teacher-blocked slot, every subject
    placed exactly `meetingsPerWeek` sessions of `durationMinutes` each.
    Soft constraints (day spread, idle gaps, workload) are GA fitness only —
    not enforced by CSP.
  - Time model = the availability grid (Mon–Sat × 12 × 60-min, 7:30 AM–7:30 PM);
    `durationMinutes` must be a whole multiple of the 60-min slot
    (SE 101 = 180 min = 3 consecutive slots). Grid bounds come from
    `constants/availability.ts` only.
  - `convex/schema.ts`: new `schedules` table — one row per placed session
    (subjectId/Name, teacherId/Name, roomId/Name, roomType, dayIndex,
    startMinutes, endMinutes, createdAt/updatedAt) + `by_teacherId` index;
    an atomic snapshot — regenerating clears and rewrites all rows
  - `convex/schedule.ts`: `generate` action (Dean-gated) reads
    `rooms.listAll`/`subjects.listAll` queries + internal `listAvailability`,
    maps to a `SchedulingInput`, runs `runCSP`, defensively re-validates the
    result, then `saveGenerated` (internal mutation) clears old rows and
    inserts the new timetable in one transaction; returns
    `{ ok, count } | { ok: false, error }` (error = CSP infeasibility reason
    message). `listAll` query (Dean-gated, Result union) feeds the page.
  - `hooks/useSchedule.ts` — one hook per page: `listAll` query +
    `useAction(api.schedule.generate)`, `isLoading`/`isEmpty`/`error`/
    `isGenerating`/`generateError`/`generate`; sessions sorted Mon→Sat then
    by start time (`byTimeOfWeek`)
  - `types/schedule.ts` (`ScheduleSession`, `GenerateScheduleResult`),
    `constants/routes.ts` `APP_ROUTES.deanSchedule` (`/dean/schedule`),
    DeanSidebar "Generate Schedule" item (CalendarCog, Manage group)
  - `components/schedule/ScheduleTable.tsx` (Subject / Teacher / Room + type
    Badge / Day / Time via `AVAILABILITY_DAYS` + `formatClock`),
    `ScheduleTableSkeleton.tsx`, `SchedulePage.tsx` (loading → skeleton,
    query error → `ErrorState` + reload retry, generate failure →
    `ErrorState` retry = re-generate, empty → `EmptyState` + Generate button,
    else table; sonner success/error toasts; spinner while generating);
    `app/dean/schedule/page.tsx` renders `<SchedulePage />`
  - Fixed along the way: `constants/availability.ts` now imports
    `types/availability` relatively (Convex's tscc can't resolve `@/` inside
    `convex/`-imported files); explicit result type annotations in `generate`
    to break TS weather inference circularity on same-module helpers
  - Verification: `scripts/scheduling-smoke-test.ts` (`npx tsx`) — 14/14
    assertions: feasible case (8 sessions, zero violations), GA output stays
    valid vs CSP seed, blocked-slot respect, capacity overflow →
    `exhausted`, non-multiple-of-60 → `invalid-duration`, fully-blocked
    teacher, empty rooms, plus a case mirroring live dev data (SE 101
    180-min lab ×2 in `IT Lab 1`, no availability → exactly 2 sessions, zero
    violations). Root `npx tsc --noEmit` clean, `npm run lint` (0 errors),
    `npm run build` passes (`/dean/schedule` routed); `convex codegen`
    pushed functions to dev, where an unauthenticated
    `schedule:generate` throws `Unauthorized` and `schedule:listAll` returns
    `{ ok: true, data: [] }`
- **Fixed Day-Pair Scheduling (MW / TTh)** — full unit:
  - `constants/dayPatterns.ts` — single source for `DayPattern` (`"MW" |
    "TTh"`), `DAY_PATTERNS`, `DAY_PATTERN_OPTIONS`, `DAY_PATTERN_LABELS`
    ("MW (Mon & Wed)" / "TTh (Tue & Thu)"), and
    `DAY_PATTERN_DAY_INDEXES` (`MW = [0, 2]`, `TTh = [1, 3]` on the
    Mon=0…Sat=5 grid). **No imports** — the Convex-side compiler can't
    resolve `@/`, so the engine files import it relatively
    (`../../constants/dayPatterns`).
  - `types/subjects.ts` + `lib/validation/subject.ts`: `meetingsPerWeek`
    → `dayPattern` (required, zod `z.enum(["MW","TTh"])`).
  - `convex/scheduling/types.ts`: subject now carries `dayPattern`;
    `PlacedSession.meetingIndex` removed; `invalid-meetings` reason
    replaced by `invalid-pattern`.
  - `convex/scheduling/csp.ts` rewritten to the pair model:
    `expandSubjectsIntoSessions` emits exactly 2 fixed-day sessions per
    subject whose candidate slots are times the teacher is free on **both**
    pattern days; `runCSP` places/unplaces the pair atomically. Day is now
    an input, not a choice — the CSP solves only the time (room and day
    come from the subject/pattern).
  - `convex/scheduling/validate.ts`: pair invariants — exactly 2 sessions,
    correct pattern days, same time, same room; keeps teacher/room
    double-book, room type, blocked-slot, and bounds checks.
  - `convex/scheduling/ga.ts`: chromosome is now a permutation of
    **subject-pair units** (decode moves pairs atomically); removed the
    per-subject day-spread penalty that no longer applies. Still standalone
    / not wired into `generate`.
  - `convex/schedule.ts`: `SubjectRow` gains required `dayPattern`; passes
    straight into `SchedulingSubject`.
  - `convex/schema.ts` → `convex/migrations.ts`: added
    `backfillSubjectDayPatterns` (internal, idempotent: legacy docs →
    `dayPattern: "MW"`, strips `meetingsPerWeek`); `backfillSubjectRoomIds`
    replace shape updated. Ran through the same **relaxed → migrate →
    strict** window as the spec-03 backfill; dev now has 3 subjects, all
    `dayPattern: "MW"`, no `meetingsPerWeek` field.
  - `convex/subjects.ts`: `subjectFields` validator + create/update write
    `dayPattern`.
  - `components/subjects/SubjectFormDialog.tsx`: meetings number input →
    day-pattern `Select` (options from `DAY_PATTERN_LABELS`);
    `components/subjects/SubjectManagement.tsx`: "Meetings" → "Schedule
    Pattern" column (both skeleton + data) rendering a `Badge` with the
    pattern; search covers the pattern too. (Note: the sub-table lives
    inline in `SubjectManagement.tsx` — there is no
    `components/subjects/SubjectsTable.tsx`.)
  - `components/schedule/ScheduleTable.tsx`: one **grouped row per
    subject** with a "Schedule Pattern" column (badge + "Mon & Wed" /
    "Tue & Thu" via `DAY_PATTERNS`); clean pairs collapse to a single row,
    non-clean pairs fall back to per-session rows. Column layout matched
    dev data (all MW subjects) and follows `component/table` — `ui-context.md`
    is an unfilled template with no table guidance, so per-session rows +
    grouping was chosen by me and should be sanity-checked in the browser.
  - `components/schedule/ScheduleTableSkeleton.tsx`: header + skeleton
    cells updated for the pattern column.
  - `scripts/scheduling-smoke-test.ts` rewritten for the paired model:
    **26/26 assertions** (`npx tsx`) — feasible case (6 sessions, 6 hard
    constraints), per-pattern pair integrity (same time + same room, days
    [0,2] / [1,3]), blocked-on-either-day forces the pair to slot 9, GA
    validity + pair integrity, 11 TTh subjects → `exhausted`,
    invalid-duration, invalid-pattern, SE 101 3-hr lab mirror, the **full
    dev seed (3 MW labs, one teacher)** yielding 6 linked sessions with
    zero teacher double-books, blocked-teacher → `no-slot-fits`, empty
    rooms → `no-rooms`.
  - Migration + verification: pushed the relaxed schema, ran
    `backfillSubjectDayPatterns` (3 backfilled), restored the strict
    schema, re-pushed. Verified via inline-query that every subject doc has
    `dayPattern` and no `meetingsPerWeek`; unauthenticated
    `schedule:generate` still throws `Unauthorized`; `schedule:listAll` /
    `subjects:listAll` return `{ ok: true, data: [] }` (listAll is
    role-scoped — populated only for the owner/login). Root `npx tsc
    --noEmit` clean, `npm run lint` (0 errors — same pre-existing
    warnings), `npm run build` passes.
- One transient fix during the migration window: `schedule.ts`'s
     `SubjectRow.dayPattern` was made optional while the relaxed schema made
     `listAll` return `dayPattern?`; re-tightened to required after the
     strict re-push.
- **School Hours 7:30 AM–7:30 PM + Detailed Infeasibility Reasons** — full
  unit:
  - **Hours single-sourced**: `constants/availability.ts` now defines
    `AVAILABILITY_START_MINUTES = 7 * 60 + 30` (7:30 AM) and
    `AVAILABILITY_END_MINUTES = 19 * 60 + 30` (7:30 PM); slots stay 60-min
    → the grid is now 12 slots/day (7:30 AM–6:30 PM slots) instead of 10.
    This is the one source of the bounds; `csp.ts`/`ga.ts`/`validate.ts`/
    `cspDiagnostics.ts` read the grid from `input.timeSlots`, which
    `convex/schedule.ts` builds from the same constants.
  - **Validator synced to the source**: `convex/availability.ts` replaced its
    hardcoded `DAY_COUNT = 6` / `TIME_SLOT_COUNT = 10` with
    `AVAILABILITY_DAYS.length` / `AVAILABILITY_TIME_SLOTS.length` (now 12),
    so out-of-range slot keys ("stray" data outside 7:30 AM–7:30 PM) are
    rejected against the true bounds.
  - `AvailabilityGrid`/`AvailabilityGridSkeleton` derive rows/columns from
    the same constants (6 days × 12 slots) — skeleton no longer has a
    hardcoded 60-cell count.
  - **Detailed diagnostics**: new `convex/scheduling/cspDiagnostics.ts`
    (renamed from a hyphenated filename — Convex module paths reject `-`)
    with `explainInfeasibility(subject, input, placedSessions)` returning a
    structured `InfeasibilityReason` (`subjectName`, `dayPattern`,
    `durationMinutes`, `day1FreeWindows`, `day2FreeWindows`,
    `cause`, `message`) per failed subject. Teacher free windows are the
    maximal contiguous free runs (blocked slots minus other placed sessions
    of the same teacher) long enough to fit the duration, within school
    hours. Cause is `no-shared-teacher-window` (no start free on both
    pattern days), `no-room-available` (shared starts exist but the assigned
    room is occupied at all of them), or `unknown`.
  - `convex/scheduling/types.ts`: `CspResult` failure now carries
    `reasons: readonly InfeasibilityReason[]` for placement failures; the
    `no-slot-fits` and `exhausted` codes were removed (single
    `CspInfeasibleReason` remains for config errors: no-subjects, no-rooms,
    invalid-pattern, invalid-duration, no-matching-room).
  - `csp.ts`: `expandSubjectsIntoSessions` no longer fails fast on the first
    teacher-blocked subject — it collects one reason per subject with no
    shared window; `runCSP` returns those reasons, and on a backtracking
    `MAX_ATTEMPTS`/exhausted failure returns per-subject reasons from
    `diagnoseFailedPlacement` (a greedy pass in the same unit order that
    explains each subject that collides with the rest). Shared helpers
    `blockedByDayFor`/`intervalsOverlap` moved to `util.ts` (also used by
    `validate.ts` — removed its duplicate).
  - `convex/schedule.ts` `generate` returns `{ ok: false, error,
    infeasibleSubjects }` (the structured reasons array) instead of a single
    string; generic config errors still return just `{ ok: false, error }`.
    `types/schedule.ts` + `hooks/useSchedule.ts` mirror it
    (`generateError` + `infeasibleSubjects`).
  - **UI**: new `components/schedule/ScheduleGenerationError.tsx` — a richer
    error state using the shared ErrorState tokens (Skeleton icon, muted
    card, retry button) that lists each failed subject in a shadcn
    `accordion` (installed via CLI; Base UI) with subject name + day-pattern
    badge + minutes, the structured cause label, the plain-language
    `message`, and the free windows per pattern day formatted via
    `formatClock` ("7:30 AM–8:30 AM"). One subject is open by default.
    `SchedulePage` renders it when `infeasibleSubjects` is present, else the
    plain `ErrorState`.
  - `scripts/scheduling-smoke-test.ts` rebuilt on the new 7:30 AM–7:30 PM
    grid (derived from `AVAILABILITY_TIME_SLOTS`, not hand-counted) —
    **33/33 assertions**: existing coverage plus new diagnostic tests —
    no-shared-window across Mon/Wed (asserts the exact free windows and
    cause), room-caused distinction (two subjects sharing one room, teacher
    free on both days, room taken at every shared start → `no-room-available`
    on the blocked subject), and 13-subject one-room overflow →
    `no-room-available`.
  - Verified: `npx tsx scripts/scheduling-smoke-test.ts` (33/33), root
    `npx tsc --noEmit` clean, `npm run lint` (0 errors — same pre-existing
    warnings), `npm run build` passes, `npx convex codegen` pushes cleanly.
  - Note: this project's slot step is 60 minutes, not the 30 the change
    brief assumed; left at 60 (the brief's "leave as-is unless runtime is
    excessive" — it isn't; the 13-subject overflow resolves instantly).
- **Teacher Availability by Day-Pair (spec 06)** — full unit:
  - Availability is entered once per day-pair, not per individual day:
    `AvailabilityGrid.tsx` is now a **2-column** grid ("Mon & Wed" / "Tue &
    Thu" with the `MW` / `TTh` code beneath), each toggle applies to both days
    of the pair; `AvailabilityGridSkeleton.tsx` mirrors the 2 columns;
    `AvailabilityPage` toggles by `(dayPattern, timeSlotIndex)` and counts
    `2 × 12` slots; the page/empty-state copy explains that a block covers
    both days.
  - **Blocked cells are now red** (`bg-destructive` +
    `text-destructive-foreground`) instead of the green accent. Added
    `--destructive-foreground` (light/dark) to `globals.css` + mapped it in
    `@theme inline`. Rationale: blocked = unavailable = the destructive
    semantic, and it visually separates availability from the sidebar's green
    accent.
  - Slot keys changed from `"<dayIndex>-<timeIndex>"` to
    `"<pattern>-<timeIndex>"` (`MW-0`, `TTh-11`): `constants/availability.ts`
    now exports `availabilityPatternKey` / `parseAvailabilityPatternKey` /
    `availabilityPatternSlotLabel` / `areaPatternLabel`, and
    `AVAILABILITY_PATTERNS` = `DAY_PATTERN_OPTIONS`. It imports only types +
    the import-free `constants/dayPatterns.ts`, so Convex's tscc still
    resolves it. `convex/availability.ts`'s validator is now just "string
    parses via `parseAvailabilityPatternKey`" (bounds included).
  - Engine consumes patterns: `SchedulingAvailability.blockedByDay` →
    `blockedByPattern: { dayPattern, slotIndexes }[]`
    (`convex/scheduling/types.ts`); `convex/scheduling/util.ts`
    `blockedByDayFor` resolves each pattern's blocks onto **both** of its
    days, so the two days of a pair always carry identical blocks and a
    Mon-vs-Wed (or Tue-vs-Thu) availability mismatch is structurally
    impossible to express. `csp.ts`/`validate.ts`/`cspDiagnostics.ts`
    unchanged apart from the util helper — they read the resolved day map.
    The `no-shared-teacher-window` cause can now only come from per-day
    placed-session differences or a fully-blocked pattern (diagnostic
    docstring updated). `convex/schedule.ts` `buildSchedulingInput` parses
    the new keys into `blockedByPattern`.
  - Migration `backfillAvailabilityDayPairs` (internal, idempotent) converts
    legacy `"<day>-<slot>"` keys to pattern keys with **union** semantics (a
    time is blocked on the pair if it was blocked on EITHER day — the
    conservative choice; flagged in Open Questions). Ran against dev: 1 doc
    converted; a second run returns 0 (idempotent). No relaxed-schema window
    was needed — the `availability` table shape (`blockedSlots: string[]`) is
    unchanged, only the key format differs.
  - Smoke test rebuilt for patterns: **35/35 assertions** — fixtures use
    `blockedByPattern`; "MW slots 0-8 blocked → pair to slot 9" kept; the old
    Mon-freely/Wed-busy mismatch case (now unexpressible) was replaced by a
    structural test asserting free windows are identical on both pattern days
    (`freeWindowsForDay`, slot 0 = 7:30–8:30 AM) plus a fully-blocked-pattern
    `no-shared-teacher-window` case with empty windows on both days.
  - Verified: `npx tsx scripts/scheduling-smoke-test.ts` (35/35), root
    `npx tsc --noEmit` clean, `npm run lint` (0 errors — same pre-existing
    warnings), `npm run build` passes, `npx convex codegen` pushed cleanly.
  - Note: Friday/Saturday were days on the old grid but can't hold any class
    today (patterns only cover Mon-Wed / Tue-Thu), so the availability UI no
    longer offers them (see Open Questions).

## In Progress

- None. Spec 09 (conflict alert on the generated schedule page) is complete
  and pushed to dev; the CSP/GA engine is unchanged apart from diagnostic
  output.

## Next Up

1. Sanity-check spec 09 in the browser with a real Dean login: force a
   generate failure (block a teacher's whole MW pair, or point two subjects at
   one room so it is taken at every shared start) and confirm the
   `ConflictAlert` names the room + the class holding it + the overlapping
   time, or the teacher + the blocked window, with one alert per failed
   subject and the accordion when several fail. The alert's border/destructive
   styling has not been eyeballed.
2. Sanity-check spec 08 in the browser with a real Dean login: switch
   through every Course + Year group in the `/dean/schedule` selector,
   confirm each view shows only that group's sessions, and confirm a
   group with subjects but no placed classes renders the shared
   `EmptyState`. The selector's grouped `Select` (per-course group
   labels, per-year class counts) has not been eyeballed — group labels
   and mobile layout especially.
3. Sanity-check spec 07 in the browser with a real Dean login: add/edit/
   delete a Course at `/dean/courses`, create a Subject with the new
   Course/Year selects (and confirm submit is blocked without them), and
   read the Course/Year columns in the subjects table. Lint/build/smoke are
   green and the dev data is migrated, but the UI has not been eyeballed.
4. Teacher My Schedule view (real, read-only, not placeholder) — consumes
   the generated `schedules` rows filtered by teacher id
5. Dean schedule view polish / student-facing schedule (out of scope until
   confirmed in specs)
6. (Optional, later) Wire `runGA` into the `generate` action once soft
   constraints come in scope — `convex/scheduling/ga.ts` is already built,
   standalone-tested (pair-atom chromosomes), and left with a clear call
   site
7. Sanity-check the 2-column availability grid in the browser (real teacher
   login): red blocked cells, save/reset round-trip, tooltip labels — the
   pattern keys and grid are covered by lint/build/smoke, but the visual/UX
   hasn't been eyeballed

## Open Questions

- **Spec 09's drag-and-drop half does not exist (asked by the spec, answered —
  N/A)**: the spec wants the same alert after "a failed or auto-adjusted
  drag-and-drop action", consumed from a structured `reschedule.ts` result.
  There is no `reschedule.ts`, no `ScheduleCalendar`, and no drag/auto-reschedule
  code anywhere in the repo (same finding as the spec 08 calendar bullets —
  `project-overview.md` lists **manual drag-and-drop schedule editing as Out
  of Scope**, and Invariant 5 forbids client-side conflict validation).
  So: the "auto-adjustment succeeded" non-destructive `Alert` variant was
  deliberately **not** built — there is no producer of that state and
  inventing one would mean building the out-of-scope feature to justify it.
  `ConflictAlert` still takes `variant?: "default" | "destructive"` so a future
  drag/reschedule feature can render a success notice without touching the
  component. Building that feature needs its own spec plus an explicit
  decision to move it into scope.
- **Cross-group conflict scope (asked by spec 08, answered — confirm it's
  the intent)**: the Dean schedule is now *displayed* one Course + Year at a
  time, but generation is still **one global pass over every subject in the
  week**, so teacher and room conflicts are checked across all courses
  (`runCSP` receives all subjects at once; `validateSolution` re-checks the
  whole solution). Grouping is a view filter only — it can never hide a
  conflict, and the UI still doesn't validate anything client-side
  (Invariant 5). If a future per-course-year regenerate ("just rebuild
  BSCS year 2") is ever wanted, that **would** need a decision: it either
  re-runs the CSP scoped to one group (and must re-check the other groups'
  fixed rows for teacher/room clashes) or accepts cross-course conflicts.
  Nothing in the current UI implies that, so it stays out of scope.
- **No calendar / drag-and-drop / color legend exists** (spec 08 assumed
  them): there is no `components/schedule/ScheduleCalendar.tsx`, no
  drag-and-drop or auto-rescheduling code, and no per-teacher color legend
  anywhere in the repo. Commit `d4be6ef` ("feat: implement draggable
  calendar…") only added spec prose to
  `context/spec/07-design-adjust-dean-scheduler.md` — no code. Manual
  drag-and-drop editing is also explicitly **Out of Scope** in
  `project-overview.md`, and the schedule view is read-only by design. So
  spec 08's calendar/legend/drag-conflict bullets were N/A; the existing
  read-only `ScheduleTable` is what got grouped. If the draggable calendar
  is actually wanted, it needs its own spec and an explicit decision to move
  it into scope (it would also mean client-side conflict validation, which
  Invariant 5 currently forbids).
- **A session's group comes from the generation-time snapshot**: if a Dean
  moves a subject to a different course/year (or renames the course) after
  generating, the already-generated class keeps its original group until the
  next regenerate — the new group then appears with `subjectCount: 1` and no
  sessions. This is the existing atomic-snapshot semantics applied to
  course/year, not new drift; regenerate to refresh.
- ~~The exact availability time blocks were not defined in
  `project-overview.md` / `architecture.md`.~~ Resolved by spec 05 and the
  school-hours unit: the generator consumes the Mon–Sat × 12 × 1-hour grid
  (7:30 AM–7:30 PM, 60-min slots) from `constants/availability.ts` as the
  single source. One consequence: a subject's `durationMinutes` must be a
  whole multiple of the 60-min slot (SE 101 = 180 min = 3 consecutive
  slots). If non-aligned durations or half-hour slots are ever wanted, the
  grid and the CSP must change together.
- Generated schedules are an atomic snapshot: each `schedules` row
  denormalizes subject/teacher/room names **and the subject's course +
  year** at generation time (spec 08), so editing a Subject's name, a
  Room's name, or a Subject's course/year does not rewrite an
  already-generated timetable (it will be refreshed next regenerate).
  Confirm this snapshot semantics is what we want, or join names/course
  live and drop the denormalized fields.
- Each Subject carries a single fixed `roomId` (spec 03 data model), so
  "room type matches subject" reduces to scheduling in the Dean-chosen
  room. If a subject should instead be placeable in *any* room of a type,
  the schema would expose `roomType` on the subject and the CSP's room
  candidates would widen — decide before extending the scheduler.
- Dev data is still thin: only lab rooms (IT Lab 1–3) and a handful of
  subjects for one teacher (Zyneer Moreno) with availability unset —
  currently CC 106 (BSIT/1, IT Lab 2, 180 min), HCI 101 (BSIT/2, IT Lab 2,
  120 min), OS 101 (BSCS/3, IT Lab 3, 180 min), SE 101 (BSCS/4, IT Lab 1,
  180 min). Generating over the empty availability set works and yields 8
  linked sessions with no teacher double-books (verified, and re-verified
  after spec 08's course/year snapshot) — but a typical timetable needs the
  Dean to add lecture rooms/subjects and teachers to set availability
  first. Note there is no lecture room in dev at all, so every class is a
  lab.
- **Day patterns beyond MW/TTh**: today a subject must meet twice on a
  contiguous Mon-Wed or Tue-Thu pair. The user's example key was `TTH`
  (reconciled to `TTh` to match the required union `"MW" | "TTh"`). Later
  patterns (e.g. a Friday-only lab, or M/W/F) would extend
  `DAY_PATTERN_DAY_INDEXES` / the union and relax the "exactly 2 sessions"
  assumption in `expandSubjectsIntoSessions` and `validate.ts` — and, since
  spec 06, the availability model is pattern-shaped too (a new pattern would
  need a grid column + key prefix). Decide whether the pattern set should
  stay closed.
- **Migration semantics for the one converted availability doc**: spec 06's
  `backfillAvailabilityDayPairs` used **union** (a pair-slot is blocked if it
  was blocked on EITHER of the two days), the conservative choice that never
  schedules a teacher in time they'd blocked on any day. The spec suggested
  intersection instead (only block what's blocked on both days) — I chose
  union and flagged it: switch only if deliberate, and note the migration
  is idempotent (a second run reports 0), so an intersection change needs a
  manual re-run or a new migration.
- **Friday / Saturday dropped from the availability grid**: with per-pattern
  availability there is no Mon..Sat day grid anymore — only the MW and TTh
  pair columns. That's correct today because subjects can only be MW/TTh, but
  any future Fri/Sat scheduling (or a "stack a subject on both days of a
  pattern plus a Friday lab") needs both a new day-pattern and a wider
  availability model.
- **Do any subjects legitimately need DIFFERENT times on their two pattern
  days?** If yes, the linked-pair-at-same-time assumption (day-pair scheduling
  from the Fixed Day-Pair unit) and this per-pattern availability model both
  unravel — revisit before extending the scheduler in any direction.
- (Resolved) The subject-level `dayPattern` input is gone entirely
  (Algorithm-Chooses-the-Pattern unit): the `backfillSubjectDayPatterns`
  migration and its `PrePatternSubject` default-to-MW question are obsolete.
  The chosen pattern now lives on schedule rows as an output, so Dean input
  can't drift from what the algorithm actually scheduled.
- The schedule table groups a subject's two sessions into one row with a
  pattern badge (clean pair) and falls back to per-session rows otherwise.
  `ui-context.md` is an unfilled template (no table guidance), so this is
  a judgment call — sanity-check the grouping/badge in the browser before
  it becomes convention.
- Spec 04 references a "dark green accent token" for sidebar active
  state. Introduced `--accent-primary` (+ `--accent-primary-foreground`)
  in `globals.css` (mapped in `@theme inline` as
  `--color-accent-primary*`). The availability grid's blocked cells **no
  longer use it** — spec 06 switched them to the red `destructive` token
  (`--color-destructive` + new `--color-destructive-foreground`), so
  `--accent-primary` is now used by nothing app-side except the sidebar
  styling decision below. Teacher sidebar still mirrors the Dean sidebar
  styling — decide whether to migrate both sidebars to the green accent.
  Registered here rather than invented.
- `/teacher/schedule` ("My Schedule") is a placeholder page with a real
  schedule source now available (`schedules` table, `by_teacherId`
  index) — building the read-only teacher view is the next unit.
- The antd/shadcn split: existing dashboard components
  (`DeanDashboard`, `TeacherDashboard`, `AppHeader`, root antd
  `ConfigProvider`) still use antd, while new UI (DeanSidebar, Subject
  Management, Room Management, Teacher availability) uses shadcn. Decide
  when/how to migrate the remaining antd components to shadcn, or keep
  antd for them.
- **Should Course/Year ever become a scheduling constraint?** (spec 07)
  `subjects.courseId` + `subjects.year` are descriptive/organizational only
  in this unit — the CSP does not read them, so two subjects from the same
  Course/Year may still overlap. If a hard constraint is ever wanted (e.g.
  no two subjects of the same Course/Year at the same time), that is a
  separate, explicitly-confirmed change to `convex/scheduling/*` — do not
  add it without a decision. Deleting a Course that Subjects still reference
  has the same open question as Room delete (below).
- Course seeding is manual: a brand-new Convex deployment has no courses
  until `npx convex run 'migrations:seedCourses'` is executed (there is no
  auto-seed on deploy — same as rooms/subjects, which are also entered by
  hand). Until then the subject form's Course select reads "No courses
  available" and submission is blocked, which is intentional.
- Deleting a Room that is still referenced by Subjects: subjects always
  carry a `roomId` (strict schema), so deleting a referenced room leaves
  subjects pointing at a missing room (rendered as `—`). Decide whether
  Room delete should be blocked while subjects reference the room, or
  clear/reassign those subjects on delete.
- The `Legacy Lab`/`Legacy Lecture` fallback rooms created by
  `convex/migrations.ts` are editable/deletable from the Dean room UI —
  re-assign/move the `SE 101` subject first if the fallback room is
  deleted.

## Architecture Decisions

- **Conflict explanations are engine output, not UI derivation (spec 09)**: a
  failed generate hands the UI `InfeasibilityReason[]` where every pattern
  carries a `ConflictDetail` (`kind` + ready-to-render `title`/`message`/
  `facts`). `ConflictAlert` maps `kind` to an icon + label and renders the
  strings verbatim — it never re-derives "who is in that room" or "which
  window is blocked" from raw scheduling data (the same rule Invariant 5
  applies to conflict *validation*). The prose `message` is built once and
  reused as `conflict.message`, so the two can't drift. `no-room-available` /
  `no-shared-teacher-window` (the coarse `cause`) stay on the diagnostic as the
  engine's classification; `ConflictKind` is the finer, display-oriented
  split the UI switches on.
- **`SchedulingSubject.teacherName` is display-only and optional**: the
  diagnostics need to say *which* teacher, but every constraint check and
  occupancy lookup still uses `teacherId` (Invariant 3). Optional means engine
  fixtures don't have to carry a display name, and a missing one degrades to
  "The assigned teacher" rather than failing.
- **The `Alert` keeps shadcn's built-in border** — a deliberate, recorded
  exception to `code-standards.md`'s "no visible borders by default" (the spec
  asked for this choice to be written down rather than guessed). The
  `destructive` variant is stock shadcn — `bg-card` + `text-destructive`, no
  red fill, no custom/neon red — and the alerts sit inside the muted
  `bg-muted/30` error region, so without a border a white-on-white alert would
  vanish; the border is what separates each per-subject alert from the region
  and from its neighbours.
- **The Dean schedule is grouped by Course + Year in the UI only**
  (spec 08). `schedules` rows carry the subject's `courseId`/`courseCode`/
  `courseName`/`year` as a generation-time snapshot (consistent with the
  subject/teacher/room names already denormalized there), and
  `useSchedule` buckets them by `` `${courseId}-${year}` `` — the page
  never re-joins Subject data per render, and the engine still sees every
  subject at once, so teacher/room conflict detection stays global.
  Group existence is driven by **subjects** (a course/year with subjects is
  selectable before anything is generated, which is what makes the shared
  `EmptyState` reachable), session assignment by the **snapshot** on each
  row; the union of the two is what the selector lists.
- **The course+year selector is a shadcn `Select`, not `Tabs`**: the group
  count is `courses × 4 year levels` and courses are Dean-managed with no
  upper bound, so tabs would wrap/overflow (especially on mobile). The
  select groups its items per course via `SelectGroup`/`SelectLabel` and
  shows a per-year class count, reusing an already-vendored primitive
  (`ai-workflow-rules.md`: install a primitive as its own step, reuse before
  creating).
- **Transient selection state lives in the hook, not the component**: the
  page's Course + Year selection joins the other derived page state
  (`isEmpty`, the active group) in `useSchedule`, and `activeGroup` is
  resolved during render rather than in an effect — a stale key silently
  falls back to the first group (and the repo's lint config rejects
  `setState`-in-effect). The search filter in `SubjectManagement` stays
  component-local; this one needs the fallback logic, so it lives in the
  hook.
- The schedule table collapses a clean pair into one row per subject with a
  "Schedule Pattern" badge + human label; a non-clean pair (shouldn't
  happen via `generate`) falls back to per-session rows. Within a
  Course + Year group the course/year is constant, so the table adds no
  Course/Year columns — the group is named by the selector + summary line.

- **Course is a top-level entity; `subjects.courseId` + `subjects.year` are  organizational only** (spec 07). A Course is just `name` + `code`
  (Dean-managed, code unique/uppercased) with a `by_code` index; a Subject
  points at exactly one course and one year level (1–4). The CSP
  deliberately does **not** read either field, so overlapping subjects from
  the same Course/Year are still allowed — turning them into constraints is
  a separate, confirmed decision. Because `courseId` is required, deleting a
  Course is refused while a Subject references it (it names the blocking
  subject) — the safe default, in contrast to Room delete (see Open
  Questions).
- Course/Year seeds live in `constants/courses.ts` (`DEFAULT_COURSES`) and
  are applied by the idempotent internal mutation
  `migrations:seedCourses`, matching the project's existing "idempotent
  internal mutation run via `npx convex run`" mechanism (there is no
  auto-seed on deploy, same as rooms/subjects).
- Taskbar uses shadcn sidebar + lucide-react icons (per spec).
- Routes live in `constants/routes.ts` only (`APP_ROUTES.deanRooms`,
  `APP_ROUTES.deanSubjects`) — no raw path strings (Invariant 2).
- Dean routes are guarded once in `app/dean/layout.tsx` via
  `requireRole(ROLES.dean)` (middleware/role logic still centralized in
  `hooks/useAuth.ts`).
- Single source for top-chrome height: `--app-header-height` CSS
  variable set on `<body>` in the root layout; the Dean sidebar's fixed
  panel spans `top: var(--app-header-height)` → viewport bottom so it
  sits below the sticky white AppHeader instead of overlapping it.
- Subject management queries (`listAll`, `getTeachers`) return a
  `{ ok, data } | { ok: false, error }` Result union instead of throwing,
  so `useSubjects` can surface failed queries to the error state without
  relying on an error boundary. Mutations still throw and are caught in
  the dialog components.
- Subjects reference their assigned teacher by the teacher's Clerk user
  id (`teacherId`), matching how `users`/availability are keyed — never by
  name (Invariant 3). Display names are resolved at query time.
- Teacher accounts for the Dean's dropdown are sourced from Clerk
  (`convex/teachers.ts` `syncFromClerk` action), pulled on page load once
  per session and upserted into Convex; the dropdown then reads Convex
  reactively. Requires `CLERK_SECRET_KEY` as a Convex deployment env.
- Subject "category" is derived from the room a subject is assigned to:
  `subjects.roomId` points at a `rooms` document and the table's Category
  badge shows the room's `Lecture`/`Lab` type (+ name). Per spec 03, the
  subject form no longer picks a hard-coded type — it picks an actual
  room from the rooms table.
- `useSubjects` is the single hook for the page; search filtering is
  transient UI state kept in `SubjectManagement` (useMemo), not in Convex.
- Subject category/room type now lives on the `rooms` table
  (`convex/schema.ts`); `subjects.roomId` references the room by Convex
  `Id`, and `roomName`/`roomType` are joined at query time (mirrors how
  `teacherId` is joined to teacher names). `RoomType` and its constants
  are owned by the rooms module (`types/rooms.ts`, `constants/rooms.ts`)
  and imported by subjects.
- `useRooms` mirrors `useSubjects`: single hook per page, Result-union
  `listAll` query, throw-and-catch mutations in the dialog components,
  Skeleton-based loading/empty/error states.
- Availability is stored as one doc per teacher (`availability` table,
  indexed by Clerk `userId`); `blockedSlots` is the full set of
  `"<dayPattern>-<timeIndex>"` keys (`MW-0`, `TTh-11`). Grid edits are kept
  as local draft state; **Save** writes the whole array (upsert: insert or
  patch) and **Reset** reverts to the last saved set — an atomic write avoids
  many small per-cell document churn.
- `getMine`/`setMine` gate on the teacher role (`roleOf`). `getMine`
  returns `{ ok: true, data: [] }` for non-teachers rather than throwing
  (mirrors `rooms.listAll`); `setMine` throws `Unauthorized` and also
  rejects any slot key outside the 2 patterns × 12 slots (7:30 AM–7:30 PM)
  bounds, parsed via the shared `parseAvailabilityPatternKey`.
- Sidebar is now generic: `components/shared/AppSidebar.tsx` takes a
  `groups` prop; `DeanSidebar` and `TeacherSidebar` are thin wrappers
  supplying their own nav configs from `APP_ROUTES` (no raw path
  strings).
- The availability "empty" state (no blocked slots) is rendered as an
  inline hint above the grid rather than replacing the grid with
  `EmptyState`, because the grid is always interactive even when every
  cell is available — a full EmptyState swap would prevent marking slots.
- The scheduling engine lives in `convex/scheduling/` as pure TypeScript
  with no Convex imports, so the same CSP/GA/validator code can be driven
  by a standalone script (`scripts/scheduling-smoke-test.ts`) and executed
  in a Convex action (`convex/schedule.ts`). CSP is the production path;
  GA stays out of the wiring until soft constraints are in scope.
- Schedules are written as an atomic snapshot: `generate` clears the
  `schedules` table and inserts every session in one internal mutation,
  so the UI never sees a half-generated timetable.
- The clock/grid model is single-sourced: `constants/availability.ts`
  defines the 7:30 AM–7:30 PM school hours (`AVAILABILITY_START_MINUTES`/
  `AVAILABILITY_END_MINUTES`, 60-min slots → 12 slots/day) and is used by
  the UI, the availability grid, and via `formatClock`/`AVAILABILITY_DAYS`
  by the schedule tables. `convex/scheduling/*` derives its bounds purely
  from the grid (`input.timeSlots`) built from those same constants, and
  `convex/availability.ts`'s validator imports the constants directly —
  no plain-number copies to drift.
- Placement-failure reporting is structured: `CspResult` failures carry one
  `InfeasibilityReason` per unplaceable subject (cause
  `no-shared-teacher-window` / `no-room-available` / `unknown`, the teacher's
  free windows per pattern day, and a plain-language message), produced by
  `convex/scheduling/cspDiagnostics.ts`. Config-level failures (no rooms,
  invalid duration/pattern, missing room) still return a single reason.
- Dean-only reads/writes of schedule data, availability data, subjects,
  and rooms all gate on `roleOf`/`isDean` (Dean) or teacher role,
  including the `generate` action (throws `Unauthorized` for anonymous and
  non-Dean callers).
- Day patterns are a closed vocabulary (`dayPattern: "MW" | "TTh"`),
  single-sourced in `constants/dayPatterns.ts` including the day indexes
  (`MW = [0, 2]`, `TTh = [1, 3]`) on the shared Mon=0…Sat=5 grid.
  That file has **no imports** so the Convex-side compiler (which can't
  resolve `@/`) can consume it; the scheduling engine imports it
  relatively. The pattern is an **algorithm output** — `PlacedSession` and
  `schedules` rows carry it; the subject no longer stores it.
- The day pattern is now a CSP choice: `expandSubjectsIntoSessions` builds a
  per-subject domain with one **linked pair** option per pattern (same time +
  same room on both pattern days — MW option first, then TTh). The pair
  stays atomic (place/unplace both days together; candidates require the
  teacher free on *both* days), but the CSP now also picks *which* pattern,
  preferring MW and falling back to TTh when MW is fully blocked. A subject
  is infeasible only when both options have zero candidates.
- **Availability is pattern-level, not day-level** (spec 06): the teacher
  blocks time once per day-pair. The grid/UI has 2 columns (MW, TTh), the
  Convex docs store `"<pattern>-<slot>"` keys but keep the same
  `availability` table shape, and the engine's `SchedulingAvailability`
  carries `blockedByPattern`, which `blockedByDayFor` fans out to both days
  of each pair. Both days of a pair always carry identical blocks, so a
  Mon-vs-Wed (or Tue-vs-Thu) availability mismatch is **structurally
  impossible** — the CSP's `no-shared-teacher-window` cause can only fire
  from per-day placed-session differences or a fully-blocked pattern now.
- **Blocked/unavailable cells use the red `destructive` token**, not the
  green accent (`bg-destructive` + `text-destructive-foreground`, with a new
  `--destructive-foreground` var in both themes). Rationale: "unavailable" is
  the destructive semantic and reads clearly as "the scheduler will avoid
  this"; the green `--accent-primary` accent stays for sidebar active states.
- The GA chromosome is a permutation of subject-pair units, so crossover /
  mutation can never break a day-pair; the old per-subject day-spread
  penalty was dropped because the spread is now fixed by the pattern.
  The GA now locks in the CSP's choice: each unit adopts the seed
  solution's pattern for that subject (domain option match, first as
  fallback), so decode output always matches what the CSP selected.
- Schema-evolution playbook (reused from spec 03): to migrate a field
  live, relax the schema (`v.optional`), deploy + run the idempotent
  internal backfill mutation, then restore the strict schema and re-push.
  This CLI (Convex 1.46) has **no `schema:push --relax`**, so the window is
  expressed directly in `convex/schema.ts` (make the changed columns
  optional, push, migrate, then finalize and push again). This unit ran
  `seedCourses` (2 courses) and `backfillSubjectCourseAndYear` (3 subjects)
  inside that window; spec 08 ran `backfillScheduleCourseAndYear` (6
  schedule rows) in its own window; earlier units ran
  `backfillSubjectRemoveDayPattern` (3 subjects, since superseded),
  `backfillScheduleDayPatterns` (6 schedule rows),
  `backfillSubjectDayPatterns` (3 docs, since removed) and
  `backfillAvailabilityDayPairs` (1 doc).
- The schedule table collapses a clean pair into one row per subject with a
  "Schedule Pattern" badge + human label; a non-clean pair (shouldn't
  happen via `generate`) falls back to per-session rows.

## Session Notes

- shadcn style: `base-nova`, primitive base: `@base-ui/react`, icons:
  `lucide-react`, Tailwind v4. All `components/ui/*` are vendored.
- `app/dean/layout.tsx` uses a plain `<div>` for content (not
  `SidebarInset`, which renders a nested `<main>` making invalid HTML
  inside the root layout's `<main>`).
- Spec: `context/spec/01-design-taskbar-for-teacher.md`
- Spec: `context/spec/02-subject-management.md` (Dean Subject CRUD)
- Spec: `context/spec/03-room-management.md` (Dean Room CRUD + subject
  room selection)
- Spec: `context/spec/04-teacher-availability.md` (Teacher Availability
  + Teacher sidebar)
- Spec: `context/spec/05-teacher-generate-sched.md` (Generate Schedule —
  CSP engine wired via Convex action; GA built, not wired)
- Spec: `context/spec/06-teacher-availability-fix.md` (Teacher Availability
  by Day-Pair — MW/TTh grid, pattern-based availability model, red blocked
  cells)
- Spec: `context/spec/07-design-adjust-dean-scheduler.md` (Course CRUD +
  subject `courseId`/`year`) — added in `d4be6ef`, revised in `11e55ee`;
  both commits touched only this spec file, no code.
- Spec: `context/spec/08-design-generated-schedule-dean.md` (group the
  generated schedule by Course + Year on `/dean/schedule`) — the spec's
  "Before finishing" bullets assume a draggable `ScheduleCalendar.tsx`, a
  per-teacher color legend, and existing drag/auto-reschedule logic. **None
  of that exists in code**: `d4be6ef` only appended spec prose to spec 07,
  there is no calendar component, and manual drag-and-drop editing is listed
  Out of Scope in `project-overview.md` (the schedule view is read-only).
  Verified with `git show --stat d4be6ef` (1 file, spec markdown only) and
  by listing the repo — so the calendar/legend/conflict-on-drag bullets were
  N/A and the read-only `ScheduleTable` is what got grouped. Answered the
  spec's real question in Open Questions: conflict checking stays global
  because generation is one CSP pass over all subjects.
- Spec: `context/spec/09-design-alert-class-conflict.md` (conflict alert on
  the generated schedule page) — same shape of surprise as spec 08: half the
  spec (the drag-and-drop / auto-adjustment alert, fed by a structured
  `reschedule.ts` result) targets code that does not exist, and
  `project-overview.md` marks manual drag-and-drop Out of Scope. Built the
  generation-failure half plus the reusable `ConflictAlert`, and left the
  "auto-adjustment succeeded" non-destructive variant unbuilt (no producer) —
  the component already accepts `variant="default"` for whenever that feature
  is explicitly brought into scope. Also installed the shadcn `alert`
  primitive as its own step first, per `ai-workflow-rules.md`.
- Unit: Fixed Day-Pair Scheduling (MW / TTh) — extended spec 05's engine
  from `meetingsPerWeek` to linked `dayPattern` pairs (see Completed)
- Unit: Teacher Availability by Day-Pair (MW / TTh) — spec 06; ran
  `npx convex run 'migrations:backfillAvailabilityDayPairs'` → converted 1
  legacy per-day availability doc (union semantics); a second run returns 0.
  No schema relaxation needed (the `availability` doc shape is unchanged).
- Unit: The Algorithm Chooses the Day Pattern (MW / TTh) — see Completed.
  Dev migration ran in a schema window (no `schema:push --relax` in this
  CLI): made `dayPattern` optional on both `subjects` and `schedules`, pushed
  with `npx convex dev --once` (also pushed the engine + regen'd `_generated`
  with the code), ran `npx convex run 'migrations:backfillSubjectRemoveDayPattern'`
  (cleaned 3) and `npx convex run 'migrations:backfillScheduleDayPatterns'`
  (backfilled 6 — all MW, consistent with their day indexes 0,2), then
  reverted the schema to final and pushed again. Verified with
  `npx convex data subjects` / `npx convex data schedules` that subjects have
  no `dayPattern` and all schedule rows do. Note: with
  `CONVEX_DEPLOYMENT` set, `npx convex deploy` targets the project's default
  *production* deployment — dev pushes must go through `convex dev --once`.
- Unit: Course Management + subject Course/Year (spec 07) — see Completed.
  Same relax→migrate→strict window: `courseId`/`year` were pushed as
  `v.optional`, then `npx convex run 'migrations:seedCourses'` (seeded 2) and
  `npx convex run 'migrations:backfillSubjectCourseAndYear'` (backfilled 3 →
  BSCS/year 1), then required columns pushed via `npx convex dev --once`.
  Both mutations report 0 on a re-run. Consequence worth remembering: the
  older `backfillSubjectRoomIds` / `backfillSubjectRemoveDayPattern`
  `db.replace` calls can no longer write a doc that lacks a course/year, so
  they now filter those docs out (a `db.replace` under a strict schema must
  carry every required field — worth re-checking whenever a new required
  subject field is added).
- Unit: Group Generated Schedule by Course & Year (spec 08) — see Completed.
  Same relax→migrate→strict window against dev: `courseId`/`courseCode`/
  `courseName`/`year` pushed as `v.optional`, then `npx convex run
  'migrations:backfillScheduleCourseAndYear'` (backfilled 6 rows, skipped 0 —
  it reads the real `code`/`name` from `courses`, not a placeholder), then
  required columns pushed with `npx convex dev --once`; a second run reports
  `backfilled: 0`. Note: the local `convex/_generated/dataModel.d.ts`
  imports `../schema.js` directly, so schema shape changes need no codegen
  diff — the optional→required flip was enforced by the push itself, not by
  a generated file.
- PowerShell 5.1 caveat: to pass double quotes through `npx convex run
  --inline-query`, write the inner strings with doubled single quotes
  (`query(''rooms'')`), since PS otherwise strips `"` from native args.
  Note: the `--inline-query` sandbox forms touched this session
  (`(q) => q.query(...)`, `query(...).collect()`, `(ctx) => ctx.db...`)
  failed server-side in this Convex version, so migrations and data checks
  were verified via their `{ cleaned }` / `{ backfilled }` results +
  `convex data` instead.