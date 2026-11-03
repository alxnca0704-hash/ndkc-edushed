Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Feature: Grid-Style Schedule Display (Row = Time, Column = Day Pair, Color = Teacher)

### Goal

Replace the current table/list view of the generated schedule with a **grid layout** — rows are time blocks, columns are day patterns (MW / TTh), and each cell shows the subject + teacher for that slot, color-coded per teacher. This is a **read-only display** — no drag-and-drop, no editing (manual schedule editing remains Out of Scope per `project-overview.md`).

### Grid Structure

- Build `components/schedule/ScheduleGrid.tsx`:
  - **Columns**: exactly two — "MW · Mon & Wed" and "TTh · Tue & Thu" (the two day patterns already in the system — no Friday/Saturday, since subjects only ever run on these two patterns).
  - **Rows**: one row per time block within school hours (7:30 AM–7:30 PM, 60-minute slots, matching `constants/availability.ts`'s existing `AVAILABILITY_TIME_SLOTS` — reuse this constant rather than hardcoding a new time list).
  - Each cell shows the subject(s) scheduled in that column's day-pair during that row's time block, as a small card: subject name, teacher name, room. A subject spanning multiple consecutive time-slots (e.g. a 180-min class) should visually span multiple rows (rowspan or an absolutely-positioned block within the grid), not repeat identically in each row.
  - An empty cell (no class at that time/day-pair) renders as blank/empty space — not a placeholder box or "N/A" text.

### Per-Teacher Color

- Each teacher gets one consistent color applied to every one of their cells across the whole grid.
- Add a `--teacher-palette` set of tokens to `ui-context.md` and `globals.css`: a small, fixed set of muted, non-neon colors (per `code-standards.md`'s no-neon rule) — do not generate random colors.
- Map teacher → color deterministically (e.g. hash the teacher's Clerk `userId` to a palette index) so the same teacher always gets the same color across reloads and across different Course/Year groups.
- Add `components/schedule/TeacherColorLegend.tsx`: a small legend (teacher name + color swatch) shown above or beside the grid, listing only the teachers who appear in the currently displayed group (per the existing Course + Year grouping from spec 08).

### Data / Hook Changes

- `hooks/useSchedule.ts` (Dean) and `hooks/useMySchedule.ts` (Teacher) already group sessions by day pattern — extend or add a derived shape needed by the grid: for each session, its day pattern, start time slot index, span (number of consecutive slots), subject, teacher, and room. Keep this derivation in the hook (or a shared `lib/schedule.ts` helper, consistent with how `groupSessionsByDayPattern` already lives there), not inside the component.
- No new Convex query is needed — this is a display change over data that's already fetched (`schedule.listAll` for Dean, `schedule.listMine` for Teacher).

### Where This Applies

- **Dean's `/dean/schedule`**: replace `ScheduleTable` with `ScheduleGrid` for the currently selected Course + Year group (the existing group selector from spec 08 stays as-is).
- **Teacher's `/teacher/schedule`**: replace `MyScheduleTable` with the same `ScheduleGrid` component (reused, not duplicated), showing only that teacher's own sessions — likely all one color, still useful for confirming their week at a glance.

### Loading / Empty / Error States

- `ScheduleGridSkeleton.tsx`: a grid-shaped skeleton matching the two-column, N-row structure.
- Reuse the existing shared `EmptyState` (no schedule generated / no classes for this teacher) and `ErrorState` — no change needed to those.

### UI/UX Requirements

- Follow `ui-context.md`: borderless separation via background contrast (not grid lines) where possible; if faint gridlines are needed for readability at this density, use the same very subtle divider treatment already permitted in `code-standards.md` ("a very subtle divider... never a dark or saturated border color").
- Mobile-first: two columns is manageable on most phone widths, but confirm cell content (subject + teacher + room) doesn't overflow — stack the subject/teacher/room text vertically inside a cell rather than trying to fit it on one line at narrow widths.
- Keep the existing app typography and muted palette — no new fonts introduced (per the earlier decision to keep Geist Sans, not Roboto/Montserrat, since that's what the app actually loads).

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm the grid correctly renders both day-pair columns with all time-block rows, and multi-slot classes visually span the correct number of rows without duplicating.
- Confirm each teacher's color is consistent across every cell they appear in, and the legend only lists teachers actually present in the current view.
- Confirm this works correctly for both the Dean's grouped view (per Course + Year) and the Teacher's own-schedule view, reusing the same `ScheduleGrid` component rather than two separate implementations.
- Confirm no drag-and-drop or editing behavior was added — this is strictly a read-only visual change.
- Update `progress-tracker.md` with what was completed, the new `--teacher-palette` tokens added to `ui-context.md`, and flag as an open item that this still needs a manual browser sanity-check (per the established pattern for prior specs) before being considered fully verified.
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.