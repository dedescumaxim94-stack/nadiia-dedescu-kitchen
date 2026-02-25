# Admin Platform Plan & Status

Last updated: 2026-02-25

## Next 3 Tasks
1. Execute pending DB migrations in remote:
   - `2026022502_admin_search_fuzzy.sql`
   - `2026022503_admin_audit_logs.sql`
2. Add automated regression tests for admin auth guards, publish flow, ingredient delete conflict, and search ordering.
3. Remove legacy `POST /api/recipes` compatibility route after one release cycle and keep only `/api/admin/recipes`.

## Locked Decisions
1. Dedicated admin shell layout.
2. V1 scope is recipes + ingredients.
3. Full-page forms (no inline edit or modal edit).
4. Draft by default, explicit publish action.
5. Hard delete strategy.
6. Required images for recipe and ingredient flows.
7. Public `/categories/new-recipes` route disabled.
8. Server-side search + pagination.

## Completed (V1 Delivered)
1. Auth and authorization foundation:
   - `GET /login`
   - `POST /login`
   - `POST /logout`
   - admin cookie session handling in Express
   - admin guard middleware for pages and APIs
   - `public.admin_users` table + service-role policy
2. Dedicated admin UI:
   - admin-only layout shell (`views/layouts/admin.ejs`)
   - dashboard (`/admin`)
   - recipes pages:
     - `GET /admin/recipes`
     - `GET /admin/recipes/new`
     - `GET /admin/recipes/:id/edit`
   - ingredients pages:
     - `GET /admin/ingredients`
     - `GET /admin/ingredients/new`
     - `GET /admin/ingredients/:id/edit`
3. Admin APIs (protected):
   - recipes:
     - `GET /api/admin/recipes`
     - `POST /api/admin/recipes`
     - `GET /api/admin/recipes/:id`
     - `PATCH /api/admin/recipes/:id`
     - `PATCH /api/admin/recipes/:id/publish`
     - `DELETE /api/admin/recipes/:id`
   - ingredients:
     - `GET /api/admin/ingredients`
     - `POST /api/admin/ingredients`
     - `GET /api/admin/ingredients/:id`
     - `PATCH /api/admin/ingredients/:id`
     - `DELETE /api/admin/ingredients/:id`
4. Public create flow migration:
   - `GET /categories/new-recipes` disabled
   - public nav/home links removed
   - backward compatibility kept for one cycle via:
     - `POST /api/recipes` -> shared create handler
5. Search behavior (minimal):
   - starts-with first (`q%`)
   - contains second (`%q%`)
   - deduped ordering
   - message for no exact matches
   - optional fuzzy fallback hook implemented in backend
6. Security baseline:
   - same-origin enforcement for state-changing admin APIs
   - CSRF token validation for form and JSON state-changing requests
   - login rate limiting
   - admin audit log writes for create/update/delete/publish actions
   - admin-only middleware on admin pages and APIs

## Partially Complete / Operational Blocker
1. Fuzzy fallback and audit-log SQL helpers are implemented as migration files, but may not be deployed in remote DB in all environments.
2. Files:
   - `supabase/migrations/2026022502_admin_search_fuzzy.sql`
   - `supabase/migrations/2026022503_admin_audit_logs.sql`
3. Symptoms when missing:
   - search shows `No exact matches for "X". Fuzzy helper is not deployed yet.`
   - server logs `Admin audit log skipped: ...`
4. Resolution:
   - ensure migrations are actually executed, not only marked as applied.

## Remaining (Hardening Before Production)
1. Add automated tests for:
   - admin auth guard behavior
   - recipe publish/unpublish
   - delete conflict handling for ingredients
   - pagination and search ordering
2. Complete migration deployment verification across environments.
3. Remove legacy compatibility endpoint after deprecation window:
   - `POST /api/recipes`

## Deferred to V2
1. Categories CRUD screens and APIs.
2. Role management UI.
3. Bulk operations/import-export.
4. Rich autosuggest search UI (only if needed by usage).

## Migration State Notes
1. Active migration chain should include:
   - `2026022401_security_hardening.sql`
   - `2026022402_ingredient_amount_backfill.sql`
   - `2026022403_admin_users.sql`
   - `2026022501_rls_auth_select_optimization.sql`
   - `2026022502_admin_search_fuzzy.sql`
   - `2026022503_admin_audit_logs.sql`
2. Legacy baseline `20260224_initial_schema.sql` was removed from active chain due to remote ordering conflict and should stay archived, not re-applied out-of-order.

## Current Definition of Done (V1)
1. Admin can log in and access dashboard.
2. Admin can create/edit/publish/delete recipes through admin routes.
3. Admin can create/edit/delete ingredients with usage safety checks.
4. Public pages show only published recipes.
5. Migration history and local migration files are aligned with remote.
