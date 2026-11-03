Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, loading/empty/error state rules, and UI tokens defined there — do not invent conventions.

## Task: Teacher Availability Feature

Build the Teacher Availability page, following the same structure as the Dean-side pages already built.

### 1. Availability Selection UI

- Build a weekly availability grid where the logged-in teacher marks which time slots they are **unavailable** (blocked).
- Days: Mon–Sat. Time blocks: reasonable fixed intervals (e.g. 7:00 AM–5:00 PM in 1–1.5 hr blocks) — confirm exact blocks against `project-overview.md` / `architecture.md` if not already defined there; if genuinely undefined, add it as an open question in `progress-tracker.md` rather than guessing.
- Clicking/tapping a cell toggles it between available and unavailable.
- Data is saved to Convex, linked to the teacher's Clerk `userId` (per `architecture.md`).
- Follow the hook/component split: `hooks/useAvailability.ts` handles Convex queries/mutations; `components/availability/AvailabilityGrid.tsx` renders the UI only.
- Include a matching `AvailabilityGridSkeleton.tsx` for the loading state, and use the shared `EmptyState`/`ErrorState` components where applicable.
- Mobile-first: the grid should scroll horizontally on small screens rather than break layout.

### 2. Sidebar/Taskbar Navigation (Teacher side)

- Add a sidebar navigation for the Teacher role, mirroring the structure already used for Dean (`components/shared/AppSidebar.tsx` — reuse or extend the existing one rather than duplicating it, if it's already built generically).
- Nav items for Teacher: **Availability**, **My Schedule**.
- Use `APP_ROUTES` constants for all links — no raw path strings.
- Follow `ui-context.md` for layout pattern (fixed-width sidebar, no border separator, active-state styling using the dark green accent token).

### 3. New shadcn/ui Components

Before writing custom UI, check what's already installed in `components/ui/`. For anything missing, install via the shadcn CLI rather than hand-rolling it, and suggest the specific components needed for this feature — likely candidates:

- `toggle` or `toggle-group` — for individual/grouped time-slot selection in the grid
- `tooltip` — to show exact time range on hover/focus for a slot
- `button` — save/reset actions
- `skeleton` — loading state for the grid
- `sonner` (toast) — success/error feedback after saving availability
- `sidebar` — if not already added for the Dean taskbar, this is the base for the Teacher one too

Confirm which of these are already present before installing duplicates.

### 4. Linting

- Run the project's lint command and fix all errors and warnings before considering this done.
- Do not disable lint rules to force a pass — fix the underlying issue.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm this unit works end to end: a teacher can log in, mark unavailable slots, refresh, and see them persisted.
- Update `progress-tracker.md` with what was completed and any open questions raised.
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.