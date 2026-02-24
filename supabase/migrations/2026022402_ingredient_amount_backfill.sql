-- Backfill structured amounts for the seeded ricotta-pancakes recipe.
-- This enables servings-based ingredient scaling on the recipe page.

with amount_map(ingredient_name, amount_value, amount_unit) as (
  values
    ('Ricotta', 1::numeric, 'cup'::text),
    ('Eggs', 1::numeric, 'large'::text),
    ('Sugar', 1.5::numeric, 'tbsp'::text),
    ('Vanilla Sugar', 1::numeric, 'tsp'::text),
    ('All-purpose Flour', 4::numeric, 'tbsp'::text),
    ('Baking Powder', 0.5::numeric, 'tsp'::text),
    ('Lemon', 0.25::numeric, 'tsp'::text)
)
update public.recipe_ingredients ri
set
  amount_value = m.amount_value,
  amount_unit = m.amount_unit
from public.recipes r, public.ingredients i, amount_map m
where ri.recipe_id = r.id
  and i.id = ri.ingredient_id
  and m.ingredient_name = i.name::text
  and r.slug = 'ricotta-pancakes';
