# UI Context

## Theme

[Describe the overall visual language — e.g. Dark only.
No light mode. The design language is a dark technical
workspace — near-black backgrounds, layered surfaces,
and vivid accent colors for interactive elements.]

## Colors

[Define your color tokens as CSS custom properties.
All components must use these tokens — no hardcoded
hex values.]

| Role            | CSS Variable       | Value    |
| --------------- | ------------------ | -------- |
| Page background | `--bg-base`        | `#[hex]` |
| Surface         | `--bg-surface`     | `#[hex]` |
| Primary text    | `--text-primary`   | `#[hex]` |
| Muted text      | `--text-muted`     | `#[hex]` |
| Primary accent  | `--accent-primary` | `#[hex]` |
| Border          | `--border-default` | `#[hex]` |
| Error           | `--state-error`    | `#[hex]` |
| Success         | `--state-success`  | `#[hex]` |

## Typography

| Role      | Font              | Variable      |
| --------- | ----------------- | ------------- |
| UI text   | [e.g. Geist Sans] | `--font-sans` |
| Code/mono | [e.g. Geist Mono] | `--font-mono` |

## Border Radius

| Context           | Class            |
| ----------------- | ---------------- |
| Inline / small UI | `rounded-[size]` |
| Cards / panels    | `rounded-[size]` |
| Modals / overlays | `rounded-[size]` |

## Component Library

[e.g. shadcn/ui on top of Tailwind. Components live
in components/ui/. Use the CLI to add new components
rather than writing from scratch.]

## Layout Patterns

- [Pattern — Sidebars: fixed width with border separator]
- [Pattern — Identity: shadcn `SidebarHeader` in the sidebar
  (`components/shared/AppSidebarHeader.tsx`) — logo + "NDKC EduSched" +
  subtitle, text hidden when the rail collapses to icons. There is no top
  app bar; the inset header (`components/shared/AppTopBar.tsx`) carries only
  the `SidebarTrigger`, the notification bell, and the Clerk `UserButton`]

### Notification Bell

`components/notifications/NotificationBell.tsx`, rendered in the shared top bar
next to the account menu so both role dashboards get it for free. A ghost
`size="icon"` button holding a Lucide `Bell`, with the unread count as a small
filled `primary` circle pinned to its corner (`99+` above the cap) — the badge is
`aria-hidden` and the count lives in the trigger's `aria-label`, so the state is
announced once and not twice. Opening it is a shadcn `Popover` (`align="end"`,
`w-80 sm:w-96`) holding `NotificationList`.

Rows are the notification's own icon in a tinted square, its title, a muted
relative timestamp (`formatRelativeTime`), and its body; unread rows carry
`bg-muted/60` plus a semibold title and a trailing dot. The header is a small
muted "Notifications" label and a ghost "Mark all read" button, disabled when
nothing is unread rather than rendered inert. Each kind picks its icon and its
destination from one `Record<kind, …>` — `CalendarClock` to the teacher's own
schedule (same tab), `CalendarRange` to the Dean's schedule (new tab) — so the
list cannot route a notification somewhere its reader cannot act. The popover
carries the feature's three states like any page region: `NotificationListSkeleton`
while loading, the shared `EmptyState` at zero, the shared `ErrorState` on
failure (its retry reloads, matching every other retry in the app).

### Taskbar / Sidebar

The Dean and Teacher taskbars share `components/shared/AppSidebar.tsx` and the
shadcn Sidebar primitives. The sidebar surface is the deep school green
`#072b04` in both themes, with white foreground text and a quiet translucent
white hover surface. The active navigation item is a white rounded row with
deep green text; inactive items remain white on green. Sidebar colors are
defined by the `--sidebar*` CSS tokens in `app/globals.css`, not per-link hex
values. The logo and product name remain in the shared header, and the existing
icon-rail collapse behavior is preserved.

## Icons

[e.g. Lucide React. Stroke-based icons only. Sizes:
h-4 w-4 for inline, h-5 w-5 for buttons.]

## Schedule Grid

The read-only timetable on `/dean/schedule` and `/teacher/schedule`.
Established by `spec/12-design-schedule-dean.md`; the grid model is
built by `buildScheduleGrid` in `lib/schedule.ts` and rendered by
`components/schedule/ScheduleGrid.tsx`.

| Property        | Value                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| Frame           | `rounded-xl border border-border/60 bg-card/40 p-2` on the scroll viewport, so the border stays put while the grid scrolls inside it |
| Columns         | Exactly two, from `DAY_PATTERN_OPTIONS`: MW, then TTh                   |
| Column width    | **Both day pairs are always the same width.** Every column renders `max(laneCount)` lanes, the widest in the week |
| Column surface  | `bg-schedule-column` — a neutral wash over the whole day pair, header included |
| Column header   | Day-pattern label + its label from `dayPatterns`, spanning the uniform lane count |
| Rows            | One per `AVAILABILITY_TIME_SLOTS` entry — 12 rows, 7:30 AM to 6:30 PM   |
| Row height      | `var(--schedule-row-height)`: `3.5rem`, `4rem` at `>= 40rem` — uniform, so a class is `duration × 1 cell` |
| Row rule        | `border-t border-schedule-rule/70` per row, painted under the blocks. Without it an empty hour is indistinguishable from the next one |
| Time gutter     | `TIME_GUTTER` (`3.25rem`) leading column, shared by header and body so they line up |
| Lane width      | `LANE_MIN` (`7rem`) floor; a 2-lane column is two of these, an unsplit one is one wider `1fr` track |
| Class card      | Neutral `bg-schedule-card` surface with `shadow-sm`, `shadow-md` on hover |
| Card padding    | `p-1.5` — tight, because the row height is sized to the content, not the other way round |
| Card contents   | Subject + teacher always; the room line renders only when `block.span > 1`, so a 60-minute class never clips. The tooltip and `aria-label` always carry the full detail |
| Empty cell      | Nothing — no card, no placeholder, no "N/A". The day-pair wash and the row rule carry the structure |
| Card tooltip    | `TooltipProvider delay={0}` around the card, which is the `TooltipTrigger`. Never a native `title` attribute |

The grid is a **regular matrix of equal boxes**: uniform columns and uniform
rows, so a class's footprint is simply how many hours it runs for. Geometry is
computed, not hand-written — `scheduleGridTracks` in `lib/schedule.ts` returns
the `grid-template-columns` string, the lane offsets and the uniform `laneCount`,
and header and body consume the same string, so they cannot drift apart.
`scheduleGridBlockWidth(block, laneCount)` takes that uniform count, not the
column's own, so a lone class fills the column it is rendered in.

Lanes are the one exception to "one column per day pair", and they exist only
because two classes can genuinely share a time: after the course/year hard
constraint, that means two *different* courses (or years). When it happens, both
day pairs widen to the same lane count so the matrix stays regular, and each
block in the overlapping cluster takes one lane. `block.lanes` is the width of
the overlap *cluster*, not of the block — a block inside a multi-block cluster
spans exactly one lane, and only a subject that overlaps nothing takes its day
pair's full width.

A week with no overlaps — the normal case, and the dev data — is therefore just
two equal columns of boxes.

## Schedule Display

Both schedule views use neutral class surfaces. Subject, teacher, room, day, and
time are communicated as text. Subject color selection and color markers are
removed.
Both `/dean/schedule` and `/teacher/schedule` use the shadcn Table primitives
with one row per linked class pair and columns for day pair, time, subject,
teacher, and room. The Teacher view is scoped to the signed-in teacher's own
schedule, with labeled filters for day pair, scheduled time, and room plus a
search field for subject, teacher, room, and course. Filter options come from
the teacher's generated sessions, and clearing filters restores the full table.
Subject color fields remain only as legacy storage compatibility; the views do
not read or display them.
