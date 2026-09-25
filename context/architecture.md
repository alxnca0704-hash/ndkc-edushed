# Architecture Context

## Stack

| Layer      | Technology                          | Role                                                                 |
| ---------- | ------------------------------------- | --------------------------------------------------------------------- |
| Framework  | Next.js (App Router) + TypeScript     | Renders pages, routes requests, hosts the UI                          |
| UI         | shadcn/ui + Tailwind CSS              | shadcn/ui for components (Table, Form, Dialog, Select, etc.), Tailwind for layout, spacing, and responsiveness |
| Auth       | Clerk                                 | Handles sign-in and identity for Dean and Teacher accounts (manually seeded, no public sign-up) |
| Database   | Convex                                | Stores and syncs Rooms, Courses, Subjects, Availability, and generated Schedules in real time |
| Scheduling | Convex action (`convex/schedule.ts`) + pure TS engine in `convex/scheduling/` | The `generate` action reads Rooms, Subjects, and Availability, runs the CSP (`csp.ts`), and writes the result back to Convex. The GA (`ga.ts`) is implemented but not yet wired into the live flow (soft constraints are out of scope). Each subject meets twice a week as a **linked pair** (same time + room on both pattern days). The CSP now also chooses the pattern itself — MW by default, TTh fallback — and records the winner on each generated `schedules` row (`dayPattern`: `MW` = Mon & Wed, `TTh` = Tue & Thu). |

## System Boundaries

- `app/` — Route-level pages only (Dean and Teacher pages). Each page file is thin: calls its matching hook, passes data/handlers into components. No fetch calls or business logic here.
- `hooks/` — All functionality: Convex queries/mutations, Clerk user/session access, derived state, and event handlers. One hook per page (e.g. `useRooms.ts`, `useSubjects.ts`, `useAvailability.ts`, `useSchedule.ts`).
- `components/` — Reusable, client-side UI only, built from shadcn/ui primitives (`<Table>`, `<Dialog>`, `<Form>`, `<Select>`, `<Card>`) styled with Tailwind. Receives data and handlers as props from hooks; contains no data-fetching logic.
- `components/ui/` — shadcn/ui generated primitives (owned/copied into the repo by the shadcn CLI, not hand-written) — treated as the base layer, not edited casually.
- `convex/` — Owns all backend logic: schema definitions, queries, mutations, and (if used) the scheduling action. This is the only place that talks to the database directly.
- `types/` — Shared TypeScript types/interfaces (`Room`, `Subject`, `Teacher`, `ScheduleSession`, etc.), independent of Convex's generated types where app-level shaping is needed.
- `constants/` — Fixed values: `roles.ts` (Dean/Teacher), `routes.ts` (`APP_ROUTES` for frontend paths, `API_ROUTES` if any REST endpoints exist outside Convex), `dayPatterns.ts` (the `"MW" | "TTh"` vocabulary + day indexes; staged with no imports so the Convex-side scheduler can consume it), `courses.ts` (year-level vocabulary + the default course seeds; imports its types relatively so `convex/` can consume it).
- `lib/` — Shared utilities, including shadcn's `cn()` class-merge helper and any form-validation schemas (e.g. `zod` schemas used with shadcn's `<Form>`).
- `middleware.ts` — Clerk middleware for route protection and role-based redirects.

## Storage Model

- **Convex (database)**: All application data — Rooms, Courses, Subjects, Teacher Availability, and generated Schedule records. A Course is a top-level Dean-managed entity (`name` + `code`); a Subject belongs to exactly one Course (`subjects.courseId`) and one year level (`subjects.year`, 1–4) — both are descriptive/organizational fields and are NOT read by the scheduler. Each record that belongs to a Teacher is linked via their Clerk `userId`. This is the single source of truth; the UI subscribes to Convex queries for live updates instead of manual refetching. Generated schedules are stored as one `schedules` row per placed session (denormalized subject/teacher/room names at generation time, indexed by teacher id for the teacher view); regenerating replaces all rows atomically. Each `schedules` row carries the algorithm-chosen `dayPattern` (`"MW" | "TTh"`) — the two days that session's linked pair lands on; the pattern vocabulary/indexes live in `constants/dayPatterns.ts`. Subjects do NOT carry a `dayPattern`; pattern choice is an algorithm output, not a Dean input.
- **Clerk (identity store)**: User identity only — email, name, password, and role metadata (`dean` or `teacher`). Clerk does not store scheduling data; it is referenced by `userId` from Convex records.
- **No separate blob/file storage** at this stage — no file uploads or generated documents are part of the MVP scope.

## Auth and Access Model

- Every user signs in via Clerk using an account seeded manually ahead of time — there is no public sign-up page.
- Role (`dean` or `teacher`) is stored in Clerk's user metadata and read on login to route the user to the correct dashboard (`/dean/*` or `/teacher/*`).
- Convex functions receive the Clerk identity via the Convex–Clerk auth integration; mutations verify the caller's role/identity before writing data (e.g. a Teacher can only write to their own availability record, identified by their Clerk `userId`).
- A Dean has access to all Rooms, Courses, and Subjects (no per-department scoping in this prototype — single school/tenant assumed).
- A Teacher can only read their own filtered schedule and can only mutate their own availability — never another teacher's data, and never Rooms/Subjects directly.

## Invariants

1. Route handlers and hooks never contain direct Convex queries written inline in components — all data access happens through `hooks/`, which call Convex `useQuery`/`useMutation`.
2. No raw string paths anywhere in the codebase — every internal route comes from `APP_ROUTES` in `constants/routes.ts`.
3. A Teacher's Availability and Schedule records are always looked up by their Clerk `userId`, never by name or email, to avoid ambiguity if two teachers share a name.
4. The scheduling algorithm never runs as a blocking call inside a page render — it is triggered explicitly (button action) and its result is written to Convex, which the UI then reads reactively.
5. Hard constraints (no double-booked teacher/room) are enforced in the scheduling logic itself, not in the UI — the UI only reflects the result and does not attempt to validate scheduling conflicts client-side.
6. Every page handles `isLoading` and `error` states from its hook before rendering real content, using shadcn's `<Skeleton>` for loading and an inline error state (e.g. shadcn `<Alert variant="destructive">`) for failures — no page assumes Convex data has already loaded.
7. `components/ui/` (shadcn primitives) is treated as generated/vendored code — feature-specific styling and logic live in `components/`, not by editing the primitives directly.