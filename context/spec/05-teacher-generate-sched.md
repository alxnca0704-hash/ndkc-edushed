Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Feature 5: Generate Schedule (CSP + GA Scheduling Engine)

### Two Algorithms

1. **CSP (Constraint Satisfaction)** — produces one valid, conflict-free schedule from Rooms, Subjects, and Teacher Availability, enforcing hard constraints only. This is the primary algorithm for this feature and must always run.
2. **GA (Genetic Algorithm)** — optional optimization layer that takes the CSP's valid schedule and improves it against soft constraints. Build the function so it exists and works, but do not wire it into the main "Generate Schedule" flow yet — soft constraints are out of scope for this prototype (per `project-overview.md`). Leave a clear call site commented for future use.

Implement both as pure TypeScript functions with no Convex-specific code, in:
- `convex/scheduling/csp.ts`
- `convex/scheduling/ga.ts`
- `convex/scheduling/types.ts` (shared types)

Wire only the CSP result into the live app via a Convex `action` in `convex/schedule.ts`, which reads Rooms/Subjects/Availability, runs `runCSP`, and saves the result (or returns an infeasible error).

### Hard Constraints (enforced by CSP — must never be violated)

- A teacher cannot be assigned to two subjects at the same day/time
- A room cannot be assigned to two subjects at the same day/time
- A subject can only be placed in a room whose type matches what it requires (e.g. a Lab subject must be in a Lab room)
- A subject cannot be scheduled during a time slot the assigned teacher has marked as unavailable
- Every subject must be scheduled exactly `meetingsPerWeek` times, each session lasting `durationMinutes`

**Explicitly not a hard constraint in this prototype:** minimizing building-hopping (back-to-back classes in different buildings/rooms for the same teacher), balancing workload, spreading sessions across different days, and minimizing gaps. These are soft constraints, belong to the GA's fitness function only, and must not be enforced or filtered against inside the CSP — the CSP's job is validity, not quality. Since Rooms in this prototype don't track building/floor, building-hopping isn't measurable yet regardless.

### Scheduling Flow (based on teacher availability, room type, and duration)

1. Each Subject is expanded into individual session-units based on its `meetingsPerWeek` (e.g. "3x/week" → 3 sessions to place).
2. For each session, build the list of valid (Day, Time, Room) options:
   - Only rooms matching the subject's required `roomType` are considered.
   - Only time slots that fit the subject's `durationMinutes` within working hours are considered.
   - Any time slot the assigned teacher has marked unavailable is excluded entirely.
3. The CSP backtracking search places each session one at a time, checking that the chosen slot doesn't conflict with an already-placed session (same teacher or same room, overlapping time). If a session has no valid options left, the algorithm backtracks and retries an earlier session with a different slot.
4. If every session is placed successfully, the result is a complete, conflict-free timetable, saved to Convex. If no valid combination exists, the Dean sees a clear "could not generate a schedule with current rooms/availability" message instead of a partial or broken result.
5. The Dean triggers this entire flow with a single "Generate Schedule" action; the Teacher never triggers generation, only supplies their availability beforehand.

### UI: Generate Schedule Page (Dean)

- Build `/dean/schedule` following the existing Dean page pattern: thin `page.tsx`, logic in `hooks/useSchedule.ts` (calls the Convex action via `useAction`), UI in `components/schedule/`.
- "Generate Schedule" button triggers the CSP action; show a loading state while it runs.
- On success, display the result in a table (`components/schedule/ScheduleTable.tsx`): Subject, Teacher, Room, Day, Time.
- On infeasible result, show the shared `ErrorState` component with the reason returned by the algorithm (not a generic error).
- Include a matching `ScheduleTableSkeleton.tsx` for the loading state and use the shared `EmptyState` component if no schedule has been generated yet.

### New shadcn/ui Components

Check `components/ui/` for what's already installed before adding anything. Likely candidates for this feature:

- `button` — the "Generate Schedule" trigger
- `table` — displaying the generated schedule
- `skeleton` — loading state while the algorithm runs
- `alert` — for the infeasible/error result
- `badge` — for tagging Room type (Lecture/Lab) inline in the schedule table
- `sonner` (toast) — success confirmation once a schedule is generated

Confirm which are already present before installing duplicates.

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm this unit works end to end: with seeded Rooms, Subjects, and Teacher Availability, clicking "Generate Schedule" produces a valid timetable with zero hard-constraint violations, and an infeasible case shows a clear error instead of breaking the UI.
- Confirm the resulting schedule never violates any hard constraint listed above, and confirm the GA function exists and runs correctly in isolation (e.g. via a quick standalone test) without being called from the live "Generate Schedule" flow.
- Update `progress-tracker.md` with what was completed and any open questions (e.g. exact working-hour bounds, slot increment size, if not already locked in `project-overview.md`/`architecture.md`).
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.