Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Update: Conflict Status Alert on Generated Schedule Page

### Goal

Add a shadcn `Alert` component to the `/dean/schedule` page that clearly explains *why* a subject couldn't be placed or *why* a drag-and-drop action failed — surfacing the specific cause (room occupied, teacher unavailable, etc.) instead of a generic error.

### Where this applies

This alert should appear in two places, reusing the same underlying diagnostic data (`explainInfeasibility` from `csp.ts`) rather than building two separate explanation systems:

1. **After "Generate Schedule" runs and one or more subjects couldn't be placed** — currently shown via the shared `ErrorState`. Replace or supplement this with a shadcn `Alert` (variant `destructive`) per failed subject.
2. **After a failed or auto-adjusted drag-and-drop action** on the calendar (from the earlier drag/reschedule feature) — show an `Alert` describing what happened (conflict detected, auto-resolved, or reverted).

### Alert Content Requirements

Each `Alert` must clearly state the **cause**, not just "conflict occurred." Use the existing `InfeasibilityReason`/diagnostic structure to populate:

- **Room occupied**: name the room, the conflicting subject already using it, and the overlapping time (e.g. "Room 101 is already booked for CS 201 at this time").
- **Teacher unavailable**: name the teacher and the specific unavailable window (e.g. "Prof. Cruz is unavailable Mon/Wed 2:00–4:00 PM").
- **No shared teacher window across paired days**: reuse the existing MW/TTh diagnostic message format (e.g. "Free on Mon 8:00–11:00 AM, but Wed only has 2:00–4:00 PM free").
- **Auto-adjustment occurred** (success case, not an error): use `Alert` variant `default` (not destructive) to confirm what moved and where, distinct visually from a failure.
- **Cascade limit reached / drag reverted**: `Alert` variant `destructive`, explaining which subjects were involved and that the change was reverted.

### Component Structure

- Build `components/schedule/ConflictAlert.tsx` — a single reusable component that takes a structured reason (room conflict, teacher conflict, availability mismatch, or auto-adjustment result) and renders the appropriate shadcn `Alert` with the right variant, icon, title, and description.
- Use `lucide-react` icons per `ui-context.md` (e.g. `AlertTriangle` for destructive, `CheckCircle2` for successful auto-adjustment info), sized `h-4 w-4` inline with the alert title.
- If multiple subjects fail during generation, render a list of `ConflictAlert` components (one per subject) — reuse the `Accordion`/`Collapsible` pattern from the earlier infeasibility-reason update if the list is long, so the page doesn't become a wall of alerts.

### Data Requirements

- Confirm `explainInfeasibility` (from the earlier infeasibility-detail update) already distinguishes `"no-shared-teacher-window"` vs `"no-room-available"` causes — extend it if needed so `ConflictAlert` can map each cause to the correct message and icon without re-deriving logic itself.
- For drag-and-drop, confirm `reschedule.ts` returns a structured result (success/auto-adjusted/reverted, plus the reason) that `ConflictAlert` can consume directly — do not have the UI re-derive the reason from raw scheduling data.

### UI/UX Requirements

- Follow `ui-context.md` tokens: muted, non-neon colors even for the destructive variant (use shadcn's default destructive styling, not a brighter custom red, so it stays consistent with the palette).
- Keep alerts borderless-consistent with the rest of the app where shadcn's `Alert` allows it (it has a built-in border by default — check whether to override with `ui-context.md`'s no-border-by-default rule, or treat `Alert` as one of the few components where a subtle border is acceptable since it's flagging something important; decide and note the choice in `progress-tracker.md` rather than guessing).

### New shadcn/ui Components

Check `components/ui/` before adding anything. Needed: `alert` (if not already added from the earlier infeasibility-reason update), `accordion` or `collapsible` (if not already added).

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm a room-occupied conflict shows the correct room, conflicting subject, and time.
- Confirm a teacher-availability conflict shows the correct teacher and blocked window.
- Confirm a successful auto-adjustment shows a distinct, non-destructive alert explaining what moved.
- Confirm a reverted drag (cascade limit reached) shows a destructive alert naming the subjects involved.
- Update `progress-tracker.md` with what was completed and the border-style decision for `Alert`.
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.