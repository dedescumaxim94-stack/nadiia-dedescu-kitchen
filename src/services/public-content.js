function getRelationOne(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function excerptText(text, maxLength = 140) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function createPublicContentService({ supabase }) {
  function toDisplayImagePath(value, defaultBucket = null) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("/") || /^https?:\/\//i.test(raw)) return raw;

    const objectPath = defaultBucket && raw.startsWith(`${defaultBucket}/`) ? raw.slice(defaultBucket.length + 1) : raw;
    if (!defaultBucket) return objectPath;
    const { data } = supabase.storage.from(defaultBucket).getPublicUrl(objectPath);
    return data?.publicUrl || objectPath;
  }

  function buildRecipeMeta(prepMinutes, cookMinutes, serves) {
    const meta = [];
    if (prepMinutes !== null && prepMinutes !== undefined) meta.push(`⏱ ${prepMinutes} min Prep`);
    if (cookMinutes !== null && cookMinutes !== undefined) meta.push(`🔥 ${cookMinutes} min Cook`);
    if (serves !== null && serves !== undefined) meta.push(`👥 Serves ${serves}`);
    return meta;
  }

  function mapAmount(row) {
    // Show amount_text if set and not '0' or 0
    if (row.amount_text && row.amount_text !== '0' && row.amount_text !== 0) return row.amount_text;
    // If value is 0 and unit is set, show only the unit
    if (
      (row.amount_value === 0 || row.amount_value === '0') &&
      row.amount_unit && row.amount_unit !== '' && row.amount_unit !== null && row.amount_unit !== undefined
    ) {
      return `${row.amount_unit}`;
    }
    // Show value and unit if value is not 0/null/undefined/empty string and unit is set
    if (
      row.amount_value !== null &&
      row.amount_value !== undefined &&
      row.amount_value !== '' &&
      row.amount_value !== 0 &&
      row.amount_unit && row.amount_unit !== ''
    ) {
      return `${row.amount_value} ${row.amount_unit}`;
    }
    // Show only value if set and not 0/null/undefined/empty string
    if (
      row.amount_value !== null &&
      row.amount_value !== undefined &&
      row.amount_value !== '' &&
      row.amount_value !== 0
    ) return `${row.amount_value}`;
    // Show only unit if set and not empty/null/undefined
    if (row.amount_unit && row.amount_unit !== '' && row.amount_unit !== null && row.amount_unit !== undefined) {
      return `${row.amount_unit}`;
    }
    return null;
  }

  function mapRecipeCard(recipe) {
    const category = getRelationOne(recipe.categories);
    const totalMinutes = (recipe.prep_minutes || 0) + (recipe.cook_minutes || 0);
    return {
      title: recipe.title,
      subtitle: recipe.subtitle || recipe.title,
      description: recipe.description || "",
      description_excerpt: excerptText(recipe.description, 125),
      image: toDisplayImagePath(recipe.image_path, "recipe-images") || "/src/svg/logo.svg",
      alt: recipe.title,
      category_slug: category?.slug || "",
      category_title: category?.title || "",
      created_at: recipe.created_at || null,
      total_minutes: totalMinutes > 0 ? totalMinutes : null,
      time: totalMinutes > 0 ? `${totalMinutes} min` : null,
      timeISO: totalMinutes > 0 ? `PT${totalMinutes}M` : null,
      link: `/categories/${category?.slug || ""}/${recipe.slug}`,
    };
  }

  async function getCategoryBySlug(categorySlug) {
    const { data, error } = await supabase.from("categories").select("slug, title").eq("slug", categorySlug).maybeSingle();
    if (error) {
      throw new Error(`Supabase category lookup failed: ${error.message}`);
    }
    return data;
  }

  async function getFormCategories() {
    const { data, error } = await supabase.from("categories").select("slug, title").neq("slug", "new-recipes").order("title");
    if (error) {
      throw new Error(`Supabase categories list failed: ${error.message}`);
    }

    return data || [];
  }

  async function getRecipesByCategory(categorySlug) {
    const { data, error } = await supabase
      .from("recipes")
      .select("slug, title, subtitle, description, image_path, prep_minutes, cook_minutes, created_at, categories!inner(slug, title)")
      .eq("categories.slug", categorySlug)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Supabase recipes list failed: ${error.message}`);
    }

    return (data || []).map(mapRecipeCard);
  }

  async function getRecipeDetails(categorySlug, recipeSlug) {
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, title, subtitle, description, image_path, prep_minutes, cook_minutes, serves, categories!inner(slug, title)")
      .eq("categories.slug", categorySlug)
      .eq("slug", recipeSlug)
      .eq("is_published", true)
      .maybeSingle();

    if (recipeError) {
      throw new Error(`Supabase recipe detail failed: ${recipeError.message}`);
    }

    if (!recipe) return null;

    const [ingredientsRes, stepsRes, tipsRes] = await Promise.all([
      supabase
        .from("recipe_ingredients")
        .select("position, amount_text, amount_value, amount_unit, ingredients(name, image_path)")
        .eq("recipe_id", recipe.id)
        .order("position", { ascending: true }),
      supabase
        .from("recipe_steps")
        .select("step_number, title, body")
        .eq("recipe_id", recipe.id)
        .order("step_number", { ascending: true }),
      supabase.from("recipe_tips").select("position, tip").eq("recipe_id", recipe.id).order("position", { ascending: true }),
    ]);

    if (ingredientsRes.error || stepsRes.error || tipsRes.error) {
      throw new Error(
        `Supabase nested detail failed: ${ingredientsRes.error?.message || stepsRes.error?.message || tipsRes.error?.message}`,
      );
    }

    const category = getRelationOne(recipe.categories);

    return {
      title: recipe.title,
      subtitle: recipe.subtitle || recipe.title,
      description: recipe.description,
      image: toDisplayImagePath(recipe.image_path, "recipe-images") || "/src/svg/logo.svg",
      activePage: categorySlug,
      categoryTitle: category?.title || "",
      recipePageCSS: true,
      serves: recipe.serves,
      prepMinutes: recipe.prep_minutes,
      cookMinutes: recipe.cook_minutes,
      meta: buildRecipeMeta(recipe.prep_minutes, recipe.cook_minutes, recipe.serves),
      ingredients: (ingredientsRes.data || []).map((item) => {
        const mappedAmount = mapAmount(item);
        return {
          name: item.ingredients?.name || "Ingredient",
          image: toDisplayImagePath(item.ingredients?.image_path, "ingredient-images") || "/src/svg/logo.svg",
          amountValue: item.amount_value,
          amountUnit: item.amount_unit || null,
          amountText: item.amount_text || null,
          amount: mappedAmount,
        };
      }),
      instructions: (stepsRes.data || []).map((step) => ({
        title: step.title,
        text: step.body,
      })),
      tips: (tipsRes.data || []).map((tipItem) => tipItem.tip),
      tipsTitle: `Kitchen tips for ${recipe.title}`,
    };
  }

  async function getHomePageData() {
    const [categoriesRes, recipesRes] = await Promise.all([
      supabase.from("categories").select("slug, title").neq("slug", "new-recipes").order("title"),
      supabase
        .from("recipes")
        .select(
          "slug, title, subtitle, description, image_path, prep_minutes, cook_minutes, created_at, categories!inner(slug, title)",
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    if (categoriesRes.error) {
      throw new Error(`Supabase home categories query failed: ${categoriesRes.error.message}`);
    }
    if (recipesRes.error) {
      throw new Error(`Supabase home recipes query failed: ${recipesRes.error.message}`);
    }

    const categories = categoriesRes.data || [];
    const recipes = (recipesRes.data || []).map(mapRecipeCard);
    const featuredRecipe = recipes[0] || null;
    const latestRecipes = recipes.slice(0, 8);

    const categorySections = categories
      .map((category) => ({
        slug: category.slug,
        title: category.title,
        recipes: recipes.filter((recipe) => recipe.category_slug === category.slug).slice(0, 4),
      }))
      .filter((section) => section.recipes.length > 0);

    return {
      categories,
      featuredRecipe,
      latestRecipes,
      categorySections,
    };
  }

  return {
    getHomePageData,
    getCategoryBySlug,
    getFormCategories,
    getRecipesByCategory,
    getRecipeDetails,
  };
}
