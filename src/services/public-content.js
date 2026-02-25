export function createPublicContentService({ supabase }) {
  function buildRecipeMeta(prepMinutes, cookMinutes, serves) {
    const meta = [];
    if (prepMinutes !== null && prepMinutes !== undefined) meta.push(`⏱ ${prepMinutes} min Prep`);
    if (cookMinutes !== null && cookMinutes !== undefined) meta.push(`🔥 ${cookMinutes} min Cook`);
    if (serves !== null && serves !== undefined) meta.push(`👥 Serves ${serves}`);
    return meta;
  }

  function mapAmount(row) {
    if (row.amount_text) return row.amount_text;
    if (row.amount_value !== null && row.amount_value !== undefined && row.amount_unit) {
      return `${row.amount_value} ${row.amount_unit}`;
    }
    if (row.amount_value !== null && row.amount_value !== undefined) return `${row.amount_value}`;
    return null;
  }

  async function getCategoryBySlug(categorySlug) {
    const { data, error } = await supabase.from("categories").select("slug, title").eq("slug", categorySlug).maybeSingle();
    if (error) {
      throw new Error(`Supabase category lookup failed: ${error.message}`);
    }
    return data;
  }

  async function getFormCategories() {
    const { data, error } = await supabase.from("categories").select("slug, title").order("title");
    if (error) {
      throw new Error(`Supabase categories list failed: ${error.message}`);
    }

    return (data || []).filter((c) => c.slug !== "new-recipes");
  }

  async function getRecipesByCategory(categorySlug) {
    const { data, error } = await supabase
      .from("recipes")
      .select("slug, title, description, image_path, prep_minutes, cook_minutes, categories!inner(slug)")
      .eq("categories.slug", categorySlug)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Supabase recipes list failed: ${error.message}`);
    }

    return (data || []).map((recipe) => {
      const totalMinutes = (recipe.prep_minutes || 0) + (recipe.cook_minutes || 0);
      return {
        title: recipe.title,
        link: `/categories/${categorySlug}/${recipe.slug}`,
        image: recipe.image_path || "",
        alt: recipe.title,
        description: recipe.description,
        time: totalMinutes > 0 ? `${totalMinutes} min` : null,
        timeISO: totalMinutes > 0 ? `PT${totalMinutes}M` : null,
      };
    });
  }

  async function getRecipeDetails(categorySlug, recipeSlug) {
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, title, subtitle, description, image_path, prep_minutes, cook_minutes, serves, categories!inner(slug)")
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

    return {
      title: recipe.title,
      subtitle: recipe.subtitle || recipe.title,
      description: recipe.description,
      image: recipe.image_path || "",
      activePage: categorySlug,
      recipePageCSS: true,
      serves: recipe.serves,
      prepMinutes: recipe.prep_minutes,
      cookMinutes: recipe.cook_minutes,
      meta: buildRecipeMeta(recipe.prep_minutes, recipe.cook_minutes, recipe.serves),
      ingredients: (ingredientsRes.data || []).map((item) => ({
        name: item.ingredients?.name || "Ingredient",
        image: item.ingredients?.image_path || "",
        amountValue: item.amount_value,
        amountUnit: item.amount_unit || null,
        amountText: item.amount_text || null,
        amount: mapAmount(item),
      })),
      instructions: (stepsRes.data || []).map((step) => ({
        title: step.title,
        text: step.body,
      })),
      tips: (tipsRes.data || []).map((tipItem) => tipItem.tip),
    };
  }

  return {
    getCategoryBySlug,
    getFormCategories,
    getRecipesByCategory,
    getRecipeDetails,
  };
}
