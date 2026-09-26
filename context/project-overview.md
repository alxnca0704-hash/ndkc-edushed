# Dean–Teacher Room & Subject Scheduler

## Overview

This is a prototype scheduling application that helps a school Dean generate a conflict-free class timetable automatically instead of building it by hand. The Dean enters the rooms available and the subjects that need to be scheduled (including how long and how often each meets, and who teaches it), while Teachers log in and set the times they are unavailable. Authentication is handled by Clerk, with Dean and Teacher accounts seeded manually ahead of time rather than through a public sign-up flow. Data (Rooms, Subjects, Availability, Schedules) is stored and synced in real time using Convex. A scheduling algorithm (Constraint Satisfaction) then assigns each subject a day, time, and room with no double-booked teachers or rooms, and — when the Dean has switched on any soft constraint — a Genetic Algorithm pass then polishes that schedule against those preferences, never breaking a hard rule.

## Goals

1. Let a Dean fully manage Room and Subject data through a working CRUD interface backed by Convex
2. Let a Teacher log in, set availability, and view their own generated schedule
3. Prove the core UX flow — login → data entry → availability input → generate schedule → view result — using seeded Clerk accounts and real persisted data in Convex
4. Keep the architecture simple enough to plug in a real CSP/GA scheduling engine later without redesigning the UI or data model

## Core User Flow

1. Dean or Teacher logs in with a Clerk account that was seeded ahead of time (no self-registration)
2. User is routed to their dashboard based on their role (Dean or Teacher), set via Clerk metadata
3. **Dean:** adds Rooms (name, type) — saved to Convex
4. **Dean:** adds Subjects (name, duration, assigned course + year level, assigned teacher + room — pulled from seeded Clerk teacher accounts, the courses table, and the rooms table) — saved to Convex
5. **Teacher:** logs in and marks unavailable days/times — saved to Convex, linked to their Clerk user ID
6. **Dean:** clicks "Generate Schedule"
7. System reads Rooms, Subjects, and Availability from Convex, runs the scheduling logic, optimizes the result against the Dean's soft-constraint preferences if any are enabled, and writes the resulting schedule back to Convex
8. **Dean:** views the generated schedule in a table, loaded live from
   Convex, switching between one course + year level at a time
9. **Teacher:** views only their own assigned classes in a filtered, read-only schedule, loaded live from Convex

## Features

### Authentication (Clerk, seeded accounts)

- Dean and Teacher accounts are created manually in Clerk ahead of time — no public sign-up page
- Role (Dean/Teacher) is stored in Clerk user metadata and used to route each user to the correct dashboard
- Clerk user ID is used as the link between a logged-in Teacher and their Convex records (availability, assigned schedule)

### Data Layer (Convex)

- Rooms, Courses, Subjects, Availability, and generated Schedule are stored as Convex tables
- Convex queries/mutations power all CRUD operations and keep the UI in sync in real time
- Seeded teacher accounts (from Clerk) automatically populate the Dean's "Assigned Teacher" dropdown when creating Subjects

### Room Management (Dean)

- Add, view, edit, and delete rooms
- Each room has a name and type (Lecture/Lab)

### Course Management (Dean)

- Add, view, edit, and delete courses
- Each course has a name and a short code (e.g. "BS Computer Science" / `BSCS`); the code is unique
- Seeded on setup with BSCS and BSIT

### Subject Management (Dean)

- Add, view, edit, and delete subjects
- Each subject has a name, session duration, an assigned course, a year
  level (1st–4th Year), an assigned room, and one assigned teacher
- Course and year level are organizational descriptors only — they do not
  constrain the generated schedule
- Dean does not set the day/time/room of each session directly — that is
  decided by the scheduling algorithm (it also picks the MW or TTh pattern,
  applied identically on both days of the pair)

### Schedule Generation (Dean)

- One-click action to generate a full timetable from current Rooms, Subjects, and Teacher availability
- Displays the resulting schedule in a read-only table view, broken out by
  course and year level — the Dean picks one Course + Year (e.g. "BSCS –
  1st Year") and sees only that group's classes; generation itself is a
  single pass over every subject, so conflicts are still checked across all
  courses

### Schedule Optimization (Dean)

- After a conflict-free schedule is produced, the scheduler runs a Genetic
  Algorithm pass to improve it against **soft constraints** — preferences that
  never break a hard rule, only make the timetable nicer
- Three soft constraints, each independently switched on or off and weighted
  0–10 by the Dean:
  - **Balance Workload** — discourages stacking more than two classes on one
    teacher's day
  - **Spread Sessions Across Days** — spreads a teacher's classes over more of
    the Mon–Thu week instead of cramming them into fewer days
  - **Minimize Gaps** — discourages long idle stretches inside a teacher's day
- Settings live in Convex as a single record, so the Dean's chosen weights are
  remembered across sessions
- With no soft constraint switched on, the GA is skipped entirely and the
  plain conflict-free schedule is saved as-is
- When the GA runs, the generated schedule shows an optimization score (lower
  is better); the score is omitted entirely when the GA was skipped
- The GA only ever outputs a schedule that passes every hard constraint — soft
  preferences can never introduce a conflict

### Availability (Teacher)

- Weekly grid where a logged-in teacher marks blocked (unavailable) time slots
- Saved to Convex, linked to their Clerk user ID

### My Schedule (Teacher)

- Read-only view showing only the subjects/sessions assigned to the logged-in teacher
- Grouped by the day pattern the algorithm chose (MW — Mon & Wed, then TTh —
  Tue & Thu); a subject's two linked sessions read as one class, not two
- Displays subject, course + year level, time, and room
- No editing: a teacher cannot move, request, or regenerate a class

## Scope

### In Scope

- Clerk authentication with manually seeded Dean and Teacher accounts
- Role-based routing (Dean vs Teacher dashboard)
- Convex-backed data storage for Rooms, Courses, Subjects, Availability, and Schedules
- Dean-side Room CRUD
- Dean-side Course CRUD
- Dean-side Subject CRUD (with course/year assignment, teacher assignment from seeded accounts)
- Teacher-side availability input
- Teacher-side personal schedule view
- Generate Schedule action and schedule views for both roles
- Schedule optimization: a GA pass over the generated schedule, driven by
  Dean-configurable soft-constraint weights (Balance Workload / Spread
  Sessions Across Days / Minimize Gaps), skipped when no soft constraint is
  enabled
- Ant Design–based UI and layout

### Out of Scope

- Public sign-up / self-registration
- Admin role and in-app account creation
- Full-strength CSP/GA optimization (can start with a simpler valid-schedule algorithm, running either in a Convex action or an external Python service, and upgrade later)
- Manual drag-and-drop schedule editing
- Publishing, versioning, notifications, and analytics
- Teacher change requests and conflict flagging
- Re-running the optimizer on every manual schedule adjustment (there is no
  manual adjustment yet — see Out of Scope above)

## Success Criteria

1. A seeded Dean and Teacher account can each log in via Clerk and land on the correct dashboard
2. A Dean can add, edit, and delete a Room in Convex, and changes persist and sync live
3. A Dean can add, edit, and delete a Subject, including selecting a course, a year level, and a teacher from seeded accounts
4. A logged-in Teacher can mark unavailable time slots and see those saved to their account in Convex
5. Clicking "Generate Schedule" produces a viewable timetable with no UI errors
6. A Teacher viewing their schedule sees only their own assigned classes, correctly filtered