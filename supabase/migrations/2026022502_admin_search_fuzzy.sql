-- Optional typo-tolerant fallback search for admin list pages.
-- Used only when exact/prefix ILIKE search returns zero rows.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function public.admin_search_recipes_fuzzy(
  p_search text,
  p_status text default 'all',
  p_category_slug text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  is_published boolean,
  prep_minutes int,
  cook_minutes int,
  serves int,
  updated_at timestamptz,
  category_slug text,
  category_title text,
  score real
)
language sql
stable
set search_path = public
as $$
  with params as (
    select unaccent(lower(trim(coalesce(p_search, '')))) as q
  )
  select
    r.id,
    r.slug,
    r.title,
    r.is_published,
    r.prep_minutes,
    r.cook_minutes,
    r.serves,
    r.updated_at,
    c.slug as category_slug,
    c.title as category_title,
    greatest(
      similarity(unaccent(lower(r.title)), params.q),
      similarity(unaccent(lower(r.slug)), params.q)
    ) as score
  from params
  join public.recipes r on true
  join public.categories c on c.id = r.category_id
  where params.q <> ''
    and (
      p_status = 'all'
      or (p_status = 'published' and r.is_published = true)
      or (p_status = 'draft' and r.is_published = false)
    )
    and (coalesce(p_category_slug, '') = '' or c.slug = p_category_slug)
    and (
      unaccent(lower(r.title)) % params.q
      or unaccent(lower(r.slug)) % params.q
    )
  order by score desc, r.updated_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.admin_count_recipes_fuzzy(
  p_search text,
  p_status text default 'all',
  p_category_slug text default null
)
returns bigint
language sql
stable
set search_path = public
as $$
  with params as (
    select unaccent(lower(trim(coalesce(p_search, '')))) as q
  )
  select count(*)::bigint
  from params
  join public.recipes r on true
  join public.categories c on c.id = r.category_id
  where params.q <> ''
    and (
      p_status = 'all'
      or (p_status = 'published' and r.is_published = true)
      or (p_status = 'draft' and r.is_published = false)
    )
    and (coalesce(p_category_slug, '') = '' or c.slug = p_category_slug)
    and (
      unaccent(lower(r.title)) % params.q
      or unaccent(lower(r.slug)) % params.q
    );
$$;

create or replace function public.admin_search_ingredients_fuzzy(
  p_search text,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name citext,
  image_path text,
  updated_at timestamptz,
  score real
)
language sql
stable
set search_path = public
as $$
  with params as (
    select unaccent(lower(trim(coalesce(p_search, '')))) as q
  )
  select
    i.id,
    i.name,
    i.image_path,
    i.updated_at,
    similarity(unaccent(lower(i.name::text)), params.q) as score
  from params
  join public.ingredients i on true
  where params.q <> ''
    and unaccent(lower(i.name::text)) % params.q
  order by score desc, i.name asc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.admin_count_ingredients_fuzzy(
  p_search text
)
returns bigint
language sql
stable
set search_path = public
as $$
  with params as (
    select unaccent(lower(trim(coalesce(p_search, '')))) as q
  )
  select count(*)::bigint
  from params
  join public.ingredients i on true
  where params.q <> ''
    and unaccent(lower(i.name::text)) % params.q;
$$;
