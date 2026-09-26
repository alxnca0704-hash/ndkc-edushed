Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Scope Update (do this first)

This feature brings soft constraints into scope, previously deferred in `project-overview.md`. Before writing code:
- Move "Teacher preferences (soft constraints)" from Out of Scope to In Scope in `project-overview.md`, described accurately per the feature below.
- Add a "Schedule Optimization (Dean)" section under Features.
- Log this scope change with today's date in `progress-tracker.md`, referencing the earlier note that `ga.ts` was already built and standalone-tested with pair-atom chromosomes, ready for this exact wiring.

## Feature: Wire GA into Schedule Generation (Soft Constraints)

### Goal

`convex/scheduling/ga.ts` (`runGA`) already exists and is tested in isolation but is not called anywhere in the live app. Wire it into the real "Generate Schedule" flow so the Dean can configure soft-constraint weights and get an optimized schedule, not just a valid one.

### 1. Soft Constraint Configuration (Dean)

- Add a settings section to `/dean/schedule` (or a small `Dialog`/`Sheet` triggered from that page — pick whichever fits the existing layout better, and note the choice in `progress-tracker.md`) where the Dean can:
  - Toggle each soft constraint on/off: **Balance Workload**, **Spread Sessions Across Days**, **Minimize Gaps**
  - Set a weight per active constraint (0–10), matching the `SoftConstraintWeights` shape already defined in `ga.ts`
- Use shadcn's `Switch` for the on/off toggle and `Slider` for the weight, per constraint row.
- Persist these settings in Convex (new `scheduleSettings` table or similar — one row, since this is a single-tenant prototype) so they're remembered across sessions, not just local component state.
- Build `hooks/useScheduleSettings.ts` for reading/writing this config, and `components/schedule/SoftConstraintSettings.tsx` for the UI, following the existing hook/component split.

### 2. Wire `runGA` into the Generate Action

- Update `convex/schedule.ts`'s `generate` action:
  1. Run `runCSP` as it does today — this step is unchanged and always runs regardless of soft constraint settings.
  2. If `runCSP` fails (infeasible), return the existing infeasibility diagnostics immediately — do not attempt GA on a failed CSP result.
  3. If `runCSP` succeeds, fetch the Dean's current `SoftConstraintWeights` (only including constraints toggled on — toggled-off constraints should pass a weight of `0` or be omitted, whichever `ga.ts` already expects; check `ga.ts`'s existing signature rather than guessing).
  4. Call `runGA(cspResult.schedule, subjects, rooms, blockedSlots, weights)`.
  5. Save `gaResult.schedule` (not the raw CSP result) as the final schedule, and store `gaResult.fitness` alongside it so the UI can display an optimization score.
- If **no soft constraints are toggled on at all**, skip calling `runGA` entirely and save the raw CSP result directly — running GA with all-zero weights wastes computation for no benefit.

### 3. UI: Show Optimization Result

- On `/dean/schedule`, after a successful generation, show the resulting fitness score in a small, unobtrusive way (e.g. a `Badge` or subtle line near the "Generate Schedule" button: "Optimization score: 12 (lower is better)" — confirm the actual direction/meaning of the fitness number against `ga.ts` before wording this, since `ga.ts` treats lower fitness as better).
- If GA was skipped (no soft constraints enabled), don't show a fitness score at all — showing "0" or a placeholder would be misleading.

### 4. Data Model

- Add `types/scheduleSettings.ts`: `SoftConstraintWeights` type (mirroring `ga.ts`'s existing interface) plus enabled/disabled flags per constraint.
- Add `convex/scheduleSettings.ts`: query + mutation for reading/writing this single settings record.
- Add the `scheduleSettings` table to `convex/schema.ts`.

### New shadcn/ui Components

Check `components/ui/` before adding anything. Likely needed: `switch`, `slider`, `badge` (if not already present from earlier features).

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm a Dean can toggle and weight each soft constraint, and those settings persist across page reloads.
- Confirm generating a schedule with all soft constraints off produces the same result as before this change (raw CSP output, no GA call, no fitness score shown).
- Confirm generating a schedule with soft constraints on produces a schedule that still passes every hard constraint (GA's repair step must guarantee this — verify it does), with a visible fitness score reflecting the optimization.
- Confirm this doesn't break the existing drag-and-drop/reschedule flow — a manually dragged adjustment after GA optimization should still validate against hard constraints the same way, and does not need to re-run GA.
- Update `progress-tracker.md`: scope change confirmed, settings storage decision (dialog vs. sheet), and any open questions (e.g. should dragging a card after GA optimization re-optimize the rest of the schedule, or just validate the one move? Recommend just validating the one move for now, to avoid GA re-running on every drag — confirm this explicitly rather than letting the agent decide silently).
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.