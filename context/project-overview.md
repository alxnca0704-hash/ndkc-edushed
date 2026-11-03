# Dean–Teacher Room & Subject Scheduler

## Overview

This is a prototype scheduling application that helps a school Dean generate a conflict-free class timetable automatically instead of building it by hand. The Dean enters the subjects that need to be scheduled (including how long and how often each meets, and who teaches it), while Teachers log in and set the times they are unavailable. Authentication is handled by Clerk, with one Admin account and Dean and Teacher accounts seeded manually ahead of time rather than through a public sign-up flow. Data (Rooms, Departments, Courses, Subjects, Availability, Schedules) is stored and synced in real time using Convex. A scheduling algorithm (CSP via backtracking) assigns each subject a day, time, and room with no double-booked teachers or rooms; a Genetic Algorithm pass then polishes that schedule against the Dean's soft-constraint preferences, never breaking a hard rule. The Admin manages Rooms, Departments, and Deans, and can compile all department schedules into a master view and resolve cross-department conflicts using the CSP repair engine.

## Goals

1. Let the Admin manage Rooms, Departments, and Deans through a working CRUD interface backed by Convex
2. Let a Dean fully manage Subject data (and read-only Rooms) and generate conflict-free timetables
3. Let a Teacher log in, set availability, and view their own generated schedule
4. Prove the core UX flow — login → data entry → availability input → generate schedule → view result — using seeded Clerk accounts and real persisted data in Convex
5. Keep the architecture simple enough to extend without redesigning the UI or data model

## Core User Flow

1. Admin, Dean, or Teacher logs in with a Clerk account that was seeded ahead of time (no self-registration)
2. User is routed to their dashboard based on their role (Admin, Dean, or Teacher), set via Clerk metadata
3. **Admin:** manages Rooms, Departments, and Deans; views the compiled multi-department schedule and resolves conflicts
4. **Dean:** adds Subjects (name, duration, assigned course + year level, assigned teacher + room — pulled from seeded Clerk teacher accounts, the courses table, and the rooms table) — saved to Convex
5. **Teacher:** logs in and marks unavailable days/times — saved to Convex, linked to their Clerk user ID
6. **Dean:** clicks "Generate Schedule"
7. System reads Rooms, Subjects, and Availability from Convex, runs the scheduling logic, optimizes the result against the Dean's soft-constraint preferences if any are enabled, and writes the resulting schedule back to Convex
8. **Dean:** views the generated schedule as a time grid, loaded live from Convex, switching between one course + year level at a time
9. **Teacher:** views only their own assigned classes in a filtered, read-only schedule, loaded live from Convex
10. **Notifications:** generating a week tells every teacher it touched, and a teacher changing their availability tells the Dean — each read from the bell in the shared top bar

## Features

### Authentication (Clerk, seeded accounts)

- Admin, Dean, and Teacher accounts are created manually in Clerk ahead of time — no public sign-up page
- Role (Admin/Dean/Teacher) is stored in Clerk user metadata and used to route each user to the correct dashboard
- Clerk user ID is used as the link between a logged-in Teacher and their Convex records (availability, assigned schedule)

### Admin — Room Management

- Add, view, edit, and delete rooms (`/admin/rooms`)
- Each room has a name and type (Lecture/Lab)
- Room mutations require Admin identity (`isAdmin()`); Dean retains read-only access for subject and schedule forms

### Admin — Department Management

- Add, view, edit, and delete departments (`/admin/departments`)
- Each department has a `name`, `code` (unique), and optional `description`
- Courses and Dean accounts can optionally be linked to a department via `departmentId`

### Admin — Dean Management

- View, create, update, and delete Dean user records in Convex (`/admin/deans`)
- Select available accounts from Clerk or database instead of typing Gmail addresses and names manually
- Sync Dean list from Clerk (`syncFromClerk`) to import Clerk accounts with role `dean`
- Assign each Dean to a department for organizational grouping

### Admin — Compiled Multi-Department Schedule

- `/admin/schedule` loads all generated department schedules in one combined view via `listCompiled`
- Department filter lets Admin view all sessions or focus on one department at a time
- Cross-department hard-constraint violations (double-booked room or teacher across departments) are surfaced as a conflict banner
- Admin triggers `compileAndResolveConflicts` to run the CSP repair engine (backtracking + MRV + LCV + forward checking) on conflicting sessions only — non-conflicting sessions come back byte-for-byte
- A "Simulate Conflict" button is available for demo/testing purposes

### Data Layer (Convex)

- Rooms, Departments, Courses, Subjects, Availability, and generated Schedules are stored as Convex tables
- Convex queries/mutations power all CRUD operations and keep the UI in sync in real time
- Seeded teacher accounts (from Clerk) automatically populate the Dean's "Assigned Teacher" dropdown when creating Subjects

### Course Management (Dean)

- Add, view, edit, and delete courses
- Each course has a name and a short code (e.g. "BS Computer Science" / `BSCS`); the code is unique
- Seeded on setup with BSCS and BSIT

### Subject Management (Dean)

- Add, view, edit, and delete subjects
- Each subject has a name, session duration, an assigned course, a year level (1st–4th Year), an assigned room, and one assigned teacher
- Course and year level are organizational descriptors and hard constraints the scheduler reads
- Dean does not set the day/time/room of each session directly — that is decided by the scheduling algorithm (it also picks the MW or TTh pattern, applied identically on both days of the pair)

### Schedule Generation (Dean)

- One-click action to generate a full timetable from current Rooms, Subjects, and Teacher availability
- Displays the resulting schedule in a read-only time grid, filtered to one Course + Year (e.g. "BSCS – 1st Year") — the Dean picks a group and sees only that group's classes; generation itself is a single pass over every subject, so conflicts are still checked across all courses
- Two columns (MW, then TTh) and one row per school-hour time block, a class spanning the rows it occupies, and a color per **subject** — chosen from a ten-slot muted palette in the Subject form, or derived from the subject name when the Dean doesn't pick — so a subject is recognizable at a glance and overlapping classes stay tellable apart

### Schedule Optimization (Dean)

- After a conflict-free schedule is produced, the scheduler runs a Genetic Algorithm pass to improve it against **soft constraints** — preferences that never break a hard rule, only make the timetable nicer
- Three soft constraints, each independently switched on or off and weighted 0–10 by the Dean:
  - **Balance Workload** — discourages stacking more than two classes on one teacher's day
  - **Spread Sessions Across Days** — spreads a teacher's classes over more of the Mon–Thu week instead of cramming them into fewer days
  - **Minimize Gaps** — discourages long idle stretches inside a teacher's day
- Settings live in Convex as a single record, so the Dean's chosen weights are remembered across sessions
- With no soft constraint switched on, the GA is skipped entirely and the plain conflict-free schedule is saved as-is
- When the GA runs, the generated schedule shows an optimization score (0–100, higher is better); the score is omitted entirely when the GA was skipped
- The GA only ever outputs a schedule that passes every hard constraint — soft preferences can never introduce a conflict

### Availability (Teacher)

- Weekly grid where a logged-in teacher marks blocked (unavailable) time slots
- Saved to Convex, linked to their Clerk user ID

### Notifications (Dean and Teacher)

- In-app only. A notification bell in the shared top bar, for both roles, with an unread count badge — no email, SMS, or push
- Two flows, one per direction between the two roles:
  - **Teacher ← Dean:** a teacher is notified when the Dean generates a new week, saying how many classes they now have and linking to their schedule
  - **Dean ← Teacher:** the Dean is notified when a teacher changes their availability, naming the teacher, how many slots they blocked, and that the schedule needs regenerating
- A notification records the message **as it was written** (title + body + timestamp + read state) rather than re-deriving it from current data, so what the reader is told is what was true when it happened
- Read state is per user, resolved from the caller's own identity — one user can never read or mark another user's notifications

### My Schedule (Teacher)

- Read-only time grid showing only the subjects/sessions assigned to the logged-in teacher
- Two columns — MW (Mon & Wed) then TTh (Tue & Thu) — with one row per school-hour time block; a subject's two linked sessions read as one class spanning those rows, not two
- Displays subject, course + year level, time, and room
- No editing: a teacher cannot move, request, or regenerate a class

## Scope

### In Scope

- Clerk authentication with a manually seeded Admin account plus seeded Dean and Teacher accounts
- Role-based routing for Admin, Dean, and Teacher dashboards
- Admin-side Room CRUD, Department CRUD, Dean CRUD, and compiled multi-department schedule view with CSP conflict resolution
- Convex-backed data storage for Rooms, Departments, Courses, Subjects, Availability, and Schedules
- Dean-side Course CRUD
- Dean-side Subject CRUD (with course/year assignment, teacher assignment from seeded accounts)
- Teacher-side availability input
- Teacher-side personal schedule view
- Generate Schedule action and schedule views for both roles
- Schedule optimization: a GA pass over the generated schedule, driven by Dean-configurable soft-constraint weights (Balance Workload / Spread Sessions Across Days / Minimize Gaps), skipped when no soft constraint is enabled
- In-app notifications between Dean and Teachers (new schedule generated → Teachers; availability changed → Dean), read from a bell in the shared top bar

### Out of Scope

- Public sign-up / self-registration
- Admin account management and in-app account creation
- Manual drag-and-drop schedule editing
- Publishing, versioning, and analytics
- Notification channels other than in-app (email, SMS, push), notification preferences, digests, and any notification history beyond the latest few shown in the bell
- Teacher change requests and conflict flagging
- Re-running the optimizer on every manual schedule adjustment (there is no manual adjustment yet — see Out of Scope above)

## Success Criteria

1. A seeded Dean and Teacher account can each log in via Clerk and land on the correct dashboard
2. An Admin can add, edit, and delete a Room in Convex, and changes persist and sync live
3. An Admin can add, edit, and delete Departments and Deans, and sync Deans from Clerk
4. Admin can view the compiled multi-department schedule and trigger CSP conflict resolution
5. A Dean can add, edit, and delete a Subject, including selecting a course, a year level, and a teacher from seeded accounts
6. A logged-in Teacher can mark unavailable time slots and see those saved to their account in Convex
7. Clicking "Generate Schedule" produces a viewable timetable with no UI errors
8. A Teacher viewing their schedule sees only their own assigned classes, correctly filtered
