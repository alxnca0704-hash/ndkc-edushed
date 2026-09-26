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

- [Pattern — e.g. Editor: full-viewport split with
  left sidebar, center canvas, right sidebar]
- [Pattern — e.g. Sidebars: fixed width with border separator]
- [Pattern — e.g. Modals: centered overlay with backdrop blur]
- [Pattern — e.g. Navbar: top bar with bottom border]

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
| Column surface  | `bg-schedule-column` — a green wash over the whole day pair, header included |
| Column header   | Day-pattern label + its label from `dayPatterns`, spanning the uniform lane count |
| Rows            | One per `AVAILABILITY_TIME_SLOTS` entry — 12 rows, 7:30 AM to 6:30 PM   |
| Row height      | `var(--schedule-row-height)`: `3.5rem`, `4rem` at `>= 40rem` — uniform, so a class is `duration × 1 cell` |
| Row rule        | `border-t border-schedule-rule/70` per row, painted under the blocks. Without it an empty hour is indistinguishable from the next one |
| Time gutter     | `TIME_GUTTER` (`3.25rem`) leading column, shared by header and body so they line up |
| Lane width      | `LANE_MIN` (`7rem`) floor; a 2-lane column is two of these, an unsplit one is one wider `1fr` track |
| Class card      | `bg-schedule-card` with `shadow-sm`, `shadow-md` on hover |
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

## Schedule Colors

The timetable is **green**, and it is the one place on the page where color
carries meaning. A neutral `bg-card` block on a white page was effectively
invisible, which is what "make the schedule visible" meant.

Four steps, all hue 152 — the app's existing green (`--accent-primary`,
`--sidebar-accent`), so this tints the timetable rather than introducing a second
green:

| Token                       | Role                                          |
| --------------------------- | --------------------------------------------- |
| `--schedule-column`         | The day-pair wash behind everything            |
| `--schedule-rule`           | The hour hairline across the day pairs         |
| `--schedule-card`           | The class block surface                        |
| `--schedule-card-foreground`| Subject name on a block                        |
| `--schedule-card-muted`     | Teacher and room line on a block               |

Each has a light and a dark value in `app/globals.css`, registered in
`@theme inline` so `bg-schedule-*` / `text-schedule-*` / `border-schedule-*`
resolve. Use the tokens, never a literal green.

**Cards are separated by shadow, not by border.** `shadow-sm` normally and
`shadow-md` on hover: it is one declaration instead of a border color that has to
stay legible against three different surfaces, and it survives a card growing to
two or three rows tall.

Blocks are deliberately **not** color-coded per teacher. The per-teacher palette
(`constants/teacherColors.ts`, the `--teacher-palette-*` tokens) was removed:
color was a second identity system competing with the text on a grid this dense,
and the eight hashed slots collided past eight teachers anyway. The teacher is
named in text on the card, and the tooltip carries the full detail.

The grid is deliberately inert: no drag, no editing. Manual schedule
editing is Out of Scope, and conflict validation belongs to the engine,
so a cell is a readout, not a target.

