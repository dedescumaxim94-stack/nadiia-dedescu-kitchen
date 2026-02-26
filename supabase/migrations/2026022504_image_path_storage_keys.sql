-- Convert stored Supabase public image URLs to storage object keys.
-- Keeps existing local paths (e.g. /src/images/...) and existing keys unchanged.

update public.recipes
set image_path = regexp_replace(
  image_path,
  '^https?://[^/]+/storage/v1/object/public/[^/]+/',
  ''
)
where image_path ~ '^https?://[^/]+/storage/v1/object/public/[^/]+/.+';

update public.ingredients
set image_path = regexp_replace(
  image_path,
  '^https?://[^/]+/storage/v1/object/public/[^/]+/',
  ''
)
where image_path ~ '^https?://[^/]+/storage/v1/object/public/[^/]+/.+';

update public.recipe_steps
set image_path = regexp_replace(
  image_path,
  '^https?://[^/]+/storage/v1/object/public/[^/]+/',
  ''
)
where image_path ~ '^https?://[^/]+/storage/v1/object/public/[^/]+/.+';
