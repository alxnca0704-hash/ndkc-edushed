Read `AGENTS.md` and everything in `context/` before starting. Follow the hook/component separation, file organization, and UI token rules defined there — do not invent conventions.

## Feature: Account Page (profile picture, identity, credentials) — shadcn only, no Clerk components

### Goal

Build a real **Account page** at `/account`, reachable by both roles, where a signed-in
user can see who they are and manage their own account:

- their **profile picture**, which they can upload, replace, and remove
- the **important identifying details** — name, email, role — and nothing else
- **edit name**, **change email**, and **reset password**

Two constraints from the request drive the whole design:

1. **Do not use Clerk components.** Every pixel is shadcn/ui + Tailwind. That includes
   the top-bar identity control, which is currently Clerk's `<UserButton />`
   (`components/shared/AppUserMenu.tsx`) — it gets replaced.
2. **The profile picture is stored in Convex, on the `users` table** — not in Clerk.

> "Clerk components" means the prebuilt UI from `@clerk/nextjs` and `@clerk/ui`:
> `UserButton`, `UserProfile`, `SignIn`, `Show`, `Protect`, etc. It does **not** mean
> Clerk's *hooks* (`useUser`, `useClerk`) or its REST **Backend API**. Those are the
> supported non-component surface and this feature depends on both — see Decisions.

### Decisions (settled before writing this spec — do not re-litigate)

| Question | Decision | Why |
| --- | --- | --- |
| Where does the email change happen? | **Convex action → Clerk Backend API**, full swap (new address created primary + old one deleted) | Clerk's *frontend* session API cannot delete an email address. Verified in `node_modules/@clerk/shared/dist/types/user.d.ts`: `UserResource` has `createEmailAddress` but **no** `deleteEmailAddress` and no `updateEmailAddress`. Only the Backend API can complete a swap. |
| What does "reset password" do? | **Set a new password, current password required** | `PATCH /users/{user_id}` takes a plaintext `password` but **no** `current_password`, so the Backend API alone cannot re-verify the user. Gating every write behind an explicit `POST /users/{user_id}/verify_password` restores that check. An emailed reset link is a dead end — this project has no mail service. |
| Which details are "important"? | **Identity + a role-scoped summary** | Avatar, name, email, role badge, plus one small read-only line scoped by role. Everything else (Clerk user id, created/updated timestamps, metadata, session info) stays hidden. |
| Does the ban on Clerk components extend to the top bar? | **Yes — replace `<UserButton />`** | Otherwise a Clerk component is still on screen *and* the new page has no entry point. |

Two consequences worth stating plainly:

- **This unit needs the secret key.** `CLERK_SECRET_KEY` must be set in the **Convex
  deployment** env (not just `.env.local`), because the identity writes run in Convex
  actions. `convex/teachers.ts`'s `syncFromClerk` already reads
  `process.env.CLERK_SECRET_KEY` from inside an action, so the pattern and the
  requirement both already exist — this unit just adds a second reader.
- **Role is not editable here.** `role` lives in Clerk `publicMetadata`, which is
  Backend-API-only, and in-app account creation/role assignment is explicitly Out of
  Scope in `project-overview.md`. The page displays the role as a read-only `Badge`.
  Do not add a role editor.

### What this changes in the context files (do this as part of the unit)

This feature adds scope that the context files currently exclude. Per
`ai-workflow-rules.md` → "Keeping Docs in Sync", resolve these **in the files**, do not
leave the code ahead of the docs:

- `project-overview.md`
  - Add an **Account (self-service)** feature section.
  - In Scope: add self-service profile picture + name/email/password management for an
    already-authenticated user.
  - Out of Scope: keep "Public sign-up / self-registration" and "Admin role and
    in-app account creation" **out**. Amend the admin bullet so it reads clearly that
    the Dean cannot manage *other* users' accounts either — this page is strictly
    self-service.
- `architecture.md`
  - **Storage Model**: the `users` table gains an optional avatar storage id.
  - **Invariants**: add — *an account function never accepts a user id argument; it
    derives the target from `ctx.auth.getUserIdentity()`. Self-service only, so
    ownership is structural rather than checked.*
  - Note the Clerk Backend API as a second consumer of `CLERK_SECRET_KEY` alongside
    `teachers.syncFromClerk`.

### Step 0 — Dependencies first (separate commit, verify before building on them)

`ai-workflow-rules.md` → "When to Split Work" forbids adding a shadcn primitive and
building feature logic on it in one step. So:

1. `npx shadcn add avatar dropdown-menu`
2. Verify both render (a scratch usage compiles under `npm run build`).
3. Only then start Step 1.

Neither primitive exists today (`components/ui/` has `dialog`, `popover`, `select`,
`switch`, `slider`, `tooltip`, `alert-dialog`, `badge`, `sonner`, … but no `avatar` and
no `dropdown-menu`). Do not hand-write them and do not edit `components/ui/*` — they are
vendored, CLI-owned files.

`next.config.ts` is currently empty, so `next/image` has **no** `remotePatterns` and
would throw on a Convex storage URL. Render the avatar with shadcn's `AvatarImage`
(a plain `<img>`) and do **not** route it through `next/image` or add remote patterns.

### Step 1 — Convex storage: the profile picture

`convex/schema.ts` → `users` gains one optional field:

```
avatarStorageId: v.optional(v.id("_storage")),
```

Optional for the same push-time reason as `subjects.color` (documented in that file):
Convex validates every existing document against a new schema *at push time*, so a
required field here would deadlock its own backfill. Nothing needs backfilling —
`undefined` simply means "no picture", which is a real, renderable state.

New file `convex/clerkApi.ts` — a tiny Clerk REST helper (`clerkRequest(path, init)`)
that reads `CLERK_SECRET_KEY`, sets `Authorization: Bearer …` +
`Content-Type: application/json`, throws a readable error on a non-2xx, and parses the
body. Clerk error bodies carry a useful `{ message, errors }`; surface the message
rather than a bare status code.

> `convex/teachers.ts` hand-rolls this same fetch inline. **Do not refactor
> `teachers.ts` in this unit** — that is a different system boundary. Leave a note in
> `progress-tracker.md` instead.

New file `convex/account.ts` — the whole account backend. Nothing here takes a
`userId` argument; every handler resolves the caller from
`ctx.auth.getUserIdentity()` and 401s without one.

**Queries**

- `getMine` → `{ ok: true, data: AccountProfile }` / `{ ok: false, error }`, matching the
  existing `Result<T>` shape in `lib/result.ts` and the `availability.ts` convention.
  Reads the `users` row by the `by_clerkId` index and returns:
  `firstName`, `lastName`, `email`, `role`, `avatarUrl`, `summary`.

  - `avatarUrl` comes from `ctx.storage.getUrl(row.avatarStorageId)` and is `null` when
    there is no picture or no id. **Return `null`, never a stale URL** — a deleted
    storage object 404s, and a permanently broken `<img>` is worse than the fallback
    initials.
  - `summary` is role-scoped, and it is the only "extra" information on the page:
    - **teacher** — subjects assigned (count of `subjects` by `by_teacherId`) and
      sessions this week (count of `schedules` by `by_teacherId`)
    - **dean** — rooms, courses, and subjects (three counts)
  - Role comes from `roleOf(identity)` (`convex/roles.ts`) — the same helper
    `availability.ts` uses — falling back to the stored `users.role`.

**Mutations**

- `generateAvatarUploadUrl` → `ctx.storage.generateUploadUrl()`. Caller must already
  have a `users` row (i.e. `useUserSync` has run); otherwise throw.
- `setAvatar { storageId }` → validate, then swap:
  - `const meta = await ctx.storage.getMetadata(storageId)`; reject if `null`, if
    `meta.contentType` does not start with `image/`, or if `meta.size` exceeds the cap.
  - Delete the **previous** storage object before patching the row, so replacing a
    picture does not leak a file. (`ctx.storage.delete` is available in mutations.)
  - `ctx.db.patch(row._id, { avatarStorageId: storageId, updatedAt: Date.now() })`
- `removeAvatar` → delete the storage object (if any) and `ctx.db.patch(row._id,
  { avatarStorageId: undefined, updatedAt })`.

**Actions (Clerk identity writes)**

Each of these: resolve the caller → run the change against Clerk → re-sync the Convex
`users` row via an internal mutation, so the app is not left showing stale data until
the next reload. (`useUserSync` only patches on mount, so it cannot be relied on for
this.)

- `updateName { firstName, lastName }` → `PATCH /users/{user_id}`
- `updateEmail { email, currentPassword }` → the full swap, in this order:
  1. `POST /users/{user_id}/verify_password` `{ password: currentPassword }`
  2. `POST /email_addresses` `{ user_id, email_address, verified: true, primary: true }`
     — note the path is `/email_addresses` with `user_id` in the **body**, not
     `/users/{user_id}/email_addresses`.
  3. `DELETE /email_addresses/{oldEmailAddressId}` for each remaining address.
- `updatePassword { currentPassword, newPassword }` →
  1. `POST /users/{user_id}/verify_password` `{ password: currentPassword }`
  2. `PATCH /users/{user_id}` `{ password: newPassword, sign_out_of_other_sessions: true }`

`updatedAt`/`createdAt` on the `users` row must track the change, and `email`/`firstName`/
`lastName` must be re-patched from the Clerk response — the Convex row is a mirror, and
a mirror that lies is worse than no mirror.

**Security note to carry into `progress-tracker.md`:** `updateEmail` creates the new
address with `verified: true`, i.e. the app asserts the address is verified without the
user proving control of it. That is a deliberate call for this prototype: the user is
already authenticated *and* has just re-entered their current password, and the project
has no mail service to send a verification code from. The honest hardening — create
unverified, email a code, `POST /email_addresses/{id}/verify` — is blocked on mail
delivery and belongs in Open Questions. Do not present the current flow as verified.

### Step 2 — Types and validation

- `types/account.ts` — `AccountProfile`, `AccountSummary` (a discriminated union on
  `role`, so a Teacher's component cannot read Dean's fields), `AvatarUploadState`,
  and the form value types. No `any`; explicit interfaces.
- `lib/validation/account.ts` — zod, matching the style of `lib/validation/room.ts`:
  - `accountNameSchema` — `firstName`/`lastName` optional, `.trim().max(60)`, at least
    one non-empty.
  - `accountEmailSchema` — `z.email()` (zod 4; the repo is on `zod@4.6.5`, so
    `z.string().email()` is the deprecated form), plus a refinement rejecting an address
    identical to the current one.
  - `changePasswordSchema` — `currentPassword` non-empty, `newPassword` min 8, and a
    refinement rejecting `newPassword === currentPassword`. Clerk enforces ≥8 chars and
    a hacked-password list server-side; mirror the length, and let Clerk's rejection
    message through rather than inventing a parallel rule.
- Avatar constants (`MAX_AVATAR_BYTES`, `AVATAR_ACCEPTED_TYPES`) belong in
  `constants/account.ts`, and the same numbers must be enforced in `setAvatar` — a
  client-only limit is not a limit.

### Step 3 — `hooks/useAccount.ts`

One hook for the page, named after it, with an **explicit return type**
(`UseAccountResult`) per `code-standards.md`. It owns:

- `api.account.getMine` via `useQuery`
- the three mutations and three actions via `useMutation`/`useAction`
- `useUser()` from Clerk for the live session values and `useClerk()` for `signOut`
- derived `displayName` (first + last → email → "Account") and `initials`
- `isLoading` / `isEmpty` / `error` / `isSaving`, and per-form `isDirty`

Upload orchestration lives here, not in the component:

```
const url = await generateAvatarUploadUrl();
const res = await fetch(url, { method: "POST", body: file });
const { storageId } = await res.json();
await setAvatar({ storageId });
```

`isLoading` is `query === undefined || !clerkLoaded` — the Clerk session and the Convex
row arrive independently, and rendering a half-loaded profile is exactly the
"confidently mislabelled" failure the grid smoke test caught.

No JSX in the hook; no `useQuery` in a component.

### Step 4 — Components (`components/account/`)

shadcn primitives only. One piece of UI per component, explicit `…Props` interfaces.

- `AccountPage.tsx` — the container. Picks skeleton / error / content from the hook,
  exactly like `RoomManagement.tsx` does. Renders the heading, then the cards.
- `AccountPageSkeleton.tsx` — a skeleton matching the real silhouette: an avatar
  circle, two text lines, and two card-shaped blocks. It must not be a spinner
  (`code-standards.md` → Loading, Empty, and Error States).
- `ProfileCard.tsx` — avatar + name + email + role `Badge`, with the upload control.
- `AvatarUpload.tsx` — shadcn `Avatar` (with `AvatarFallback` showing initials) plus a
  file input styled as a shadcn `Button`. Shows the current picture's initials until
  one is set. Client-side pre-check of type and size before uploading, but the
  mutation is the authority.
- `IdentityCard.tsx` — the read-only details list plus an **Edit name** button.
- `ChangeNameDialog.tsx` — shadcn `Dialog` + `Label`/`Input`, zod-validated, submit
  disabled while unchanged or submitting, inline field errors, `toast.success` /
  `toast.error` from `sonner` (the established pattern in `AvailabilityPage.tsx`).
- `ChangeEmailDialog.tsx` — new email + current password, and a line stating plainly
  that the old address will be removed. This is a destructive, irreversible account
  change: gate it behind the password field and consider an `AlertDialog`
  confirmation, matching `SubjectDeleteDialog` / `RoomDeleteDialog`.
- `ChangePasswordDialog.tsx` — current + new + confirm, and a line saying other
  sessions will be signed out.
- `AccountSummaryCard.tsx` — the role-scoped counts from `AccountSummary`.

**States.** The page has no "empty" state by construction: a signed-in user always has a
profile. Do not invent one. The real gap is *first load before `useUserSync` has written
the row* — treat "query succeeded but `getMine` found no row" as the loading case
(skeleton), not as an empty state.

**Styling.** Follow `ui-context.md`: no hardcoded hex (tokens only), muted palette, no
neon, `w-full`/`max-w-*` rather than fixed widths, mobile-first. Cards match the
existing page shell (`mx-auto w-full max-w-6xl px-4 py-6 sm:px-6`, then
`rounded-xl bg-white p-2 shadow-sm sm:p-4`) so the account page does not look like a
different app. Note the repo's page background is `bg-slate-50` with white cards
(`app/layout.tsx`) even though `ui-context.md`'s template is still unfilled — match the
**code**, and flag the stale `ui-context.md` template in `progress-tracker.md`.

### Step 5 — Route, nav, and the top bar

- `constants/routes.ts` → add `account: "/account"` to `APP_ROUTES`. No raw strings
  (Invariant 2).
- `app/account/page.tsx` — a server component, thin, using the `app/no-role/page.tsx`
  pattern exactly: `getCurrentUser()` → `redirect(APP_ROUTES.signIn)` if signed out;
  `requireRole`-style role check so a Dean and a Teacher both land here and a
  role-less user goes to `/no-role`. Then render `<AccountPage />`. No logic beyond
  the guard, no data fetching.
- `components/shared/AppUserMenu.tsx` — replace `<UserButton />` with a shadcn
  `DropdownMenu`: `DropdownMenuTrigger` is a `Button` containing the account `Avatar`
  (+ name on `sm:` and up), and the content is **Account** (link to `APP_ROUTES.account`)
  and **Sign out** (`signOut()` from `useClerk()`). Keep the `useUserSync()` call in
  this component — it is what guarantees the `users` row exists.
  Remove the now-unused `Show` import.
- Add **Account** to both sidebars (`components/DeanSidebar.tsx`,
  `components/TeacherSidebar.tsx`) as its own nav group with a `UserRound`/`Settings`
  icon, so the page is reachable by sidebar as well as by the avatar menu. Both nav
  lists are module-level constants typed `readonly AppSidebarNavGroup[]`.

### Linting

- Run `npm run lint` and fix all errors and warnings — do not disable rules to force a
  pass.
- Confirm `npm run build` passes, per `ai-workflow-rules.md` → "Before Moving to the
  Next Unit".
- `npx tsc --noEmit` clean.

### Before finishing

- Confirm a signed-in user sees avatar, name, email, role badge, and the role-scoped
  summary — and **no** Clerk user id, timestamps, or metadata.
- Confirm the profile picture uploads, renders, **replaces** cleanly (old file deleted),
  and removes back to initials.
- Confirm name, email, and password each save and that the Convex `users` row reflects
  the change **without a page reload** (this is what the internal re-sync mutation is
  for — if it is missing, the page shows stale data until refresh).
- Confirm the email change **removes the old address** from Clerk, and that entering
  the wrong current password fails with Clerk's message rather than silently succeeding.
- Confirm `<UserButton />`, `Show`, and every other Clerk component are gone from the
  app (`grep` for `@clerk/nextjs` imports and check each remaining one is a hook or the
  sign-in route's own page).
- Confirm `/account` is reachable for both roles and redirects when signed out.
- Confirm the account action cannot be aimed at another user: no handler accepts a user
  id, and `convex/account.ts` has no `isDean` gate anywhere (a Dean gets no extra power
  here).
- Update `progress-tracker.md`: mark the unit, record the resolved scope conflicts, the
  `CLERK_SECRET_KEY`-in-Convex requirement, the unverified-email tradeoff, the stale
  `ui-context.md` colour/typography template, the `teachers.ts` Clerk-fetch duplication
  left for later, and note that **browser verification is still outstanding** — the
  upload round-trip, the email swap, and the dropdown have not been eyeballed.
- Do not touch `components/ui/*` internals — only add primitives via the CLI (Step 0).