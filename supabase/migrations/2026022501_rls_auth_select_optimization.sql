-- Optimize RLS policy expressions so auth.role() is initialized once per statement.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

alter policy "categories_service_write"
on public.categories
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy "recipes_service_write"
on public.recipes
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy "ingredients_service_write"
on public.ingredients
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy "recipe_ingredients_service_write"
on public.recipe_ingredients
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy "recipe_steps_service_write"
on public.recipe_steps
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy "recipe_tips_service_write"
on public.recipe_tips
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy "service_write_recipe_assets"
on storage.objects
using (
  (select auth.role()) = 'service_role'
  and bucket_id in ('recipe-images', 'ingredient-images', 'category-images', 'step-images')
)
with check (
  (select auth.role()) = 'service_role'
  and bucket_id in ('recipe-images', 'ingredient-images', 'category-images', 'step-images')
);

alter policy "admin_users_service_rw"
on public.admin_users
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');
