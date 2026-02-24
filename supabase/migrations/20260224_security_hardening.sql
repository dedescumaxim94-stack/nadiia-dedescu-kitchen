-- Security hardening migration
-- Locks write operations to service role and keeps reads public for published content.

drop policy if exists "recipes_public_select" on public.recipes;
create policy "recipes_public_select"
on public.recipes
for select
using (is_published = true);

drop policy if exists "recipe_ingredients_public_select" on public.recipe_ingredients;
create policy "recipe_ingredients_public_select"
on public.recipe_ingredients
for select
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and r.is_published = true
  )
);

drop policy if exists "recipe_steps_public_select" on public.recipe_steps;
create policy "recipe_steps_public_select"
on public.recipe_steps
for select
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and r.is_published = true
  )
);

drop policy if exists "recipe_tips_public_select" on public.recipe_tips;
create policy "recipe_tips_public_select"
on public.recipe_tips
for select
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and r.is_published = true
  )
);

drop policy if exists "categories_auth_write" on public.categories;
drop policy if exists "categories_service_write" on public.categories;
create policy "categories_service_write"
on public.categories
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "recipes_auth_write" on public.recipes;
drop policy if exists "recipes_service_write" on public.recipes;
create policy "recipes_service_write"
on public.recipes
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "ingredients_auth_write" on public.ingredients;
drop policy if exists "ingredients_service_write" on public.ingredients;
create policy "ingredients_service_write"
on public.ingredients
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "recipe_ingredients_auth_write" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_service_write" on public.recipe_ingredients;
create policy "recipe_ingredients_service_write"
on public.recipe_ingredients
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "recipe_steps_auth_write" on public.recipe_steps;
drop policy if exists "recipe_steps_service_write" on public.recipe_steps;
create policy "recipe_steps_service_write"
on public.recipe_steps
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "recipe_tips_auth_write" on public.recipe_tips;
drop policy if exists "recipe_tips_service_write" on public.recipe_tips;
create policy "recipe_tips_service_write"
on public.recipe_tips
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "auth_write_recipe_assets" on storage.objects;
drop policy if exists "service_write_recipe_assets" on storage.objects;
create policy "service_write_recipe_assets"
on storage.objects
for all
using (
  auth.role() = 'service_role'
  and bucket_id in ('recipe-images', 'ingredient-images', 'category-images', 'step-images')
)
with check (
  auth.role() = 'service_role'
  and bucket_id in ('recipe-images', 'ingredient-images', 'category-images', 'step-images')
);

create or replace function public.create_recipe_with_details(
  p_category_slug text,
  p_slug text,
  p_title text,
  p_subtitle text default null,
  p_description text default '',
  p_image_path text default null,
  p_prep_minutes int default null,
  p_cook_minutes int default null,
  p_serves int default null,
  p_is_published boolean default false,
  p_ingredients jsonb default '[]'::jsonb,
  p_steps jsonb default '[]'::jsonb,
  p_tips jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_recipe_id uuid;
  v_item jsonb;
  v_ingredient_id uuid;
  v_step_number int := 1;
  v_tip_position int := 0;
begin
  if auth.role() != 'service_role' then
    raise exception 'Only service role can create recipes';
  end if;

  select id into v_category_id
  from public.categories
  where slug = p_category_slug;

  if v_category_id is null then
    raise exception 'Category not found for slug: %', p_category_slug;
  end if;

  insert into public.recipes (
    category_id, slug, title, subtitle, description, image_path,
    prep_minutes, cook_minutes, serves, is_published
  )
  values (
    v_category_id, p_slug, p_title, p_subtitle, p_description, p_image_path,
    p_prep_minutes, p_cook_minutes, p_serves, p_is_published
  )
  returning id into v_recipe_id;

  for v_item in select * from jsonb_array_elements(p_ingredients)
  loop
    if coalesce(trim(v_item->>'name'), '') = '' then
      raise exception 'Ingredient name is required';
    end if;

    insert into public.ingredients (name, image_path)
    values (
      trim(v_item->>'name'),
      nullif(v_item->>'image_path', '')
    )
    on conflict (name) do update
      set image_path = coalesce(excluded.image_path, public.ingredients.image_path),
          updated_at = now()
    returning id into v_ingredient_id;

    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, amount_value, amount_unit, amount_text, position
    )
    values (
      v_recipe_id,
      v_ingredient_id,
      nullif(v_item->>'amount_value', '')::numeric,
      nullif(v_item->>'amount_unit', ''),
      nullif(v_item->>'amount_text', ''),
      coalesce((v_item->>'position')::int, 0)
    )
    on conflict (recipe_id, ingredient_id) do update
      set amount_value = excluded.amount_value,
          amount_unit = excluded.amount_unit,
          amount_text = excluded.amount_text,
          position = excluded.position;
  end loop;

  for v_item in select * from jsonb_array_elements(p_steps)
  loop
    insert into public.recipe_steps (recipe_id, step_number, title, body, image_path)
    values (
      v_recipe_id,
      coalesce((v_item->>'step_number')::int, v_step_number),
      nullif(v_item->>'title', ''),
      coalesce(v_item->>'body', ''),
      nullif(v_item->>'image_path', '')
    );
    v_step_number := v_step_number + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(p_tips)
  loop
    insert into public.recipe_tips (recipe_id, tip, position)
    values (
      v_recipe_id,
      coalesce(v_item->>'tip', ''),
      coalesce((v_item->>'position')::int, v_tip_position)
    );
    v_tip_position := v_tip_position + 1;
  end loop;

  return v_recipe_id;
end;
$$;

revoke execute on function public.create_recipe_with_details(
  text, text, text, text, text, text, int, int, int, boolean, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.create_recipe_with_details(
  text, text, text, text, text, text, int, int, int, boolean, jsonb, jsonb, jsonb
) to service_role;
