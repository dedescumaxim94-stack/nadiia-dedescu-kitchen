export function registerPublicRoutes(app, deps) {
  const {
    getHomePageData,
    getRecipeDetails,
    getCategoryBySlug,
    getRecipesByCategory,
    getFormCategories,
  } = deps;

  app.get("/", async (req, res) => {
    try {
      const homeData = await getHomePageData();
      return res.render("index", {
        title: "Nadiia's Kitchen",
        activePage: "home",
        navCategories: homeData.categories,
        featuredRecipe: homeData.featuredRecipe,
        latestRecipes: homeData.latestRecipes,
        categorySections: homeData.categorySections,
      });
    } catch (error) {
      console.error("Home page load failed:", error.message);
      return res.status(500).send("Failed to load home page.");
    }
  });

  app.get("/categories/new-recipes", (_req, res) => {
    return res.status(404).send("Page Not Found");
  });

  app.get("/categories/:category/:recipe", async (req, res) => {
    const { category, recipe } = req.params;

    try {
      const [recipeData, navCategories] = await Promise.all([getRecipeDetails(category, recipe), getFormCategories()]);
      if (!recipeData) return res.status(404).send("Recipe not found");
      return res.render("categories/recipe", {
        ...recipeData,
        navCategories,
      });
    } catch (error) {
      console.error("Recipe detail load failed:", error.message);
      return res.status(500).send("Failed to load recipe.");
    }
  });

  app.get("/categories/:category", async (req, res) => {
    const { category } = req.params;

    try {
      const [categoryData, recipes, navCategories] = await Promise.all([
        getCategoryBySlug(category),
        getRecipesByCategory(category),
        getFormCategories(),
      ]);

      if (!categoryData) return res.status(404).send("Page Not Found");

      return res.render("categories/category", {
        title: categoryData.title,
        activePage: category,
        categoryPageCSS: true,
        navCategories,
        recipes,
      });
    } catch (error) {
      console.error("Category page load failed:", error.message);
      return res.status(500).send("Failed to load category.");
    }
  });
}
