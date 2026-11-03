Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Feature: Teacher "My Schedule" Page (Real, Not Placeholder)

### Goal

Build the actual Teacher-facing schedule view at `/teacher/schedule`. This currently shows placeholder/fake data — replace it with the real generated schedule, filtered to only the logged-in teacher's own sessions, displayed as a table.

### Data Requirements

- Fetch the generated `schedules` records from Convex, filtered by the logged-in teacher's Clerk `userId` (per `architecture.md` — Teacher records are always looked up by Clerk `userId`, never by name).
- Each row needs the following joined/denormalized data:
  - **Subject** name
  - **Course** (e.g. "BSCS", "BSIT") and **Year** (1–4) — from the Subject's `courseId`/`year` fields
  - **Room** name
  - **Day** (or day-pair label, e.g. "Mon/Wed")
  - **Time block** (start–end, formatted readably, e.g. "9:00 AM–10:30 AM")
- If `courseId`/`year`/room aren't already denormalized onto the `ScheduleSession` record, join them in the hook rather than duplicating join logic in the component.

### Hook

- Build `hooks/useMySchedule.ts`:
  - Reads the current teacher's Clerk `userId` (via Clerk's `useUser()` or the project's existing auth hook pattern).
  - Queries Convex for that teacher's schedule sessions only.
  - Returns `{ data, isLoading, isEmpty, error }` per the established convention in `code-standards.md`.
  - No fetch/query logic belongs in the page or component — only in this hook.

### Component

- Build `components/schedule/MyScheduleTable.tsx`:
  - Renders a **table** (shadcn `Table`) with columns: **Subject**, **Course**, **Year**, **Day**, **Time**, **Room**.
  - Sort rows by day then start time, so the teacher reads their week in order.
  - Read-only — no editing, no drag-and-drop (that's Dean-only, per `architecture.md`'s access model).
  - Mobile-first: on small screens, follow the existing convention of collapsing to a stacked/card layout instead of a horizontally-scrolled table (per `code-standards.md`).
- Build `components/schedule/MyScheduleTableSkeleton.tsx` for the loading state.
- Use the shared `EmptyState` component if the teacher has no assigned sessions yet (e.g. schedule hasn't been generated, or they have no subjects assigned).
- Use the shared `ErrorState` component if the query fails.

### Page

- Update `app/teacher/schedule/page.tsx`: thin page, calls `useMySchedule()`, passes data into `MyScheduleTable` / `MyScheduleTableSkeleton` / `EmptyState` / `ErrorState` based on hook state — no logic in the page itself.

### UI/UX

- Follow `ui-context.md`: borderless separation (background contrast, not lines), Roboto for table text, Montserrat for the page heading, muted/non-neon colors.
- Consider a `Badge` (shadcn) for Course and Year to make them visually scannable at a glance (e.g. "BSCS" badge, "Year 2" badge), consistent with how Course/Year are already displayed in the Dean's Subjects table.

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm a logged-in teacher sees only their own scheduled sessions, correctly filtered by their Clerk `userId` — never another teacher's classes.
- Confirm the table correctly shows Subject, Course, Year, Day, Time, and Room for every row.
- Confirm the empty state renders correctly when a teacher has no sessions yet, and the loading skeleton matches the table's shape.
- Update `progress-tracker.md`: mark this item complete, and note it still needs a manual browser sanity-check (per the pattern used for specs 07/08/09) before being considered fully verified.
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.