Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Feature: Course Management + Course & Year Assignment on Subjects

### 1. Course CRUD (Dean)

Add a new top-level entity, **Course**, alongside the existing Room and Subject management.

- Build `/dean/courses` following the existing Dean page pattern: thin `page.tsx`, logic in `hooks/useCourses.ts`, UI in `components/courses/`.
- Course fields: `name` (e.g. "BS Computer Science"), `code` (e.g. "BSCS").
- CRUD operations: add, view, edit, delete — mirror the existing Room/Subject CRUD pattern exactly (Table + Dialog + Form, using shadcn/ui components already in `components/ui/`).
- Add `convex/courses.ts` with queries/mutations (list, create, update, remove), and a `courses` table in `convex/schema.ts`.
- Add `types/course.ts` with the `Course` interface.
- Add `components/courses/CoursesTable.tsx`, `CourseFormDialog.tsx`, and `CoursesTableSkeleton.tsx`, following the loading/empty/error `Skeleton` conventions from `code-standards.md`.
- Add "Courses" to the Dean sidebar nav (`components/shared/AppSidebar.tsx`), using `APP_ROUTES` — no raw path strings.

### 2. Seed Data

- Seed two Courses on setup: **BSCS** ("BS Computer Science") and **BSIT** ("BS Information Technology").
- Add this to whatever seed mechanism the project already uses for initial data (check for an existing seed script/mutation before creating a new pattern).

### 3. Subject Updates: Course Assignment + Year Level

Update the Subject entity to require two additional fields:

- `courseId` — which Course this subject belongs to (select from existing Courses, same pattern as the existing Teacher assignment dropdown).
- `year` — year level the subject is intended for: **1, 2, 3, or 4**.

Changes needed:

- Update `types/subject.ts`: add `courseId: string` and `year: 1 | 2 | 3 | 4`.
- Update `convex/schema.ts`'s `subjects` table and `convex/subjects.ts`'s create/update mutations accordingly.
- Update `components/subjects/SubjectFormDialog.tsx`:
  - Add a **Course** select (populated from `useCourses()`), required.
  - Add a **Year** select (options: 1st Year, 2nd Year, 3rd Year, 4th Year), required.
- Update `components/subjects/SubjectsTable.tsx`: add "Course" and "Year" columns (consider a `Badge` for year, e.g. "Year 2").
- Update any existing seed/mock Subject data to include a valid `courseId` and `year` so it doesn't break with the new required fields.

### Data Relationship

- A Course has many Subjects (one-to-many via `courseId`); a Subject belongs to exactly one Course and one Year level. This does not yet affect scheduling logic (`csp.ts`) — Course/Year are descriptive/organizational fields for this update, not new hard constraints. If Course or Year should later affect scheduling (e.g. no two subjects from the same Course/Year overlapping), that would be a separate, explicit follow-up — do not add that constraint now without confirmation.

### New shadcn/ui Components

Check `components/ui/` first before adding anything. Likely already covered by existing Table/Dialog/Form/Select/Badge components from Rooms/Subjects — confirm nothing new is actually needed.

### Linting

- Run the project's lint command and fix all errors and warnings before considering this done — do not disable rules to force a pass.
- Confirm `npm run build` also passes, per the "Before Moving to the Next Unit" checklist in `ai-workflow-rules.md`.

### Before finishing

- Confirm a Dean can add, edit, and delete a Course, and that BSCS and BSIT are seeded correctly on a fresh setup.
- Confirm a Subject cannot be created without selecting both a Course and a Year.
- Confirm the Subjects table correctly displays Course and Year for each row.
- Update `progress-tracker.md` with what was completed and flag as an open question whether Course/Year should eventually factor into scheduling constraints.
- Do not touch `components/ui/*` internals directly — only add new primitives via the CLI.