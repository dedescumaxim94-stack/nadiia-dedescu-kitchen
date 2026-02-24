-- Supabase schema for Nadiia Dedescu's Kitchen
-- Run in Supabase SQL editor or as a migration.

create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  hero_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  slug text not null unique,
  title text not null,
  subtitle text,
  description text not null,
  image_path text,
  prep_minutes int check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes int check (cook_minutes is null or cook_minutes >= 0),
  serves int check (serves is null or serves > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  amount_value numeric(10, 3),
  amount_unit text,
  amount_text text,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (recipe_id, ingredient_id)
);

create table if not exists public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_number int not null check (step_number > 0),
  title text,
  body text not null,
  image_path text,
  created_at timestamptz not null default now(),
  unique (recipe_id, step_number)
);

create table if not exists public.recipe_tips (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tip text not null,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (recipe_id, position)
);

create index if not exists idx_categories_slug on public.categories(slug);
create index if not exists idx_recipes_category_id on public.recipes(category_id);
create index if not exists idx_recipes_slug on public.recipes(slug);
create index if not exists idx_recipes_published on public.recipes(is_published);
create index if not exists idx_ingredients_name on public.ingredients(name);
create index if not exists idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id, position);
create index if not exists idx_recipe_ingredients_ingredient on public.recipe_ingredients(ingredient_id);
create index if not exists idx_recipe_steps_recipe on public.recipe_steps(recipe_id, step_number);
create index if not exists idx_recipe_tips_recipe on public.recipe_tips(recipe_id, position);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_recipes_updated_at on public.recipes;
create trigger trg_recipes_updated_at
before update on public.recipes
for each row execute function public.set_updated_at();

drop trigger if exists trg_ingredients_updated_at on public.ingredients;
create trigger trg_ingredients_updated_at
before update on public.ingredients
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_tips enable row level security;

drop policy if exists "categories_public_select" on public.categories;
create policy "categories_public_select"
on public.categories
for select
using (true);

drop policy if exists "recipes_public_select" on public.recipes;
create policy "recipes_public_select"
on public.recipes
for select
using (is_published or auth.role() = 'authenticated');

drop policy if exists "ingredients_public_select" on public.ingredients;
create policy "ingredients_public_select"
on public.ingredients
for select
using (true);

drop policy if exists "recipe_ingredients_public_select" on public.recipe_ingredients;
create policy "recipe_ingredients_public_select"
on public.recipe_ingredients
for select
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and (r.is_published or auth.role() = 'authenticated')
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
      and (r.is_published or auth.role() = 'authenticated')
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
      and (r.is_published or auth.role() = 'authenticated')
  )
);

drop policy if exists "categories_auth_write" on public.categories;
create policy "categories_auth_write"
on public.categories
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "recipes_auth_write" on public.recipes;
create policy "recipes_auth_write"
on public.recipes
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "ingredients_auth_write" on public.ingredients;
create policy "ingredients_auth_write"
on public.ingredients
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "recipe_ingredients_auth_write" on public.recipe_ingredients;
create policy "recipe_ingredients_auth_write"
on public.recipe_ingredients
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "recipe_steps_auth_write" on public.recipe_steps;
create policy "recipe_steps_auth_write"
on public.recipe_steps
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "recipe_tips_auth_write" on public.recipe_tips;
create policy "recipe_tips_auth_write"
on public.recipe_tips
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values
  ('recipe-images', 'recipe-images', true),
  ('ingredient-images', 'ingredient-images', true),
  ('category-images', 'category-images', true),
  ('step-images', 'step-images', true)
on conflict (id) do nothing;

drop policy if exists "public_read_recipe_assets" on storage.objects;
create policy "public_read_recipe_assets"
on storage.objects
for select
using (bucket_id in ('recipe-images', 'ingredient-images', 'category-images', 'step-images'));

drop policy if exists "auth_write_recipe_assets" on storage.objects;
create policy "auth_write_recipe_assets"
on storage.objects
for all
using (
  auth.role() = 'authenticated'
  and bucket_id in ('recipe-images', 'ingredient-images', 'category-images', 'step-images')
)
with check (
  auth.role() = 'authenticated'
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
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'Only authenticated users or service role can create recipes';
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

grant execute on function public.create_recipe_with_details(
  text, text, text, text, text, text, int, int, int, boolean, jsonb, jsonb, jsonb
) to authenticated, service_role;

insert into public.categories (slug, title, hero_image_path)
values
  ('breakfast', 'Breakfast Recipes', '/src/images/Breakfast.PNG'),
  ('lunch', 'Lunch Recipes', '/src/images/Lunch.PNG'),
  ('dinner', 'Dinner Recipes', '/src/images/Dinner.PNG'),
  ('dessert', 'Dessert Recipes', '/src/images/Dessert.PNG'),
  ('set-menu', 'Set Menu Recipes', '/src/images/Set-Menu.PNG'),
  ('new-recipes', 'New Recipe Recipes', '/src/images/New-Recipes.PNG')
on conflict (slug) do nothing;

with breakfast as (
  select id from public.categories where slug = 'breakfast'
),
upsert_recipe as (
  insert into public.recipes (
    category_id, slug, title, subtitle, description, image_path,
    prep_minutes, cook_minutes, serves, is_published
  )
  select
    b.id,
    'ricotta-pancakes',
    'Ricotta Pancakes',
    'Gourmet Ricotta Pancakes',
    'Delicate and airy ricotta pancakes with a soft, creamy texture.',
    '/src/images/breakfast/Ricotta-Pancakes.png',
    10, 15, 4, true
  from breakfast b
  on conflict (slug) do update
    set title = excluded.title,
        subtitle = excluded.subtitle,
        description = excluded.description,
        image_path = excluded.image_path,
        prep_minutes = excluded.prep_minutes,
        cook_minutes = excluded.cook_minutes,
        serves = excluded.serves,
        is_published = excluded.is_published,
        updated_at = now()
  returning id
)
insert into public.ingredients (name, image_path)
values
  ('Ricotta', '/src/images/ingredients/ricota-cheese.png'),
  ('Eggs', '/src/images/ingredients/egg.png'),
  ('Sugar', '/src/images/ingredients/sugar.png'),
  ('Vanilla Sugar', '/src/images/ingredients/vanilla-sugar.png'),
  ('All-purpose Flour', '/src/images/ingredients/all-purpose-flour.png'),
  ('Baking Powder', '/src/images/ingredients/baking-powder.png'),
  ('Lemon', '/src/images/ingredients/lemon.png')
on conflict (name) do update
  set image_path = excluded.image_path,
      updated_at = now();

with recipe as (
  select id from public.recipes where slug = 'ricotta-pancakes'
),
rows(recipe_id, ingredient_name, amount_text, position) as (
  values
    ((select id from recipe), 'Ricotta', '1 cup', 0),
    ((select id from recipe), 'Eggs', '1 large', 1),
    ((select id from recipe), 'Sugar', '1.5 tbsp', 2),
    ((select id from recipe), 'Vanilla Sugar', '1 tsp', 3),
    ((select id from recipe), 'All-purpose Flour', '4 tbsp', 4),
    ((select id from recipe), 'Baking Powder', '1/2 tsp', 5),
    ((select id from recipe), 'Lemon', '1/4 tsp', 6)
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, amount_text, position)
select
  r.recipe_id,
  i.id,
  r.amount_text,
  r.position
from rows r
join public.ingredients i on i.name = r.ingredient_name
on conflict (recipe_id, ingredient_id) do update
  set amount_text = excluded.amount_text,
      position = excluded.position;

delete from public.recipe_steps
where recipe_id = (select id from public.recipes where slug = 'ricotta-pancakes');

insert into public.recipe_steps (recipe_id, step_number, title, body)
select id, 1, 'Mix Ingredients:', 'Combine all ingredients in a bowl and mix until smooth.'
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 2, 'Heat the Pan:', 'Heat oil in a non-stick frying pan over medium heat.'
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 3, 'Shape:', 'Shape small balls and gently flatten in the pan.'
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 4, 'Cook:', 'Fry until golden on both sides over medium heat.'
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 5, 'Serve:', 'Serve with sour cream, jam, or honey.'
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 6, 'Enjoy:', 'Enjoy your delicious breakfast.'
from public.recipes where slug = 'ricotta-pancakes';

delete from public.recipe_tips
where recipe_id = (select id from public.recipes where slug = 'ricotta-pancakes');

insert into public.recipe_tips (recipe_id, tip, position)
select id, 'Do not over-shape; tenderness matters more than perfect form.', 0
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 'Use slightly wet hands to shape the pancakes.', 1
from public.recipes where slug = 'ricotta-pancakes'
union all
select id, 'Cook on medium heat so they cook through evenly.', 2
from public.recipes where slug = 'ricotta-pancakes';
