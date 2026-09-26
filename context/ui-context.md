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
| Column surface  | `bg-schedule-column` — a neutral wash over the whole day pair, header included |
| Column header   | Day-pattern label + its label from `dayPatterns`, spanning the uniform lane count |
| Rows            | One per `AVAILABILITY_TIME_SLOTS` entry — 12 rows, 7:30 AM to 6:30 PM   |
| Row height      | `var(--schedule-row-height)`: `3.5rem`, `4rem` at `>= 40rem` — uniform, so a class is `duration × 1 cell` |
| Row rule        | `border-t border-schedule-rule/70` per row, painted under the blocks. Without it an empty hour is indistinguishable from the next one |
| Time gutter     | `TIME_GUTTER` (`3.25rem`) leading column, shared by header and body so they line up |
| Lane width      | `LANE_MIN` (`7rem`) floor; a 2-lane column is two of these, an unsplit one is one wider `1fr` track |
| Class card      | `bg-subject-*-surface` from the subject's palette slot, with `shadow-sm`, `shadow-md` on hover |
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

The timetable is the one place on the page where color **carries meaning**, and
what it means is **the subject**. A class card is painted in its subject's
color, so a Dean's week and a Teacher's week read as the same set of subjects at
a glance, and the two views can never disagree — both read the one
`subjectColor` field the generated `schedules` row already carries.

**The palette is ten muted slots, stored as token names, never hex.**

| Token              | | Token               | |
| ------------------ |-| ------------------- | -|
| `subject-green`    | | `subject-violet`   | |
| `subject-olive`    | | `subject-indigo`   | |
| `subject-amber`    | | `subject-sky`      | |
| `subject-rose`     | | `subject-teal`     | |
| `subject-magenta`  | | `subject-slate`    | |

Each slot is a **triple**, not one flat color, and each part has a light and a
dark value in `app/globals.css`, registered in `@theme inline`:

| Token                              | Role                                       |
| ---------------------------------- | ------------------------------------------ |
| `--color-subject-*-surface`        | The class card background — the wash       |
| `--color-subject-*-foreground`     | The subject name on the card               |
| `--color-subject-*-muted`          | The teacher and room lines, and the dot    |

Use them through `subjectPaletteClasses(token)` in `lib/subject-colors.ts`,
which returns `{ card, muted, dot }` as **complete literal class strings** so
Tailwind can see them. Never interpolate a class name from the token.

**Every color on a schedule card means "subject."** The structure around the
cards is neutral, on purpose: `--schedule-column` and `--schedule-rule` are
greys, not a green wash, because a colored column behind colored cards gave two
things the same visual weight and made a green day-pair look like a subject.

**Legend.** `components/schedule/SubjectColorLegend.tsx` renders
`ScheduleGrid.subjects` — one swatch + name + class count per subject, sorted by
name. Both pages render it above the grid and both feed it the same field, so a
swatch cannot drift from the cards. The subject name is always printed beside
the swatch, and on the card itself, so color is never the only channel. The
Dean's copy lists the subjects in the selected Course + Year and the Teacher's
lists their own, because each hook builds its grid from only the sessions that
view may see.

**Choosing a color.** The Subject form has a `Popover` of the ten swatches.
Until the Dean picks one, the swatch follows `subjectColorTokenForName(name)` —
an FNV-1a hash of the trimmed, case-folded name — which is the *same* hash the
create mutation applies, so the preview is what will be stored. Editing a subject
keeps its stored color. A name that hashes to a slot another subject already
holds is fine: the colors are chosen to be separable, and the legend and the
picker make an identical pair harmless rather than pretending it doesn't happen.

**Cards are separated by shadow, not by border.** `shadow-sm` normally and
`shadow-md` on hover: it is one declaration instead of a border color that has to
stay legible against ten different surfaces, and it survives a card growing to
two or three rows tall.

The grid is deliberately inert: no drag, no editing. Manual schedule
editing is Out of Scope, and conflict validation belongs to the engine,
so a cell is a readout, not a target.

