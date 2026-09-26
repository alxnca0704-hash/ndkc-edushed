Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Update: Group Generated Schedule by Course and Year

### Problem

The `/dean/schedule` page currently displays one single combined schedule for everything generated. Since Subjects now have `courseId` and `year` (from the Course/Year update), the Dean needs to see the schedule broken out **per Course and Year** (e.g. "BSCS - Year 1", "BSCS - Year 2", "BSIT - Year 1", etc.) instead of one flat, undifferentiated view.

### Fix

Group the generated schedule results by `courseId` + `year` and let the Dean view each group's schedule separately.

### Logic Changes (`hooks/useSchedule.ts`)

- After fetching the generated schedule from Convex, join each `ScheduleSession` back to its Subject to get `courseId` and `year` (if not already denormalized onto the schedule record — if it isn't, consider adding `courseId` and `year` directly onto `ScheduleSession` at generation time in `convex/schedule.ts`, so the schedule page doesn't need to re-join Subject data on every render).
- Group the schedule results into buckets keyed by `courseId-year` (e.g. `"bscs-1"`, `"bscs-2"`, `"bsit-1"`), each with a readable label (e.g. "BSCS – Year 1").
- Return this grouped structure from the hook, e.g.:
```ts
  interface GroupedSchedule {
    courseId: string;
    courseName: string;
    year: number;
    label: string; // e.g. "BSCS – Year 1"
    sessions: ScheduleSession[];
  }
```

### UI Changes (`components/schedule/`)

- Update the `/dean/schedule` page to show a **selector** for Course + Year (e.g. `Tabs` or `Select` from shadcn/ui — pick whichever fits better given the likely number of groups; `Tabs` if there are few, a `Select` dropdown if there could be many) above the calendar/table.
- Selecting a Course + Year filters the view down to only that group's sessions — the Dean sees one course-year's schedule at a time, not everything overlaid together.
- Default to the first available group (or show a prompt to pick one) rather than defaulting to "all combined," since a combined view isn't what's being asked for here.
- If using the calendar view (`ScheduleCalendar.tsx`) from the earlier update, it should render only the selected group's sessions — confirm this integrates cleanly with the per-teacher color legend, since a teacher may appear across multiple course-year groups but the legend only needs to reflect teachers present in the currently selected group.
- If a selected Course + Year group has zero sessions (e.g. generation hasn't run yet, or that group has no subjects), show the shared `EmptyState`.
- Include a matching loading skeleton for the selector + content area.

### Before finishing

- Confirm the schedule page lets the Dean switch between every Course + Year combination that has subjects, and each view shows only that group's own sessions — never a mix of groups.
- Confirm a Course + Year with no subjects/sessions shows the shared `EmptyState`, not a blank or broken view.
- Confirm this doesn't break the existing drag-and-drop/auto-adjustment logic from the calendar feature — dragging within one group's view should only ever create conflicts against sessions in that same group (or globally, if teachers/rooms are shared across courses — clarify and confirm which is correct before implementing, since a teacher/room conflict check that's scoped only to the visible group could miss a real conflict happening in another group using the same teacher or room).
- Update `progress-tracker.md` with what was completed and this open question about cross-group conflict-checking scope.
- Run lint and confirm `npm run build` passes before considering this done.
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.