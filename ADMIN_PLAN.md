# Admin/Auth Implementation Plan

## Proposed Architecture
1. Use Supabase Auth for login (email/password).
2. Keep Express as the gatekeeper for admin pages and admin APIs.
3. Authorize admin access by checking logged-in user against `public.admin_users`.
4. Keep DB writes server-side with `SUPABASE_SERVICE_ROLE_KEY`.
5. Move "Add New Recipe" into admin panel (deprecate public `/categories/new-recipes` creation flow).

## Phase 1: Auth + Authorization Foundation
1. Add auth pages/routes:
   - `GET /login`
   - `POST /login`
   - `POST /logout`
2. Add secure session handling in Express (HttpOnly cookie-based session/token).
3. Add admin guard middleware:
   - blocks unauthenticated users
   - blocks authenticated non-admin users
4. Add migration:
   - `public.admin_users (user_id uuid primary key, email text unique, created_at)`
5. Add bootstrap SQL snippet to insert initial admin user.

## Phase 2: Admin Panel Skeleton
1. Add `GET /admin` dashboard page.
2. Show counts and links for:
   - categories
   - recipes
   - ingredients
3. Update header right-side action:
   - show `Login` when logged out
   - show `Admin` + `Logout` when logged in as admin

## Phase 3: Admin CRUD Pages
1. Categories:
   - list, create, edit, delete
2. Recipes:
   - list, filter by category, create, edit, publish/unpublish, delete
3. Ingredients:
   - list, search, edit name/image, delete with safety checks
4. Add image replacement support in admin edit flows.

## Phase 4: Admin API Endpoints (Admin-only)
1. `GET /api/admin/ingredients`
2. `PATCH /api/admin/ingredients/:id`
3. `DELETE /api/admin/ingredients/:id`
4. Same pattern for recipes and categories.
5. Add server-side validation and clear error responses.

## Phase 5: Move Existing New Recipe Flow
1. Move current new recipe form to `/admin/recipes/new`.
2. Remove public creation entry point from navigation.
3. Keep existing upload/scaling functionality integrated.

## Security Requirements
1. Protect every `/admin*` page and `/api/admin/*` endpoint with admin middleware.
2. Add CSRF protection for state-changing requests.
3. Add rate limiting on login endpoint.
4. Optionally add audit logs for publish/delete actions.

## Acceptance Criteria
1. Unauthenticated users cannot access `/admin*`.
2. Non-admin authenticated users cannot access `/admin*`.
3. Admin can manage categories, recipes, and ingredients.
4. Admin can replace ingredient images.
5. Public pages only show published recipes.

## Execution Order
1. Implement Phase 1 + Phase 2 first.
2. Implement CRUD section-by-section (ingredients, then recipes, then categories).
