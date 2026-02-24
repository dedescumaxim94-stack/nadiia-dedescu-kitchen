# Supabase Setup Notes

This folder contains the SQL schema for moving the current static recipe data into Supabase.

## 1. Apply migrations

Run all files in [`supabase/migrations`](/Users/maxmini/Desktop/Nadiia%20Dedescu's%20Kitchen/supabase/migrations) in order (or use `supabase db push`).

It creates:
- `categories`
- `recipes`
- `ingredients`
- `recipe_ingredients`
- `recipe_steps`
- `recipe_tips`
- storage buckets and policies
- `create_recipe_with_details(...)` RPC for transactional recipe creation

The security hardening migration restricts recipe writes to service role usage only.

## 1.1 App environment variables

Set these before starting the Express app:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (required for server-side recipe writes)

Optional read-only fallback:

- `SUPABASE_ANON_KEY` (used only if service role key is missing)

## 2. Route query mapping

Use these query shapes to match your current EJS pages.

### Category page (`/categories/:category`)

```sql
select
  r.slug,
  r.title,
  r.description,
  r.image_path as image,
  (coalesce(r.prep_minutes, 0) + coalesce(r.cook_minutes, 0))::text || ' min' as time,
  'PT' || (coalesce(r.prep_minutes, 0) + coalesce(r.cook_minutes, 0))::text || 'M' as "timeISO"
from public.recipes r
join public.categories c on c.id = r.category_id
where c.slug = :category_slug
  and r.is_published = true
order by r.created_at desc;
```

In Express, build `link` as:

```text
/categories/{category_slug}/{recipe_slug}
```

### Recipe detail (`/categories/:category/:recipe`)

1) Base recipe:

```sql
select
  r.id,
  r.title,
  r.subtitle,
  r.description,
  r.image_path as image,
  r.prep_minutes,
  r.cook_minutes,
  r.serves
from public.recipes r
join public.categories c on c.id = r.category_id
where c.slug = :category_slug
  and r.slug = :recipe_slug
  and r.is_published = true
limit 1;
```

2) Ingredients:

```sql
select
  i.name,
  i.image_path as image,
  coalesce(ri.amount_text, null) as amount
from public.recipe_ingredients ri
join public.ingredients i on i.id = ri.ingredient_id
where ri.recipe_id = :recipe_id
order by ri.position asc, i.name asc;
```

3) Steps:

```sql
select
  title,
  body as text
from public.recipe_steps
where recipe_id = :recipe_id
order by step_number asc;
```

4) Tips:

```sql
select tip
from public.recipe_tips
where recipe_id = :recipe_id
order by position asc;
```

## 3. Create recipe + existing/new ingredients

Call RPC `create_recipe_with_details(...)` with JSON arrays.

Ingredient item format:

```json
{
  "name": "Sugar",
  "image_path": "/src/images/ingredients/sugar.png",
  "amount_text": "1.5 tbsp",
  "position": 2
}
```

Step item format:

```json
{
  "step_number": 1,
  "title": "Mix Ingredients:",
  "body": "Combine ingredients until smooth."
}
```

Tip item format:

```json
{
  "tip": "Use medium heat.",
  "position": 0
}
```
