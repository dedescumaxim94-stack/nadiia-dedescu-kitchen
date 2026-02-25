export function registerPublicRoutes(app, deps) {
  const {
    getRecipeDetails,
    getCategoryBySlug,
    getRecipesByCategory,
  } = deps;

  app.get("/", (req, res) => {
    res.render("index", {
      title: "Categories",
      activePage: "home",
    });
  });

  // Legacy route disabled in V1.
  app.get("/categories/new-recipes", (_req, res) => {
    return res.status(404).send("Page Not Found");
  });

  app.get("/categories/:category/:recipe", async (req, res) => {
    const { category, recipe } = req.params;
    const recipeData = await getRecipeDetails(category, recipe);
    if (!recipeData) return res.status(404).send("Recipe not found");
    return res.render("categories/recipe", recipeData);
  });

  app.get("/categories/:category", async (req, res) => {
    const { category } = req.params;
    const categoryData = await getCategoryBySlug(category);

    if (!categoryData) return res.status(404).send("Page Not Found");

    res.render("categories/category", {
      title: categoryData.title,
      activePage: category,
      categoryPageCSS: true,
      recipes: await getRecipesByCategory(category),
    });
  });
}
