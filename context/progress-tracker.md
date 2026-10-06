# Progress Tracker

## Latest Change

- **Taskbar redesign (spec 13):** the shared Dean and Teacher sidebar now uses
  `#072b04` with white labels, a subtle white hover wash, and a white active
  navigation row with dark green text. The color treatment is tokenized in
  `app/globals.css` and documented in `ui-context.md`. Existing navigation,
  identity header, and collapsed icon rail remain in place.

Update this file after every meaningful implementation
change.

## Current Phase

Complete — the schedule is a grid rather than a table, for both roles
(spec 12), it has a fourth hard constraint, and its cards are now **colored by
subject**. `/dean/schedule` and `/teacher/schedule` render the same
`ScheduleGrid`: exactly two columns (MW — Mon & Wed, then TTh — Tue & Thu) and
one row per `AVAILABILITY_TIME_SLOTS` entry (12 rows, 7:30 AM to 6:30 PM), with a
class spanning the rows it occupies. All the geometry lives in one pure
function, `buildScheduleGrid` in `lib/schedule.ts`, so the two pages cannot
drift and the shape is testable without a browser. The four old table components
(Dean's and the Teacher's, plus their skeletons) are gone, and `ui-context.md`
records the grid and its colors.

The three follow-up units after spec 12 were: a visual pass on the grid (lane
geometry, tooltip, density); the **course/year hard constraint** — two subjects
sharing both `courseId` and `year` can never be in a lesson at the same time;
and the **uniform box matrix**, so MW and TTh are always the same width. A
final pass made the grid *visible* (a neutral `bg-card` block on a white page
was effectively invisible) by washing the day pairs, ruling the hours and
lifting the cards off the page with a shadow.

The last pass then made the color mean something: **every card is painted in its
subject's color**, from a ten-slot muted palette (`constants/subjectColors.ts`),
with a legend above both grids. That pass removed the flat green and the
per-teacher palette together, and neutralized `--schedule-column` /
`--schedule-rule` — because once a card's color means "subject," a green
day-pair wash behind it reads as a second subject. See Completed for the storage
and migration story. Verified with `tsc`, `lint`, `build`, the engine smoke test
(111 assertions) and `scripts/schedule-grid-smoke-test.ts` (76 assertions).
Browser verification is still outstanding — see Next Up.

The **engine** has since been rewired to the thesis's algorithm ordering, and the
app now runs it. `gaGenerate.ts` builds the whole week from a blank slate, and
`repair.ts` fixes one broken class automatically on hard constraints only.
`convex/schedule.ts`'s `generate` calls `gaGenerate` directly and no longer runs a
CSP first; the old `runCSP` and `runGA` entry points have been deleted, leaving
`csp.ts` (domain construction) and `ga.ts` (penalty measurement) as the shared
layers both searches read. Saving availability on `/teacher/availability` now
triggers the repair automatically — see Completed ("thesis workflow, live").

## Current Goal

Shipped (see Completed). Remaining follow-up: eyeball it in the browser.
Nothing is visible from the command line that matters most here, and four
things in particular can't be proven by the type checker or a smoke test:
- **The ten hues together.** The palette was chosen as ten muted triples from the
  app's own token families, not by looking at them side by side. Check that no
  two slots are hard to tell apart at card size (a 7rem × 3.5rem block), in
  **both** light and dark mode, and that `--color-subject-*-muted` (the teacher
  and room lines) stays legible on its own `--color-subject-*-surface`.
- **Overlapping classes.** The dev week has no overlap (one teacher owns all
  four labs, and the CSP forbids them double-booking), so the sub-column
  split — the part most likely to look wrong — has never rendered. Force it by
  giving two subjects *different* teachers at the same time in different rooms
  and same-year, and regenerating. (Same `courseId` + `year` can no longer
  overlap at all — that is the hard constraint.) Two subjects on **different**
  years overlapping in time is the case the palette exists for; two blocks in
  one lane, in two different colors, is exactly what needs to look right.
- **The picker.** Open the Subject form on `/dean/subjects` and check the
  popover: the swatch on the trigger follows the name until a color is picked,
  the picked swatch gets a ring, and a name hash change doesn't make the
  preview jump around. Then create a subject, pick a color, generate, and confirm
  the card on both `/dean/schedule` and `/teacher/schedule` is that color and
  the legend lists it.
- **Card density.** A 60-minute class is 3.5rem tall and shows subject +
  teacher only; the room is in the tooltip. A 2-hour class shows all three
  lines. Check the 1-line-to-3-line transition doesn't look accidental.

Also worth a look: the legend wrapping to two lines in the Dean's Course + Year
view (four to five subjects), a 3-hour class's text at the narrow mobile width,
and the 12-row grid at 7:30 AM and 6:30 PM with an empty first/last slot.


## Completed

- **Thesis architecture alignment — a GA that builds the week, a CSP that repairs
  it** — two new standalone modules plus a demo script. This is proposal-defense
  scope: it makes the *algorithm structure* match what the thesis claims, and it
  deliberately changes nothing the app does today.
  - **`convex/scheduling/gaGenerate.ts` — the GA builds the whole schedule from
    a blank slate.** Fitness is the thesis's `F(X) = S(X) − 1001 · P_H(X)`,
    **maximized**.
    - **Blank slate, not a polished answer.** The old `runGA` took a seed schedule
      and could only improve it; `gaGenerate` takes **no seed at all**. Its
      chromosome is one index per subject into that subject's own (pattern,
      time) choices, so a chromosome of N genes is always a complete N-class
      week and the only way to be invalid is to overlap something. The initial
      population is a uniform random draw per gene — the demo counts 146 of 200
      such unsearched draws as already broken, which is what a blank slate
      actually looks like at eight classes.
    - **`S(X)`, 0–100.** Each soft constraint the Dean left on contributes a
      satisfaction of `reference / (reference + penalty)` — 1 with no penalty,
      0.5 once the penalty reaches that constraint's reference magnitude
      (2 overload points, 4 unused days, 4 idle hours) — and `S(X)` is their
      weight-weighted average scaled to 100. A weight of 0 removes the term
      entirely, as everywhere else. All-zero weights means `S(X) = 0`, so the
      search degenerates to "find the least broken week", which is correct
      rather than a special case. Penalties come from the existing
      `measurePenalties`; weights are clamped by the existing
      `normalizeWeights`.
    - **`P_H(X)`, a count.** New `countHardViolations` in `validate.ts`, backed
      by a new `collectHardViolations` that every reader of hard-constraint
      validity now shares (see the decision below). It counts teacher
      double-bookings, room double-bookings, room-type mismatches, blocked
      availability, course+year overlaps, and the structural pair rules.
    - **Infeasible weeks are allowed, and reported.** Nothing forbids a
      candidate from breaking a rule — that is what the penalty is for. On a
      deliberately impossible week the demo gets `S(X) = 100, P_H(X) = 2,
      F(X) = −1902`: a *perfectly packed* week that double-books a teacher, and
      the arithmetic refuses to let the niceness buy the conflict away. The
      result is returned with `valid: false` and the violations listed rather
      than thrown.
  - **`convex/scheduling/repair.ts` — the CSP repairs one broken class,
    automatically.** Input is the post-change schedule plus a **trigger** (the
    event, not a request): `class-edited` (a class was moved/changed) or
    `teacher-availability-changed` (a teacher's new blocks landed under a placed
    session). The system calls it because something happened; there is no
    "Repair" button in this design, and nothing asks the user first.
    - **Local by construction.** Only the classes the engine can see *broken*
      are lifted: the trigger's subject plus everything reachable through the
      violation graph from it (a double-booking names both sides, so the class
      that has to move joins and the walk stops there). Everything else comes
      back byte-for-byte — the demo shows 6 of 8 classes untouched after a class
      edit and 5 of 8 after an availability change. A change that breaks nothing
      is a zero-class repair, not a reshuffle.
    - **Hard constraints only, and it is structural, not a promise.**
      `RepairOptions` is `{ input, schedule, trigger }` — there is nowhere to put
      a weight, so `repair` cannot read a soft constraint even by accident. It
      takes the *first* valid slot it finds for the broken class; it does not
      rank slots, does not score them, and does not re-optimize the week
      afterwards (that would move the very classes it promises to leave alone).
    - **Validity is the same validity the GA counts.** A candidate is accepted
      when `collectHardViolations` reports nothing about that subject, so "hard
      constraint" means exactly one thing across both halves.
    - Returns `{ success, schedule, repairedSessions, affectedCount, changes,
      remainingHardViolations, reason? }`. On failure the schedule comes back
      exactly as it went in, so a caller can roll the change back rather than
      store a broken week.
  - **`scripts/thesis-architecture-demo.ts` — 29 assertions, 0 failures,
    ~4s.** The pressure-test fixture (5 subjects) plus three demo-only classes
    for the same teacher, because at five classes a random draw is usually
    already valid and "blank slate" is invisible. Step 1 runs the GA twice with
    the *same seed* and different weights — a different week and a different
    score, each run at least as good as the other on what it was asked to
    optimize. Step 2 breaks a class on purpose, repairs it, and proves the other
    classes are identical and that the repair is unchanged under three different
    `ScheduleSettings` values.
  - **Soft constraints are GA-only, and CSP-repair is hard-constraints-only and
    automatically triggered by a change.** That is the thesis's split, and it is
    now the code's split: `gaGenerate.ts` is the only module in the engine that
    reads a soft-constraint weight, and `repair` cannot receive one.
  - **Deliberately still out of scope:** the thesis's §9 benchmark, timing
    instrumentation, statistics, or Excel/CSV/JSON export; room capacity and
    faculty preferred-time-window constraints; and the `class-edited` trigger,
    which needs a manual schedule-editing UI that does not exist yet.

- **Thesis workflow, live — the GA generates, the CSP repairs, and the old
  pipeline is gone.** The two modules above were the thesis's *structure*; this is
  that structure actually running, with the superseded pipeline deleted rather
  than left dormant.
  - **`generate` is now GA-only.** `convex/schedule.ts`'s `generate` action calls
    `gaGenerate(input, { weights })` and nothing else. The old `runCSP` → `runGA`
    polish chain is removed: `runCSP`, `greedyDecode`, `diagnoseFailedPlacement`
    and the private `OccupancyTracker` are gone from `csp.ts`, and `runGA` and
    `hasActiveConstraint` are gone from `ga.ts`. What those files keep is exactly
    what both live searches read — `csp.ts` builds the per-subject (pattern, time)
    domains and validates the input, `ga.ts` measures the soft penalties and
    normalizes the weights. The now-dead `CspResult`, `GaOptions` and `GaResult`
    types were dropped from `types.ts` too.
  - **A week the GA cannot make conflict-free is a failure, not a save.** The
    action always returns an `optimization` result, but only writes rows when the
    best week is valid. When it is not, the result carries `conflicts` — the
    violation messages from the shared collector — and the previous database
    schedule is left exactly as it was. A Dean is shown the conflicts instead of a
    timetable that silently contains them. `GenerateScheduleResult` in
    `types/schedule.ts` carries `optimization: OptimizationResult` (no longer
    nullable) and the `conflicts` list; `useSchedule` keeps both, clearing them
    when a new generation starts.
  - **The score is a score, not a penalty.** The GA's `softScore` (0–100) is what
    the UI shows, and `SchedulePage` labels it "Preference score out of 100 —
    higher is better". The old "lower is better" reading is gone from the label,
    though `OptimizationResult.fitness` keeps its field name and still needs its
    doc comment reworded to the new meaning.
  - **Availability changes now trigger the repair, for real.** `setMine` in
    `convex/availability.ts` calls the new internal mutation
    `schedule.repairAfterAvailabilityChange`, which rebuilds the scheduling input
    from the database, runs `repair` with
    `trigger: { kind: "teacher-availability-changed", teacherId }`, and — only on
    success — deletes the rows for the classes that moved and re-inserts them
    through the same `toSessionRow` helper `generate` uses, so a repaired row and
    a generated row cannot differ. No schedule rows means `no-schedule`, which is
    not a repair; a failed repair leaves the stored schedule untouched and logs a
    warning, because a teacher must not lose availability they legitimately saved
    just because their week stopped fitting.
  - **The engine smoke test was retargeted, not deleted.** 112 assertions, 0
    failures. `runCSP` call sites became `runGenerator` (a blank-slate `gaGenerate`
    with no preferences); the `runGA` optimizer sections became assertions about
    the GA that can actually be made now — that with the spread weights on, three
    subjects for one teacher reach the *known* optimum (`daySpread` 0, no
    overloaded day) rather than merely "better than the seed it was given", which
    is no longer a meaningful comparison when there is no seed. Order-dependent
    claims ("MW-first by default", "lands on slot 9") became invariants
    ("both sessions of a class agree on time and room", "sits in a free window"),
    because the day-pair is a gene the GA explores. A week that is only *jointly*
    impossible is no longer asserted to come back as a per-subject diagnosis — a
    genetic search cannot prove one — but as a best effort that must never claim
    success, and the two diagnostics that do name a cause
    (`explainInfeasibility`, `explainPatternFailure`) are now driven directly.
    Added a repair section covering the new live path: a stranded class is moved,
    the same teacher's other classes are not, another teacher's class is not in the
    repair set at all, and a change that breaks nothing returns the week
    unchanged.
  - **`scripts/thesis-architecture-demo.ts` and `scripts/schedule-grid-smoke-test.ts`**
    are unchanged: 29 and 76 assertions, 0 failures. `tsc`, `lint` and `build` are
    clean.


- **Class cards are colored by subject** — a ten-slot muted palette, chosen in
  the Subject form, drawn on both grids with a legend.
  - **The palette.** `constants/subjectColors.ts` holds ten tokens — `subject-
    green`, `olive`, `amber`, `rose`, `magenta`, `violet`, `indigo`, `sky`,
    `teal`, `slate` — each a **triple** in `app/globals.css`
    (`--color-subject-*-surface` / `-foreground` / `-muted`, light and dark,
    registered in `@theme inline`), not one flat color: the card wash, the
    subject name, and the teacher/room lines have to move together or a card
    stops being readable. `lib/subject-colors.ts` maps a token to
    `{ card, muted, dot }` as **complete literal class strings**, because
    Tailwind cannot see a class assembled from a variable. The tokens are the
    *only* thing stored — recoloring a subject is a change to the token's CSS,
    not to stored data.
  - **Storage.** `subjects.color` and `schedules.subjectColor`, both
    `v.optional(v.string())` — see the deployment note below — and
    `generate` snapshots the token onto each row exactly as it does course and
    year, so the Dean and the Teacher read one field and cannot disagree.
  - **The palette is optional and the default is deterministic.**
    `subjectColorTokenForName` is an FNV-1a hash of the trimmed, case-folded
    name; the form uses the *same* function for its preview, so the swatch
    before a pick is the color that gets stored. `subjects:update` preserves an
    existing color when the Dean says nothing about it, so editing a name or a
    room can't move a subject off the color every generated schedule has been
    drawn in. Hashing the *name* rather than the id keeps the form's preview
    honest; the cost is that two names can land on the same slot, which the
    legend and the picker make harmless rather than pretending can't happen.
  - **Picking.** A `Popover` of the ten swatches in `SubjectFormDialog`
    (installed with the shadcn CLI, not hand-written), and a color dot in the
    `SubjectManagement` table so a subject's color is visible before anything is
    generated.
  - **Legend.** `components/schedule/SubjectColorLegend.tsx` renders
    `ScheduleGrid.subjects` — swatch, name and class count, sorted by name so a
    regenerate can't reshuffle it. Both pages render it above the grid. It is
    derived from the *blocks*, not the sessions, so it names exactly the
    subjects on screen: the Dean's list is the selected Course + Year, the
    Teacher's is their own classes.
  - **The flat green is gone, and the structure went neutral with it.**
    `--schedule-card{,-foreground,-muted}` were removed and
    `--schedule-column` / `--schedule-rule` are greys: once a card's color means
    "subject", a green day-pair wash behind it reads as a second subject, and
    green cards on a green page were the thing being replaced.
  - **Both color fields are `v.optional` in the schema — a deployment
    constraint, not indecision.** Convex validates every existing document
    against a new schema *at push time*, so `subjectColor: v.string()` could
    never deploy: the 12 existing rows fail validation, and the backfill that
    would fix them ships in the same push. The push failed exactly that way.
    Optionality is confined to storage — the write paths always write a token,
    `migrations:backfillSubjectColors` (6 subjects) and
    `migrations:backfillScheduleSubjectColor` (12 rows, 0 skipped) filled the
    rest, and both read paths normalize with `asSubjectColorToken`, so
    `Subject.color` and `ScheduleSession.subjectColor` stay non-optional
    `string`s and no component can see a missing color.
  - **Spec 12's "Color = Teacher" is superseded.** The spec still asks for
    per-teacher cells, a `--teacher-palette` token set and a teacher legend; the
    flat green pass already contradicted it and this one removes the subject of
    the disagreement. The spec is left as the historical record — `ui-context.md`
    and this file are the description of the app.
  - Tests: `scripts/schedule-grid-smoke-test.ts` is **76 assertions** — added
    `testSubjectColorsReachTheGrid` (every block in its subject's color; one
    legend entry per subject carrying that color and its class count; name
    order), `testUnknownSubjectColorFallsBack` (a row with no color and a row
    holding a token the palette has dropped both render as the default token,
    block *and* legend) and `testDefaultColorAssignment` (every default is a
    real token, the dev seed's nine names do not all land on one slot, and case
    or whitespace does not move one). `tsc`, `lint` (5 pre-existing warnings in
    generated files + `auth.config.ts`), `build`, engine smoke 111 — all green,
    and the functions are pushed to the dev deployment.

- **Uniform box matrix, no per-teacher color, green and visible** — three
  requests in one pass, all on `ScheduleGrid`.
  - **Uniform widths.** `scheduleGridTracks` gives every day pair the *same*
    lane count — the widest in the week — so MW and TTh are always equal width
    and a week with no overlap is two equal columns. `ScheduleGridTracks` gained
    `laneCount`; header and body already consumed the one track string.
  - `scheduleGridBlockWidth(block, renderedLaneCount)` now takes the *rendered*
    count rather than the column's own `laneCount`. Both columns render
    `laneCount` tracks, so a lone class in an unsplit column has to span that
    many tracks to fill it — reading the column's own count left it sitting in
    one narrow lane beside an empty one, which looked like a rendering fault.
  - **Color assignment removed.** `constants/teacherColors.ts`,
    `components/schedule/TeacherColorLegend.tsx`, `ScheduleGridTeacher`,
    `ScheduleGridBlock.colorToken` and `ScheduleGrid.teachers` are all gone,
    along with the `--teacher-palette-*` tokens in `app/globals.css`. Rationale:
    color was a second identity system competing with the text on a dense grid,
    and the eight hash-assigned slots collided past eight teachers anyway. The
    teacher is named in text on the card.
  - **Visible and green.** A neutral `bg-card` block on a white page was
    effectively invisible, so the grid gained four green tokens, all hue 152
    (the app's existing green from `--accent-primary`/`--sidebar-accent`) and
    registered in `@theme inline`: `--schedule-column` (day-pair wash),
    `--schedule-rule` (hour hairline), `--schedule-card` (block surface) and
    `--schedule-card-muted` (teacher/room line), each with a light and dark
    value. The grid renders them as three background layers painted before
    everything else — column washes, then row rules, then blocks — so a card
    occludes the rule it spans instead of a hairline cutting across it.
  - **Cards separated by shadow, not border.** `shadow-sm`, `shadow-md` on
    hover. One declaration that stays legible against three different surfaces,
    and it survives a card growing to two or three rows tall.
  - Also: a `rounded-xl border bg-card/40` frame on the scroll viewport, so the
    border stays put while the grid scrolls inside it.
  - `ScheduleGridSkeleton` mirrors all of it, so the loaded grid does not jump.
  - Tests: `scripts/schedule-grid-smoke-test.ts` is **61 assertions** — added
    `testColumnsRenderAtEqualWidth` (uniform lane count, track count, offsets,
    identical track widths) and, in `testTrackLayout`, that a lone class fills
    the uniform width while each side of an overlapping cluster still takes one
    lane. 61 assertions, 0 failures. `tsc` clean, `lint` 0 errors/5 pre-existing
    warnings, `build` compiles, engine suite 111 assertions, 0 failures.
  - Two real bugs found and fixed on the way: `app/globals.css` had an
    `Unclosed comment` from the palette deletion (caught by `build`, not by
    `tsc`), and `scheduleGridTracks` had a lint warning from a loop variable
    left unused by the uniform-lane change.

- **Same-course-and-year hard constraint** — two subjects may not be in a lesson
  at the same time when they share **both** `courseId` and `year`. Different
  courses, or the same course in a different year, may still overlap freely.
  - `convex/scheduling/types.ts`: `SchedulingSubject` gains required `courseId`
    and `year` (`SchedulingYear` = `1 | 2 | 3 | 4`, mirroring
    `subjects.year`), plus `courseYearKey(subject)` — the one place that
    defines what "the same class group" means, so the CSP, the validator and
    the diagnostics cannot drift apart on it. `ConflictKind` gains
    `"course-year-conflict"` and `InfeasibilityCause` gains `"course-year-busy"`.
    Making the fields **required** was deliberate: optional fields would let a
    future caller silently skip the constraint, and `tsc` then flags every
    construction site instead of letting one slip through.
  - `convex/schedule.ts`: the action maps `subject.courseId` / `subject.year`
    into the `SchedulingSubject` it builds. `PlacedSession` was deliberately
    left alone — it stays a placement record, and the validator resolves the
    course/year through `subjectById`.
  - `convex/scheduling/csp.ts`: `OccupancyTracker` gains a third
    `byCourseYear` map, and `conflicts` / `add` / `remove` take the key. This
    is the single gate the backtracking search, the greedy diagnostic pass and
    — importantly — the **GA's `greedyDecode`** all pass through, so the GA
    cannot reintroduce a violation: it can only fail to decode, and a failed
    decode is discarded by design. No GA-specific change was needed, and none
    was added.
  - `convex/scheduling/validate.ts`: `validateSolution` re-checks the constraint
    independently over the whole solution, naming the course, the year and the
    day. Independent on purpose — the validator is what `runGA` trusts before
    optimizing a seed, so it must not inherit the CSP's assumptions.
  - `convex/scheduling/cspDiagnostics.ts`: new `courseYearBlockersAt` /
    `courseYearFreeAt` / `courseYearBlockersAtFirstClash` and
    `courseYearMessage`, mirroring the `room-occupied` shape. The new branch
    sits **after** the room check and before the `arrangement-conflict`
    fallback, so `room-occupied` still wins when the room is the actual
    blocker and no existing explanation changes wording. Facts read
    `Course & year` / `Conflicting subject` / `Overlaps`, all engine-formatted;
    the UI only maps the kind to an icon and a label.
  - `types/schedule.ts` + `components/schedule/ConflictAlert.tsx`: the new kind
    gets `UsersRound` and the label "Course & year clash". Both icon and label
    maps are `Record<ConflictKind, …>`, so adding the union member made
    `tsc` fail until the UI handled it — the exhaustiveness check is the
    safety net.
  - `scripts/scheduling-smoke-test.ts`: 96 → **111 assertions**. The decisive
    test is an A/B pair — same teachers, same rooms, same single free slot,
    and the *only* difference between the two runs is the year, so the
    same-course-and-year run fails and the different-year run succeeds. That
    isolates the constraint instead of trusting that some other rule caused
    the failure. Also: the validator rejects a hand-built overlap whose
    teachers and rooms are all distinct (and stops reporting them as
    double-booked), a partial 1-slot overlap still counts, the same placements
    become valid when one subject moves year, `runGA` throws on a
    course-year-conflicting seed, and the GA's output re-validates clean.
  - Verified: `npx tsc --noEmit` clean, `npm run lint` 0 errors (5 pre-existing
    warnings), `npm run build` successful, engine smoke 111/111.
  - No `components/ui/*` change and no schema change: the data was already on
    `subjects`; this only stopped the engine from ignoring it.

- **Schedule grid visual pass** — the first render of spec 12 had a structural
  bug and a flat look. Both fixed:
  - **The lane bug.** The grid declared one CSS track per day pair but placed
    blocks at `columnIndex + 2 + lane`, so an MW block in lane 1 landed in
    TTh's track and bled across the column. Separately, each block used
    `block.lanes` (the width of its whole overlap *cluster*) as its own span,
    so a lane-1 block spanned every track and covered its neighbours. Fixed by
    computing the tracks: `scheduleGridTracks(columns)` in `lib/schedule.ts`
    returns the `grid-template-columns` string plus lane offsets, and
    `scheduleGridBlockWidth(block, column)` returns the span. Header and body
    now consume the same track string, so they cannot drift. The regression is
    covered by `testTrackLayout` in the grid smoke test (52 → 59 assertions).
  - **No empty-cell backdrops.** Per `code-standards.md` (no visible borders;
    separate with background shade and spacing), the empty muted backdrop behind
    every unbooked cell is gone — the day-pair background carries the
    structure. Note `ui-context.md` claimed to be the source of this rule; it is
    a template, and `code-standards.md` is the real source.
  - **Anchored tooltip.** The card was a `div` with a native `title`. It is now
    the `TooltipTrigger` under `TooltipProvider delay={0}`, matching
    `AvailabilityGrid`. `components/ui/tooltip.tsx` is Base UI, not Radix, and
    was left untouched.
  - **Palette.** Each slot is a tone + soft-wash pair, not one flat color: the
    card is filled with the soft wash and the full tone is reserved for the left
    stripe, the time text and the legend swatch, so contrast does the work a
    border would otherwise do. `TEACHER_PALETTE_CLASSES` is now
    `card` / `stripe` / `text` / `dot`. Chroma and hue spread were raised; the
    old values were so close together that teachers were hard to tell apart.
  - **Density.** `--schedule-row-height` is now `3.5rem` (`4rem` at
    `>= 40rem`), sized against the card's content rather than the other way
    round. A 60-minute class shows subject + teacher; the room line renders
    only when `block.span > 1`, because three lines plus padding did not fit
    the shorter row and `overflow-hidden` would have clipped it to a sliver.
    The tooltip and `aria-label` always carry the full detail, and
    `ScheduleGridSkeleton` follows the same row height and stripe-shaped
    legend swatch.
  - Verified: `npx tsc --noEmit` clean, `npm run lint` 0 errors,
    `npm run build` successful, grid smoke 59/59, engine smoke 111/111.

- **Schedule as a grid, for Dean and Teacher (spec 12)** — full unit:
  - `lib/schedule.ts`: `buildScheduleGrid` is now the single source of the
    grid's shape. It collapses each subject's linked pair into one block (the
    same two days of one column are one class, so a card drawn twice would
    claim two classes the schedule has one of), assigns lanes per column, and
    derives columns / rows / the teacher legend. `groupSessionsByDayPattern`
    and `MyScheduleGroup` / `MyScheduleRow` are gone — nothing renders that
    shape anymore. Still pure and Convex-free, so the whole model runs under
    plain `tsx`.
  - `types/schedule.ts`: `ScheduleGrid`, `ScheduleGridColumn`,
    `ScheduleGridRow`, `ScheduleGridBlock`, `ScheduleGridTeacher`. Blocks are
    pre-positioned (`startSlot`, `span`, `lane`, `lanes`, `columnIndex`), so
    a component maps them to `grid-area` and never derives placement itself.
  - `constants/teacherColors.ts` (new): `TEACHER_PALETTE_TOKENS`,
    `TeacherPaletteToken`, and `TEACHER_PALETTE_CLASSES` — the eight slots
    as a `card` / `stripe` / `text` / `dot` set. Static strings only, because
    Tailwind v4 only emits classes it can see at build time; a class assembled
    from a variable would silently render unstyled. `teacherPaletteToken` hashes
    the Clerk `userId`, so a teacher's color is stable with nothing to store.
    (Later widened from the original `card` / `text` / `dot` triple — see the
    visual pass above.)
  - `app/globals.css`: `--teacher-palette-1..8` (light + dark) exposed to
    Tailwind via `@theme inline`, plus `--schedule-row-height`
    (`3.5rem`, `4rem` at `>= 40rem` after the density pass).
  - `components/schedule/ScheduleGrid.tsx`, `TeacherColorLegend.tsx`,
    `ScheduleGridSkeleton.tsx` (new). `ScheduleTable`,
    `ScheduleTableSkeleton`, `MyScheduleTable`, `MyScheduleTableSkeleton`
    deleted. The grid is deliberately inert — no drag, no editing, since
    manual editing is Out of Scope and validation belongs to the engine.
  - `hooks/useSchedule.ts` / `useMySchedule.ts` return a `grid`; both pages
    render `ScheduleGrid` and the new skeleton.
  - `scripts/schedule-grid-smoke-test.ts` (new, then 52 assertions): linked-pair
    collapse, spans, lanes, lane reuse, the empty grid, palette determinism,
    and a dev-week mirror. It earned its keep immediately — see Session
    Notes. (Now 59, after the visual pass added the lane-geometry regression.)
  - `context/ui-context.md`: new **Schedule Grid** and **Teacher Colors**
    sections; `context/project-overview.md`: the Dean's "read-only table
    view" and the Teacher's grouping bullet now describe the grid.
  - Verified: `npx tsc --noEmit` clean, `npm run lint` 0 errors (5 pre-existing
    warnings in `convex/_generated/*` and `convex/auth.config.ts`),
    `npm run build` green, `scheduling-smoke-test.ts` 96/96.

- **Teacher "My Schedule" page — the real read-only view (spec 11)** — full
  unit:
  - `convex/schedule.ts`: new `listMine` query returning the caller's own
    sessions, read through the `by_teacherId` index that spec 05 created
    "for the teacher view" (still unused until now). It takes **no
    arguments**: the teacher is the verified Clerk identity's `subject`,
    resolved server-side, so a client cannot ask for another teacher's rows
    (Invariant 3) and there is no id to keep in sync on the client.
    Anonymous and non-teacher callers get the same
    `{ ok: true, data: [] }` Result union as `rooms.listAll` /
    `availability.getMine` rather than a throw, so a failed page load
    surfaces through the hook's `error` (Invariant 8). `roleOf` came in
    alongside the existing `isDean` import.
  - `lib/schedule.ts` (new): `byTimeOfWeek` + `sortSessionsByWeek` — the
    day → start-time → subject-name week order, **extracted out of
    `useSchedule`** rather than copied, so the Dean's and the Teacher's view
    read a generated week identically and two comparators can't drift. The
    comparator takes the three fields order depends on, and the helper
    returns a new array (the Convex query result is never sorted in place).
    `useSchedule` now imports it; its grouping/ordering is unchanged.
    The file also owns `groupSessionsByDayPattern`, the day-pair grouping
    (see below) — it is pure and has no React/Convex import, so the shape a
    teacher sees can be exercised by a plain `tsx` script.
  - `hooks/useMySchedule.ts` (new): `api.schedule.listMine` + the shared sort
    and grouping, returning `{ groups, subjectCount, sessionCount, isLoading,
    isEmpty, error }`. Every field the table shows is already on the
    generated row, so the hook does no joining at all — the spec's "join in
    the hook if not denormalized" branch turned out to be unnecessary (spec
    08 already denormalized course/year/room, names come from spec 05).
  - **Grouped by day pattern, one line per class** (`groupSessionsByDayPattern`
    in `lib/schedule.ts`): sessions are bucketed by the `dayPattern` the
    algorithm chose and rendered MW first, then TTh, and a pattern the
    teacher has no classes for is left out entirely (no empty heading). Inside
    a group, a subject's two sessions collapse into **one** row when they
    share a time and a room — that is what "linked pair" means in the
    scheduler — so a Mon/Wed class is never split into two lines. A pair that
    doesn't match (the validator makes this unreachable via `generate`) falls
    back to one row per session with its own day name rather than lying about
    a shared time.
  - `components/schedule/MyScheduleTable.tsx` (new): one `<section>` per day
    pattern, headed by the pattern `Badge` + its label ("MW · Mon & Wed"),
    each holding the mobile card list (below `sm`) and the table (from `sm`
    up) for that group. Columns: Subject / Course / Year / Day / Time / Room,
    purely read-only (no actions, no drag-and-drop; editing is Dean-only per
    `architecture.md`). Course is a `Badge` with the code plus a muted name
    and Year is an outline `Badge`, copied from the Dean's subjects table for
    the same two fields; the time range is `formatClock` on both ends
    (`7:30 AM – 8:30 AM`). Day labels come from `AVAILABILITY_DAYS` /
    `areaPatternLabel`, not a local day or pattern list.
  - **Mobile-first collapse** (the spec's mobile requirement, and
    `code-standards.md`'s "tables collapse to a stacked/card layout on small
    screens"): stacked cards below `sm`, the table from `sm` up. Each card
    is a `<li>` in a `<ul>` — subject + day-pair label, time, course/Year
    badges + course name, then Room — separated by `bg-muted/30` background
    contrast, not borders. This is the **first** table in the repo to do this
    (see Open Questions).
  - `components/schedule/MyScheduleTableSkeleton.tsx` (new): mirrors the
    shape — a group heading, then card blocks below `sm` and six header cells
    + row-shaped rows from `sm` up. It draws **one** group heading because the
    real group count isn't known until the query resolves, so a two-group week
    is slightly taller once loaded.
  - `components/schedule/MySchedulePage.tsx` (new) +
    `app/teacher/schedule/page.tsx` (now a plain server component that renders
    it, like every other page in the app — the old placeholder was the only
    `"use client"` page file): heading + one-line summary ("4 subjects · 8
    sessions this week, grouped by day pair.") and the loading → skeleton /
    error → `ErrorState` + reload retry / empty → `EmptyState` / data → table
    ladder. **The empty state has no action button**: a teacher can't generate
    their own schedule (Dean-only), so the copy names the Dean rather than
    offering a dead "Generate" button.
  - `context/project-overview.md`: the "My Schedule (Teacher)" feature now
    states the day-pattern grouping, the course + year columns, and that the
    view is read-only.
  - Verification: `npx tsc --noEmit` clean; `npm run lint` 0 errors (the same
    5 pre-existing warnings in `convex/_generated/*` +
    `convex/auth.config.ts`); `npm run build` green with `/teacher/schedule`
    routed; `npx tsx scripts/scheduling-smoke-test.ts` **77/0** (the engine
    was not touched); `npx convex dev --once` pushed to
    `dev:astute-akita-425` (functions only — no schema change, so no
    migration window).
  - The grouping itself was checked with a throwaway `tsx` script (written to
    the temp dir, not committed) over the 8 real dev rows: **MW (Mon & Wed)
    with SE 101 (7:30 AM) then OS 101 (10:30 AM), TTh (Tue & Thu) with
    CC 106 then HCI 101**, all four collapsed as linked pairs, plus the
    MW-only teacher (1 group, no empty TTh heading) and a deliberately
    mismatched pair (not collapsed). If this logic grows, that script is worth
    promoting into `scripts/` beside the engine smoke test.
  - The ownership filter was checked **live** with the CLI's `--identity`
    flag (new discovery, see Session Notes):
    `npx convex run 'schedule:listMine' --identity
    '{"subject":"user_3Jj4…","metadata":{"role":"teacher"}}'` returns all 8
    dev rows, the same query with a **different** teacher id returns `[]`,
    with a **Dean** identity returns `[]` (a Dean reads `listAll`), and
    anonymous returns `{ ok: true, data: [] }`. That is the real
    "never another teacher's classes" proof — but with a synthetic identity,
    not a signed Clerk session.
  - Not verified in a browser (no teacher session here) — see Next Up.

- **Schedule Optimization (Dean) — the GA wired into `generate` (spec 10)** —
  full unit:
  - **Scope first, per the spec's "do this first":** `project-overview.md` now
    has a **"Schedule Optimization (Dean)"** Features section; the old
    "Teacher preferences (soft constraints)" Out-of-Scope entry is replaced by
    the three Dean-configurable constraints, and re-optimizing on a manual
    adjustment stays out of scope (there is no manual adjustment to trigger
    it). This retires the old "Next Up #6" note that deferred wiring until
    soft constraints came in scope.
  - `types/scheduleSettings.ts` + `constants/scheduleSettings.ts`: the
    app-level `ScheduleSettings` shape (`{ workloadBalance, daySpread,
    gapMinimization }`, each `{ enabled, weight }`), the UI-order key list,
    labels, descriptions, the 0–10 range, and `DEFAULT_SCHEDULE_SETTINGS` —
    the constants file imports its types relatively so `convex/` can consume
    it.
  - `convex/schema.ts`: one `scheduleSettings` table, a singleton by
    convention. **Groups are flattened** into `workloadBalanceEnabled`,
    `workloadBalanceWeight`, … rather than a nested object, matching how the
    rest of the schema is written.
  - `convex/scheduleSettings.ts`: Dean-gated `get` (returns the defaults when
    no row exists yet) and `save` (inserts the singleton on first save,
    replaces it after, rejects a second row). Weights are validated as
    integers in 0–10; `enabled` is stored for display but the engine treats
    **weight 0 as off**, so the two can never disagree.
  - `convex/scheduling/types.ts`: `SoftConstraintWeights`, `SoftConstraintKey`,
    `GaPenalties`, `GaResult`, and `GaOptions.weights` + `GaOptions.random`.
  - `convex/scheduling/ga.ts`: rewritten around weighted fitness and a
    **two-part chromosome** — `order` (which subject claims a time first, the
    only lever that can close a teacher's idle gap) and `patterns` (each
    subject's MW/TTh choice, the only lever that can change a teacher's class
    count per day). `measurePenalties` scores the three penalties
    independently of the weights; `normalizeWeights` clamps 0–10;
    `hasActiveConstraint` is the skip check. `runGA` returns
    `{ schedule, fitness, penalties }` and never returns a worse schedule than
    the seed it was given.
  - `convex/schedule.ts`: CSP first, then the settings read (**best effort** —
    a failed read falls back to the all-zero defaults, so a broken settings
    query degrades to a plain CSP schedule instead of failing the generate),
    then `runGA` only when a weight is non-zero, then a re-validation of the GA
    output before anything is persisted. A validation failure degrades to the
    untouched CSP schedule with no score rather than failing the generate,
    since an invalid GA output is an engine bug and the optimization is
    best-effort by design. The action's success result gained
    `optimization: OptimizationResult | null`.
  - **Fitness is not persisted.** The score is returned in the action response
    and rendered transiently; nothing is written to a table for it, so a
    re-render or a page reload can never show a stale number.
  - `hooks/useScheduleSettings.ts` (new) + `components/schedule/
    SoftConstraintSettings.tsx` (new): the query/mutation live in the hook,
    the shadcn `Dialog` is presentational, with a `Switch` per constraint and
    a `Slider` (0–10) revealed while it's on. Save is disabled while
    unchanged, Cancel discards, and the draft re-syncs from the query during
    render (the repo's lint config rejects `setState` in an effect).
  - `components/schedule/SchedulePage.tsx`: an **Optimization** button opens
    the dialog; the score appears as a muted `Badge` + "lower is better" line
    under the toolbar, and only when the GA actually ran.
  - `convex/scheduling/ga.ts` also gained an injectable `random` so the smoke
    test is deterministic, plus a guard in `mutateOrder` for a single-subject
    schedule (a one-element permutation has no second index to swap with, so
    the retry loop could never exit).
  - **Verification:** `npx tsc --noEmit` clean, `npm run lint` clean (only the
    5 pre-existing warnings in `convex/_generated` + `auth.config.ts`),
    `npm run build` green, `npx tsx scripts/scheduling-smoke-test.ts` **77
    assertions / 0 failures**, and `npx convex dev --once` pushed to
    `dev:astute-akita-425` (verified the new `scheduleSettings` table exists via
    `npx convex data scheduleSettings`).
  - Smoke coverage added for this unit: all-weights-off returns the CSP
    schedule exactly; a weight of 0 removes its term from the score while the
    penalty is still reported; the pattern gene takes a 3-subject/1-teacher
    fixture from workload 2 + spread 2 down to 0 + 0 while staying valid and
    pair-linked; a hand-built seed with a real 3-hour idle hole has its gap
    penalty driven 6 → 0; and an invalid seed throws.
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

- (none — spec 12 was the only open unit; it is now in Completed.)

## Next Up

1. Read `npx tsx scripts/thesis-architecture-demo.ts` end to end before the
   proposal defense — it is the artifact, and the two numbers worth being able
   to explain cold are `F(X) = −1902` on the impossible week (why `1001` is
   there) and `affectedCount = 2 of 8` on the repair (why the other six classes
   cannot move). Nothing else in this list is blocked on it.
2. ~~**After proposal approval only:** decide whether the app switches to the
   thesis pipeline (`gaGenerate` in, `runCSP`/`runGA` out).~~ **Done** — see
   Completed ("thesis workflow, live"). What that pass leaves behind:
  - `OptimizationResult.fitness` still carries its old field name while holding a
    0–100 score. The doc comment in `types/scheduleSettings.ts` now states the
    new meaning (and says the name is a deliberate leftover); renaming the field
    across the client types, the action and the UI is still open.
   - The `class-edited` repair trigger is still unreachable, because there is no
     manual schedule editing. `teacher-availability-changed` is the live one.
3. **After proposal approval only:** the benchmark / statistics / export pass that
   turns the demo into results (§9), plus room capacity and faculty
   preferred-time-window constraints (§5). The GA parameters are already at the
   thesis's table; what is missing is measurement, not tuning.
4. Sanity-check spec 12 in the browser (Dean login for `/dean/schedule`,
   teacher login for `/teacher/schedule`): confirm the two MW / TTh columns
   line up with their header cells, the 12 time rows read 7:30 AM to 6:30 PM,
   a 3-hour class spans three rows in both views, the loading skeleton has
   the same silhouette, and the legend's colors match the cards. **The
   sub-column split for overlapping classes has never rendered** — the dev
   data can't produce an overlap, so give two subjects the same teacher and
   time in different rooms, regenerate, and look at it. Then check the
   inverse: a lone class in a column that another time had to split should
   still be full width.
5. Sanity-check spec 11 in the browser with a real teacher login: confirm
   `/teacher/schedule` shows only that teacher's classes, one card per class
   (not two for a Mon/Wed class), the summary line's class count matching
   the cards, and the loading skeleton. The empty state and cross-teacher
   isolation can't be seen with the current dev data (one teacher owns all
   8 rows) — add a second teacher's subject, regenerate, and log in as each
   teacher.
6. Sanity-check spec 10 in the browser with a real Dean login: open
   Optimization, toggle each constraint, drag a weight, save, re-open (the
   values must come back from the `scheduleSettings` row), then generate once
   with a weight on and once with everything off. The dialog's
   loading/error/saving states, the "Save settings" disabled-while-unchanged
   rule, Cancel-discards behavior, the score `Badge` + "lower is better" line,
   and the toast wording have not been eyeballed.
7. Sanity-check spec 09 in the browser with a real Dean login: force a
   generate failure (block a teacher's whole MW pair, or point two subjects at
   one room so it is taken at every shared start) and confirm the
   `ConflictAlert` names the room + the class holding it + the overlapping
   time, or the teacher + the blocked window, with one alert per failed
   subject and the accordion when several fail. The alert's border/destructive
   styling has not been eyeballed.
8. Sanity-check spec 08 in the browser with a real Dean login: switch
   through every Course + Year group in the `/dean/schedule` selector,
   confirm each view shows only that group's sessions, and confirm a
   group with subjects but no placed classes renders the shared
   `EmptyState`. The selector's grouped `Select` (per-course group
   labels, per-year class counts) has not been eyeballed — group labels
   and mobile layout especially.
9. Sanity-check spec 07 in the browser with a real Dean login: add/edit/
   delete a Course at `/dean/courses`, create a Subject with the new
   Course/Year selects (and confirm submit is blocked without them), and
   read the Course/Year columns in the subjects table. Lint/build/smoke are
   green and the dev data is migrated, but the UI has not been eyeballed.
10. Dean schedule view polish / student-facing schedule (out of scope until
    confirmed in specs)
11. Sanity-check the 2-column availability grid in the browser (real teacher
   login): red blocked cells, save/reset round-trip, tooltip labels — the
   pattern keys and grid are covered by lint/build/smoke, but the visual/UX
   hasn't been eyeballed

## Open Questions

- ~~**The app's pipeline and the thesis's pipeline are two different things**~~
  (raised by the thesis-alignment pass, **resolved** by the thesis-workflow pass —
  the app is now on the thesis's ordering: GA builds globally, CSP repairs
  locally, and the `runCSP`/`runGA` pipeline is deleted). The two questions it
  left open, both now partly answered:
  - *What does the app do on a week the GA cannot schedule?* It saves nothing and
    reports the conflicts, with the previous schedule left in place. The
    open-question concern that "a `P_H > 0` result is a worse failure than 'no
    arrangement exists'" turned out not to apply: the GA is given no fallback to
    compare against, so the honest statement is *how close it got and what is
    still broken*, which is what the violation list is.
  - *What modification event triggers `repair`?*
    `teacher-availability-changed`, wired to the availability save.
    `class-edited` still has no event, because manual schedule editing is Out of
    Scope in `project-overview.md`.
- **What the Dean's weights actually mean, now that a score exists** (asked by
  spec 10, answered — the honest limits are recorded here): the number is a
  **penalty total in "constraint points"**, not a percentage, quality grade, or
  0–100 score, and only its *ordering* is meaningful (a schedule with 12 is
  better balanced than one with 40 for the same weights). The weights are
  relative, so a weight of 10 vs 4 does not mean "2.5× more important" in any
  absolute sense — it changes how the GA trades one penalty against another,
  and the absolute size depends on the week's shape. So the UI says "lower is
  better" and names the constraints in the score, but does **not** label the
  number (no grade, no "80% optimized"): there is nothing to compare it against
  and a label would be a claim the engine can't back. Also worth knowing: a
  score is only comparable to another score generated with the **same weights**
  — the fitness is not persisted, so after changing the weights there is no
  previous number to compare against.
- **Whether `enabled` is worth keeping at all** (spec 10 asked for a per-
  constraint on/off; noted rather than settled): weight 0 already means "off"
  and the engine only reads the weights, so `enabled` exists purely to make the
  UI state explicit (a constraint can be left on with weight 0, which reads as
  "on but not counted" and is indistinguishable in the score from off). It is
  stored on the row for display, not consulted by the scheduler. If a future
  spec wants "on with weight 0" to behave differently from "off", the two
  fields need to diverge and that has to be a deliberate change to
  `normalizeWeights`.
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
  **Update:** the engine now carries a fourth hard constraint — two subjects of
  the same course *and* year may not overlap (see Completed). It is the one
  rule that is scoped *within* a group rather than across the whole week, which
  is exactly why a per-course-year regenerate stays awkward: the regenerate
  would be free to ignore the new constraint for groups it does not touch,
  because those groups' rows are fixed. The current global pass has no such
  hole, which is an argument for leaving it global.
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
- ~~`/teacher/schedule` ("My Schedule") is a placeholder page with a real
  schedule source now available (`schedules` table, `by_teacherId`
  index)~~ Resolved by spec 11: the page is now the real read-only view over
  `schedule.listMine`. Two things it surfaced are recorded below: the spec's
  font instructions don't exist in this app, and no table in the repo has
  collapsed to cards before.
- **The spec's UI/UX section describes fonts and a table convention this
  app doesn't have (asked by spec 11, answered — flagged rather than
  settled)**: it says to follow `ui-context.md` for "Roboto for table text,
  Montserrat for the page heading", but `ui-context.md` is still an unfilled
  template and the app loads **Geist Sans / Geist Mono** via `next/font`
  (`--font-sans`, with `--font-heading` aliased to it). Introducing two more
  families for a single page would be a global typography decision, so
  `MySchedulePage` uses the same heading classes as every other page. If
  Montserrat/Roboto are actually wanted, they belong in `ui-context.md` +
  `globals.css` as an app-wide change, with `next/font` loading them.
- **No table in this repo has collapsed to a card layout (asked by spec 11,
  answered — first instance, confirm before it becomes convention)**: the
  spec asked for "the existing convention of collapsing to a stacked/card
  layout", but every existing table (`ScheduleTable`, `CoursesTable`, the
  subjects table) uses the shadcn `Table` primitive and inherits its
  `overflow-x-auto` — which is `code-standards.md`'s *fallback* clause
  ("if a table must remain, wrap it in `overflow-x-auto`"), not its first
  one. `MyScheduleTable` is now the only table that does the collapse
  (cards below `sm`, table from `sm` up) because six columns is too many for
  a phone and this is the view a teacher is most likely to check on one.
  Sanity-check it in the browser, and decide whether to roll the same
  treatment back into the Dean tables or not.
- **The teacher's table is grouped by day pattern, one line per class (spec
  11 asked for "sort rows by day then start time"; corrected mid-unit)**: the
  first pass was one row per session in day order, which split a Mon/Wed class
  across two lines — the day-pair label existed on every row
  (`dayPattern` is an engine output, spec "Algorithm Chooses the Day
  Pattern") and the user asked for it to be grouped instead. It is now one
  `<section>` per pattern (MW, then TTh, an empty pattern omitted) with a
  subject's linked pair collapsed to a single line, matching how the Dean
  table already collapses a clean pair. Two consequences left to eyeball: the
  **Day column now repeats the section heading** on every row (kept, because
  the spec's column list asks for it and it keeps a row self-describing, but
  the Dean table deliberately omits columns that repeat their group — worth a
  look before this becomes convention), and a teacher who teaches on one pair
  only sees one heading.
- **The hook returns `sessions`, not `data` (spec 11 asked for
  `{ data, isLoading, isEmpty, error }`)**: the spec tied `data` to "the
  established convention in `code-standards.md`", but the repo's convention is
  a semantic field name (`useAvailability` → `blockedSlots`, `useSchedule` →
  `groups`/`activeGroup`, `useRooms` → `rooms`). `sessions` matches the
  component's prop and the `schedules` vocabulary. Same for the hook not
  reading the Clerk user id on the client: the spec allowed "the project's
  existing auth hook pattern", and `availability.getMine` resolves the
  teacher from `ctx.auth.getUserIdentity()` server-side. That is strictly
  safer than `useUser()` + an argument — the client never holds an id it
  could tamper with — and it means the hook has no auth code at all.
- **Dev data can't show this view's empty state or its isolation by eye**:
  all 8 generated rows belong to one teacher (Zyneer Moreno), so a login as
  any other teacher shows the empty state and there is no second teacher's
  class to be tempted to leak. The `by_teacherId` filter itself was verified
  against dev with a synthetic identity (a different teacher id → `[]`), but
  a real second teacher's subject + a regenerate is what the browser check
  needs.
- The antd/shadcn split: existing dashboard components
  (`DeanDashboard`, `TeacherDashboard`, root antd `ConfigProvider`) still use
  antd, while new UI (the sidebar, Subject Management, Room Management, Teacher
  availability) uses shadcn. Decide when/how to migrate the remaining antd
  components to shadcn, or keep antd for them.
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
- **Eight palette slots means two teachers can collide past eight (spec 12)**:
  accepted for the prototype and recorded rather than solved. Beyond ~8
  distinct teachers, two of them will hash to the same color and the legend
  will be ambiguous. If that bites, the fix is a real assignment (a table, or
  an index into a larger palette seeded from `userId` creation order) — not a
  cleverer hash, which would just make collisions rarer and still wrong.
  Related: the legend distinguishes teachers by color alone, so it is also a
  color-only legend; the cards carry subject + teacher text, which is the
  non-color path to the same information.
- The `Legacy Lab`/`Legacy Lecture` fallback rooms created by
  `convex/migrations.ts` are editable/deletable from the Dean room UI —
  re-assign/move the `SE 101` subject first if the fallback room is
  deleted.

## Architecture Decisions

- **"Is this schedule valid?" has exactly one implementation with three readers**
  (thesis alignment). `collectHardViolations` in `validate.ts` returns every
  breach as `{ kind, message, subjectIds }`, and the three consumers each take
  the view they need: `validateSolution` (unchanged signature and messages) for
  the boolean the app shows, `countHardViolations` for the `P_H(X)` the GA
  minimizes, and the `subjectIds` for the repair's conflict walk. The reason for
  one collector is that "hard constraint" is the load-bearing concept in both
  halves of the thesis — a GA that counts one thing and a repair that checks
  another would make the defense claim unprovable, and three separate checks
  would be three chances to disagree about what a course-year overlap is.
  `subjectIds` on a double-booking naming *both* sides is what lets a repair
  find the class it must move without re-deriving what overlaps what.
- **The whole "valid first, pleasant second" rule is one number, and `1001` is
  the reason it can be** (thesis alignment). Because `S(X)` is capped at 100,
  a multiplier of 1001 on `P_H(X)` makes one violation cost more than the entire
  soft range can earn — so maximizing a single weighted sum *is* a lexicographic
  objective, with no penalty-tuning ladder and no second phase. The
  demonstration that this is load-bearing rather than decorative: on an
  impossible week the GA returns a *perfectly packed* timetable scoring
  `S(X) = 100` with two teacher double-bookings, and `F(X) = −1902`. A GA that
  simply discarded invalid candidates (what `runGA` does) could not express that
  preference at all.
- **The blank-slate GA is a second module, not a mode of `runGA`** (thesis
  alignment). `runGA` is an *optimizer* and its defining property is that it can
  never lose to its input (its seed is the incumbent). The thesis's GA is a
  *constructor*, and the property it needs is the opposite: it must be free to
  propose an invalid week, because validity is something the fitness function
  buys rather than something the representation guarantees. Folding the two
  together would have meant either weakening the incumbent guarantee that
  `generate` relies on today, or making the blank-slate search refuse to propose
  the candidates it needs. They stay separate files with separate names
  (`runGA` vs `gaGenerate`) so the two claims never blur.
- **A repair is triggered by an event, never requested by a user** (thesis
  alignment). `repair` takes a `RepairTrigger` — the thing that happened — and
  the app would call it from the mutation that made the change, not from a
  button. This is a design constraint, not a missing feature: a "Repair" button
  puts the user in the loop for something with exactly one sensible answer, and
  the thesis's point is that the repair is a *consequence* of the change, not a
  decision. It is also why the trigger for an availability change carries only a
  `teacherId` and not a list of classes: which classes the new block actually
  broke is the engine's business, and making the caller work that out is how a
  repair quietly grows into a full regeneration.
- **The repair's locality is derived, never requested** (thesis alignment). The
  affected set is the trigger's subject plus everything reachable through the
  violation graph, filtered to classes the engine can actually see broken. That
  filter is the difference between a repair and a reshuffle: a teacher who
  blocks one afternoon has many classes that the new block never touched, and
  the first version of this code (seeding with all of that teacher's subjects
  unconditionally) moved all eight of them. The demo caught it.
- **The grid's shape is data, not a rendering concern (spec 12)**: every
  block arrives pre-positioned (`startSlot`, `span`, `lane`, `lanes`,
  `columnIndex`) from `buildScheduleGrid`, and the component only maps that to
  CSS `grid-area`. A component that derived "which row does 14:00 land in"
  would be a second, driftable copy of the slot arithmetic — and it would be a
  copy in *each* of the two views.
- **A subject's linked pair is one block, not two (spec 12)**: Mon+Wed is one
  column, so the two sessions are the same class seen on two days. Drawing a
  card per session would show the school two of a class it has one of, in the
  one place the user goes to check. A pair only collapses when the time and
  room actually match (`isLinkedPair`); a mismatched pair stays two blocks,
  because claiming a shared time the two days do not share is worse than
  showing the duplication.
- **Lanes are per day pair, and a class that overlaps nothing takes the full
  width (spec 12)**: MW and TTh never compete for the same sub-column, and a
  block in a cluster of one spans its whole day pair. This was a real bug
  first — lanes were assigned across the whole grid, so a class in the MW
  column pushed an unrelated class in the TTh column into a second lane. The
  smoke test's dev-week mirror is the case that caught it; see Session Notes.
- **A time that doesn't sit on the slot grid is dropped, not rounded (spec
  12)**: `slotIndexOf` now requires an exact slot boundary instead of
  `Math.round`. Rounding put a 1:00 PM class in the 1:30 PM row — a card
  confidently labelled with the wrong time. Unreachable through `generate`
  (its validator keeps durations on slot multiples inside school hours), so
  this only decides how a bad row fails: invisibly, or under the wrong label.
- **Teacher color is a hash of the Clerk `userId`, not a stored assignment
  (spec 12)**: eight slots, deterministic, no table, no admin UI to keep in
  sync, and a teacher keeps their color across devices and rebuilds. The
  tradeoff is recorded in Open Questions.
- **The teacher's schedule is filtered on the server from the verified
  identity, not from a client-supplied id (spec 11)**: `schedule.listMine`
  takes no arguments and reads the `by_teacherId` index with
  `identity.subject`. A "read my rows" query that accepts a teacher id would
  be an authorization hole (any signed-in teacher could pass someone else's
  id and read their week), and it would put a user id in client state that
  has to stay in sync with the session. This is the same pattern as
  `availability.getMine`, and it satisfies Invariant 3 by construction. The
  hook therefore has **no Clerk code** — there is nothing to read.
  Non-teachers (including Deans, who use `listAll`) get the empty Result
  union rather than a throw, matching `rooms.listAll`.
- **Week order lives in one shared helper (`lib/schedule.ts`), not in each
  hook (spec 11)**: the day → start-time → subject-name comparator was lifted
  out of `useSchedule` when `useMySchedule` needed the identical ordering, so
  the Dean and Teacher views cannot drift apart on what "in order" means. It
  sorts a copy, because the Convex query result must not be mutated.
- **The generated row is the read model for both roles (spec 11)**: the
  teacher view needed Subject, Course, Year, Room, Day, and Time, and all of
  it is already denormalized onto `schedules` at generation time — so the
  teacher hook filters and sorts and nothing else, and the table component
  does no joining. The cost is the snapshot semantics already recorded above
  (renaming a Room doesn't rewrite a generated week); the benefit is that no
  read query re-joins Subjects/Courses/Rooms per render, and a teacher's
  view can't disagree with the Dean's about the same class.
- **A teacher's week is grouped by day pattern, and a linked pair is one row
  (spec 11)**: `groupSessionsByDayPattern` (`lib/schedule.ts`) buckets the
  teacher's sessions by the `dayPattern` the algorithm chose — MW first, then
  TTh, empty patterns omitted — and collapses a subject's two sessions into
  one row when they share a time and room. The pattern is an *engine output*
  (there is no Dean input to disagree with), so grouping by it states the
  real shape of the week instead of implying a Mon→Sat grid; a pair that
  doesn't match falls back to per-session rows so the UI can never show a
  shared time for two classes that don't share one. This mirrors the Dean
  table's pair-collapsing, so both roles read a subject's two meetings the
  same way. The logic lives in `lib/`, not the hook, because it is pure and
  testable without React or Convex.
- **The teacher schedule is read-only, with no action on the empty state
  (spec 11)**: editing a schedule is Dean-only (`architecture.md`'s access
  model, and manual editing is Out of Scope in `project-overview.md`), so the
  page renders no buttons at all. The `EmptyState` names the Dean instead of
  offering a "Generate Schedule" action the teacher cannot perform.
- **Fitness is a penalty total, so lower is better and 0 is perfect** (spec
  10). A schedule that violates no soft constraint scores 0 and a worse
  schedule scores higher, which matches how the constraints are phrased ("more
  classes than X in a day", "fewer than 4 days", "N idle hours") and avoids
  inventing a normalization (percentage of an ideal) that would have no stable
  denominator. The three penalties are measured in `measurePenalties`
  *independently of the weights* and the weights are applied afterwards in
  `score`, so `GaResult` can return both and the UI can name which constraint
  cost what instead of showing one opaque number.
- **The exact penalty definitions, recorded because they are the scoring
  contract** (spec 10 left them to us):
  - `workloadBalance` — per teacher-day, `max(0, classes − 2)`, summed. Two
    classes a day is the comfort ceiling; the 3rd costs 1 point, the 4th
    costs 2.
  - `daySpread` — per teacher, `max(0, 4 − daysTaught)`, summed. A day-pair
    week can only span Mon/Tue/Wed/Thu, so 4 is the ceiling and 0 is
    achievable; a teacher who teaches on one pair is charged 2.
  - `gapMinimization` — per teacher-day, `floor(span − teaching minutes) / 60`
    idle hours, summed, floored at 0 per day (not at 0 overall, so many small
    20-minute holes can't silently sum to a free hour). This is the only
    continuous term, so it's the one that makes re-timing a class worth
    something.
  - The 2-per-day and 4-day ceilings are constants in `ga.ts`
    (`COMFORTABLE_CLASSES_PER_DAY`, `DAYS_IN_A_SCHOOL_WEEK`), not magic numbers
    sprinkled through the scoring loop.
- **A weight of 0 removes the term from the fitness entirely** (spec 10 asked
  us to decide whether "off" removes the constraint or just zeroes its
  influence — they're the same thing, so no separate code path). A 0-weighted
  constraint can neither improve nor worsen the result, and when all three are
  0 the action **skips `runGA` entirely** instead of running a search whose
  fitness is 0 for every member. That is the difference between "no preference"
  and "no optimization", and it is why `optimization` is `null` (not
  `fitness: 0`) when the GA didn't run.
- **The GA gets the MW/TTh pattern back as a second chromosome gene** (spec
  10). The chromosome is now `{ order, patterns }`: `order` decides which
  subject claims a time first (the only lever that can close an idle gap),
  `patterns` carries each subject's day-pair (the only lever that can change a
  teacher's class count on a given day). With the old pair-atom chromosome the
  pattern was locked to the CSP's pick, so **two of the three requested
  constraints were structurally unfixable** — a teacher's Mon/Wed count is a
  function of which pattern each of their subjects took, and re-timing a class
  cannot change it. The genes start at the CSP's own order and patterns, so
  the search begins from exactly what the CSP decided and only moves a subject
  to the other pair when a soft constraint pays for it. Crossover/mutation are
  both validity-preserving (order stays a permutation, patterns only ever take
  a value the subject actually has candidates for), so there's no repair step.
- **The GA is a second stage that can never lose to the CSP**: the CSP's
  solution is the incumbent — `best` starts as it, `best` is copied into the
  front of every generation, and ties keep the incumbent. A candidate whose
  greedy decode fails is discarded rather than repaired. So the action's output
  is always valid (Invariant 5) and never worse than what the CSP produced on
  its own, even in the pathological case where no candidate beats the seed.
  `runGA` also *rejects* an invalid seed (`validateSolution`) instead of
  optimizing garbage, and the action re-validates the GA's output before
  persisting it.
- **The score is returned, not stored**: `optimization` is a transient part of
  the action's success result and lives in `useSchedule` state only, cleared at
  the start of every generate. Writing it to the `schedules` rows (or a
  separate history table) would imply the score is a property of a schedule;
  it's a property of a schedule *plus a weight configuration*, and the weights
  can change at any time. This also means the UI can never show a stale score.
- **Settings live in one singleton `scheduleSettings` row, not per schedule
  row** (spec 10): they're a property of the Dean, not of a timetable, and the
  generate action reads them at generation time. Groups are flattened into
  columns on the row, consistent with the rest of the schema, and a missing
  row resolves to the all-zero defaults rather than blocking a generate — a
  broken/failed settings read degrades to a plain CSP schedule (no score)
  instead of failing the whole thing.
- **`GaOptions.random` is injectable**: it defaults to `Math.random`, but the
  smoke test passes a seeded xorshift32 so GA assertions ("the gap penalty
  drops 6 → 0", "all weights off returns the CSP schedule exactly") are
  deterministic instead of flaky. A stochastic optimizer that can't be
  reproduced is a test liability, and the plumbing is six extra parameters.
- **The optimization settings UI is a shadcn `Dialog` of `Switch` + `Slider`
  rows**, opened by an "Optimization" button beside Generate: the weights only
  matter at generate time, so a modal that owns the whole configuration and
  saves explicitly beats either an always-visible panel (crowds the schedule
  page) or a popover (too cramped for three sliders + descriptions). The
  `Switch` is the single source of truth for "on": the slider is only revealed
  while it's on, and a weight of 0 with the switch on still means "off" to the
  engine (see the decision above), which is stated in the dialog's copy.
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
- The identity that used to live in the root `AppHeader` now lives in the
  sidebar header: `components/shared/AppSidebarHeader.tsx` renders the shadcn
  `SidebarHeader` block — school logo (`public/ndkc-logo.png`) plus the
  "NDKC EduSched" title and a "Class scheduling" subtitle — and hides the text
  under `group-data-[collapsible=icon]` so a collapsed rail shows the logo
  alone. `components/shared/AppTopBar.tsx` is the shadcn block's inset header
  (`SidebarTrigger` + Clerk `UserButton`) shared by `app/dean/layout.tsx` and
  `app/teacher/layout.tsx`, which used to duplicate that markup. The Clerk
  `UserButton` + `useUserSync()` pair is isolated in
  `components/shared/AppUserMenu.tsx` so `/no-role` can render it too (a
  signed-in user with no role otherwise has no way to sign out). The white
  `AppHeader`, the `--app-header-height` variable, and the sidebar's
  `top: var(--app-header-height)` offset are all gone — the sidebar is now
  full-height from the top of the viewport, which is what shadcn's `Sidebar`
  does by default. Verified with `tsc`, `lint` (0 errors) and `build`.
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
- Spec: `context/spec/10-wired-ga-algorithm.md` (wire the GA into schedule
  generation with Dean-configurable soft constraints) — the same surprise
  shape as specs 08/09, twice over: the spec's assumed `runGA` API
  (`runGA(schedule, subjects, rooms, blockedSlots, weights)` with a readable
  `.fitness`) **did not exist** — the real signature took no weights and
  returned no fitness — so the weights/fitness surface was added rather than
  worked around; and the pair-atom chromosome had to gain a pattern gene or
  two of the three constraints would have been structurally unfixable. It
  also carried its own "Scope Update (do this first)" section, which is why
  the overview change was logged before any code was written.
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
- Unit: Schedule Optimization — the GA wired into `generate` (spec 10) — see
  Completed. Schema + functions pushed to `dev:astute-akita-425` with
  `npx convex dev --once`; confirmed the new table with `npx convex data
  scheduleSettings` (empty until a Dean first saves — `get` returns the
  defaults). Two things worth remembering for later units:
  - **The vendored Base UI `Slider` types `onValueChange` as
    `number | readonly number[]`** even though a single-thumb slider always
    reports a number, so the handler in `SoftConstraintSettings` narrows it.
    Same for `Switch`: passing `id` is what wires a `<Label htmlFor>` to the
    primitive's hidden input.
  - **The seeded xorshift32 in the smoke test makes the GA assertions
    deterministic.** Without it, "day spread drops 2 → 0" style assertions
    would be luck-dependent — remember to re-run the smoke test a few times
    after any change to the population/iteration defaults or the mutation
    rates before trusting a green run.
- Spec: `context/spec/11-teacher-sched-view.md` (Teacher "My Schedule" — the
  real read-only view replacing the placeholder) — the fourth spec in a row
  with the same shape of surprise (08's calendar, 09's drag-and-drop, 10's
  `runGA` API, now 11's fonts + "existing" card-table convention), and the
  shape is now predictable enough to state: **check the spec's assumptions
  about existing code against the repo first.** What it got right: the
  `schedules.by_teacherId` index existed and unused, waiting for this page.
  What it got wrong: Roboto/Montserrat (app is Geist), an "existing
  convention" of card-collapsed tables (no table had one), and a `data` hook
  field (repo uses semantic names). Its "join in the hook if not
  denormalized" clause was moot — spec 08 had already denormalized
  course/year/room onto every row. Its "sort rows by day then start time"
  was also wrong for this view: `dayPattern` is an engine output, so the
  week's real shape is Mon/Wed vs Tue/Thu, and the user asked for the days
  grouped rather than split — corrected mid-unit (see Open Questions).
- Unit: Teacher "My Schedule" page (spec 11) — see Completed. Functions
  pushed to `dev:astute-akita-425` with `npx convex dev --once`; no schema
  change, so no migration window.
  - **`npx convex run --identity '<json>'` exists in this CLI** and is the
    cheapest way to verify a role/ownership-gated query without a browser
    session: `--identity
    '{"subject":"user_…","metadata":{"role":"teacher"}}'` makes the function
    see that identity. It proved `schedule.listMine` returns 8 rows for the
    real teacher id, `[]` for a different teacher id, `[]` for a Dean, and
    `{ ok: true, data: [] }` anonymous. Worth remembering for
    `availability.getMine` and any future teacher-scoped query.
  - **PowerShell 5.1**: the identity JSON needs its inner double quotes
    backslash-escaped (`'{\"subject\":\"user_…\"}'`), the same stripping
    caveat as `--inline-query` above.
- PowerShell 5.1 caveat: to pass double quotes through `npx convex run
  --inline-query`, write the inner strings with doubled single quotes
  (`query(''rooms'')`), since PS otherwise strips `"` from native args.
  Note: the `--inline-query` sandbox forms touched this session
  (`(q) => q.query(...)`, `query(...).collect()`, `(ctx) => ctx.db...`)
  failed server-side in this Convex version, so migrations and data checks
  were verified via their `{ cleaned }` / `{ backfilled }` results +
  `convex data` instead.
- Spec: `context/spec/12-design-schedule-dean.md` (schedule as a grid for Dean
  and Teacher) — same shape of surprise as 08:11, and the prediction held
  again: **its assumptions about existing code were wrong in ways that would
  have produced broken code if trusted.** It described replacing "the current
  table/list" for a Dean view that `ScheduleTable` and a Teacher view that
  `MyScheduleTable` indeed provided, so that part was right. It specified
  column labels `MW — Mon & Wed`, which is what the 2-column availability grid
  already does — right again. Wrong: it asked for `--teacher-palette` *per
  teacher* with values in the component, where Tailwind v4 would never emit
  them (see the decision above — they became eight `@theme inline` tokens plus
  static class strings); and it wanted a `ScheduleRow[]` model with `classes[]
  ` and a class-count-per-row, which is a table's shape — the grid needs span
  + lane + column instead, because a card covers rows rather than belonging to
  one. A row-with-classes model cannot express a 3-hour class without either
  duplicating it into three rows or special-casing the span.
- Unit: schedule grid (spec 12) — see Completed. No Convex change at all: the
  generated `schedules` rows already carry subject, teacher, room, and the
  chosen `dayPattern` (spec 08), so the grid is pure client-side derivation.
- **The grid smoke test paid for itself on its first run.** It was written as
  a throwaway script, and immediately earned promotion to
  `scripts/schedule-grid-smoke-test.ts` because of what it caught:
  - **Lanes were assigned across the whole grid instead of per column.** An
    MW class at 7:30 pushed an unrelated TTh class at 7:30 into a second lane,
    narrowing both cards for no reason. The unit tests all passed because
    every fixture so far put classes in a single column. What exposed it was
    making the dev-week mirror realistic — which meant noticing that the real
    dev data has one teacher owning all four labs, so two labs *cannot* share
    a time (the CSP forbids the double-book). Every previous fixture had
    quietly assumed a case the data can't produce, and the mirror was the
    first one with both columns populated. Lesson: **a fixture built from the
    real seed data is worth more than N synthetic ones** — it is the only one
    that can be wrong about the domain.
  - **Non-slot-aligned times were rounded into the wrong row** (`Math.round`
    put 1:00 PM in the 1:30 PM slot). Now dropped instead, so a malformed row
    is invisible rather than confidently mislabelled.
  - My first two "failures" were **wrong test expectations, not bugs** — I
    asserted 3 lanes for a case where one class ended exactly as another began
    (correctly reusing the freed lane), and I built a dev mirror with the same
    teacher double-booked. Worth remembering that a failing test is a claim
    about the spec of the thing, and the first move is to work out which side
    is wrong.
- Unit: thesis architecture alignment (`gaGenerate` + `repair` + demo script) —
  see Completed. `npx tsx scripts/thesis-architecture-demo.ts`, 29 assertions,
  ~4s, no test framework (same plain-tsx style as the other two scripts; there
  is still no `npm test`). Two things the demo caught that review would not
  have:
  - **The repair was not local at all.** The availability trigger seeded the
    affected set with *every* class the teacher teaches, and a class only ever
    got added, never dropped — so blocking one afternoon moved all 8 of 8
    classes. The fix is a filter, not a limit: a seed joins the affected set
    only if `collectHardViolations` can actually see it broken, which drops the
    unaffected ones to 0 and also makes a benign edit a zero-class repair. The
    lesson generalizes: **a closure that only grows needs a membership test on
    entry**, and "the trigger is about this teacher" is not the same claim as
    "these classes are broken".
  - **The five-subject pressure fixture is too loose to show a blank slate.**
    189 of 200 unsearched random assignments were already conflict-free, so the
    run proved nothing about the GA starting from nothing. The demo now adds
    three classes of its own for the same teacher (12 teaching hours over 4
    days); that took it to 54/200 valid and made the point land. Same lesson as
    the grid's dev-week mirror, one level up: **if every random input already
    satisfies the property you are trying to demonstrate, the demonstration is
    not measuring anything** — size the fixture until the naive answer is
    usually wrong.
- Tooling: `npx convex codegen` (run implicitly by `tsc`/`next build`) rewrites
  `convex/_generated/api.d.ts` to register **any** new file under `convex/` as
  an API module, whether or not it exports a Convex function. So
  `gaGenerate.ts` / `repair.ts` showing up in that diff is expected and is not
  a sign they were wired into the backend.
