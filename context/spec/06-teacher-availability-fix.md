Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Update: Availability Input by Day-Pair (MW / TTh), Not Individual Days

### Problem

Teachers currently set availability separately for each individual day (Mon, Tue, Wed, Thu, etc.). Since every subject must run at the **same time on both days of its pattern** (MW or TTh), a teacher can end up with mismatched availability — e.g. free Mon 8–11 but only free Wed 2–4 — which makes scheduling that teacher for any MW subject impossible, even though the mismatch was accidental and avoidable at input time.

### Fix

Change the Availability feature so a teacher sets their blocked/free time **once per day-pair**, not once per individual day. Whatever they mark for "MW" automatically applies to both Monday and Wednesday. Whatever they mark for "TTh" automatically applies to both Tuesday and Thursday. This makes a mismatch structurally impossible instead of something the CSP has to detect after the fact.

### Data Model Changes

- Update the Availability schema/type: instead of storing blocked slots per individual `day`, store them per `dayPattern: "MW" | "TTh"` (reuse the `DAY_PATTERNS` constant from the earlier MW/TTh scheduling update).
- Update `convex/schema.ts` and `convex/availability.ts` accordingly — a blocked slot record becomes `{ teacherId, dayPattern, startMinutes, endMinutes }` instead of `{ teacherId, day, startMinutes, endMinutes }`.
- Update `convex/scheduling/csp.ts`'s availability lookup: when checking if a teacher is free for a session on a given day, resolve that day to its pattern (Mon/Wed → "MW", Tue/Thu → "TTh") and check the pattern-level blocked slots — both days of the pair will now always agree by construction, so the earlier mismatch diagnostic becomes unreachable for this reason (keep the diagnostic for other causes, like room availability, but the "no shared teacher window" cause should no longer occur due to availability alone).

### UI Changes (`components/availability/AvailabilityGrid.tsx`)

- Change the grid from 5–6 individual day columns to **2 columns: "MW" and "TTh"**.
- Toggling a time block under "MW" applies to both Monday and Wednesday; toggling under "TTh" applies to both Tuesday and Thursday.
- Update the grid's labels/header to make it clear this time applies to both days of the pair (e.g. column header "Mon & Wed" / "Tue & Thu"), so the teacher isn't confused about why there are only two columns instead of five.
- Update `AvailabilityGridSkeleton.tsx` to match the new 2-column layout.
- Keep the existing mobile-first, borderless, Skeleton-for-loading/empty/error conventions from `code-standards.md` and `ui-context.md`.

### Migration Note

- If any existing seed/mock availability data was entered per individual day, update it to the new per-pattern shape so existing test data doesn't break. If Mon and Wed data disagree in the old seed data, reconcile it manually (pick the intersection, or flag it in `progress-tracker.md` for a decision) rather than guessing which one is "correct."

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm a teacher can only set availability per day-pair (MW / TTh), not per individual day, and that this is reflected correctly in Convex.
- Confirm the CSP no longer produces a "no shared teacher window" infeasibility caused purely by mismatched Mon/Wed or Tue/Thu availability — since it is now structurally impossible for that mismatch to occur.
- Re-run the earlier SE 101 / OS 101 test case (or an equivalent) to confirm the specific problem described no longer happens for availability reasons — if it still fails, it should now only be due to room availability, which the diagnostic must correctly identify as a separate cause.
- Update `progress-tracker.md` with what was completed and any open questions (e.g. whether any subject ever legitimately needs different times on its two days — if so, this change would need to be revisited).
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.