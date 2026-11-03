Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions. Update the 'progress-tracker.md' once the goal is complete.

About the goal is Admin Features. The admin will manage room, department, and dean. The admin also handles the conflict schedule if different department schedules are combined. Our thesis goal is to handle conflict once different department schedules are compiled.

Goal breakdown:
- the admin will manage room not the dean 
- manage dean (select available account from Clerk or database instead of typing Gmail and name manually)
- manage department
- combine the schedule and handle conflicts using the CSP algorithm

Requirements and Complete Goal (Must pass lint and TypeScript checks):
- must be able to manage room (CRUD re-assigned to Admin)
- must manage dean:
  - When assigning or adding a dean, select from available accounts from Clerk or database (synced user accounts) instead of typing the Gmail address and name manually.
  - Assign the selected account to a department.
  - Support viewing, editing/reassigning, and removing dean assignments.
- must manage department (CRUD for departments: name, code, description)
- compile different department schedules and resolve cross-department conflicts using the CSP backtracking repair engine

Use shadcn reusable components or reuse the components that are used by dean and teacher.
