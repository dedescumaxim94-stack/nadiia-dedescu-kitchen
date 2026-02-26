# Frontend Redesign Plan (Public Site)

## Goal
Modernize the public website to be content-first and data-driven, replacing static homepage visuals with real recipe cards from Supabase.

## Scope
- Home page redesign (hero + latest + category sections)
- Public layout and navigation refresh
- Shared recipe card component
- Category and recipe page visual consistency update
- Public color/font refresh with design tokens

## Decisions
- Keep SSR with EJS (no SPA framework)
- Keep admin UI unchanged (dedicated admin layout/css)
- Keep current route structure (`/`, `/categories/:category`, `/categories/:category/:recipe`)
- Keep side menu, but simplify and modernize interaction

## Data Changes
- Add `getHomePageData()` in `src/services/public-content.js`
- Home feed uses published recipes + categories from Supabase
- No static fallback content for public pages

## UI Structure
- Hero: featured recipe
- Latest recipes: responsive card grid
- Category browse: compact chip links
- Category rows: section per category with recipe cards

## Implementation Steps
1. Add home feed service method
2. Update public routes to pass dynamic homepage + nav categories
3. Add shared recipe card partial
4. Replace `views/index.ejs` with dynamic content-first layout
5. Refresh `views/layout.ejs` for modern header/navigation
6. Align `views/categories/category.ejs` and `views/categories/recipe.ejs`
7. Rebuild public CSS (`style.css`, `category.css`, `recipe.css`, `login.css`)
8. Clean public JS menu behavior (`public/js/script.js`)

## Acceptance Criteria
- Homepage renders only DB-driven recipe content
- No static carousel image list on homepage
- Public pages share consistent modern styling
- Mobile layout remains usable and readable
- Recipe interactions (ingredient check + servings scaling) continue working
