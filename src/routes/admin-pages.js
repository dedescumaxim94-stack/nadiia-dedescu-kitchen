export function registerAdminPageRoutes(app, deps) {
  const {
    requireAdminPage,
    supabaseAdmin,
    getAdminDashboardCounts,
    renderAdminPage,
    parsePagination,
    listAdminRecipes,
    getFormCategories,
    createPaginationViewModel,
    getRecipeAdminDetails,
    listAdminIngredients,
  } = deps;

  app.get("/admin", requireAdminPage, async (req, res) => {
    const counts = await getAdminDashboardCounts();
    return renderAdminPage(res, "admin/dashboard", {
      title: "Dashboard",
      adminTitle: "Dashboard",
      adminSubtitle: "Overview of recipe and ingredient content.",
      adminNavActive: "dashboard",
      adminPrimaryAction: { href: "/admin/recipes/new", label: "+ New Recipe" },
      counts,
    });
  });

  app.get("/admin/recipes", requireAdminPage, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).send("Supabase write client is not configured.");
    const search = String(req.query.search || "").trim();
    const status = ["all", "published", "draft"].includes(String(req.query.status || "")) ? String(req.query.status) : "all";
    const category = String(req.query.category || "").trim();
    const { page, pageSize } = parsePagination(req.query);

    try {
      const [listResult, categories] = await Promise.all([
        listAdminRecipes({ search, status, category, page, pageSize }),
        getFormCategories(),
      ]);
      const pagination = createPaginationViewModel({
        page,
        pageSize,
        total: listResult.total,
        basePath: "/admin/recipes",
        extraQuery: { search, status, category },
      });

      return renderAdminPage(res, "admin/recipes-list", {
        title: "Recipes",
        adminTitle: "Recipes",
        adminSubtitle: "Search, edit, publish, and delete recipes.",
        adminNavActive: "recipes",
        adminPrimaryAction: { href: "/admin/recipes/new", label: "+ New Recipe" },
        adminSearch: {
          action: "/admin/recipes",
          value: search,
          placeholder: "Search by title or slug",
          hidden: {
            status,
            category,
            page_size: pageSize,
          },
        },
        adminPageJS: "admin-recipes.js",
        items: listResult.items,
        searchFeedback: listResult.searchFeedback,
        categories,
        filters: {
          search,
          status,
          category,
          pageSize,
        },
        pagination,
      });
    } catch (error) {
      return res.status(error?.status || 500).send(error?.message || "Failed to load recipes.");
    }
  });

  app.get("/admin/recipes/new", requireAdminPage, async (req, res) => {
    const categories = await getFormCategories();
    return renderAdminPage(res, "admin/recipe-form", {
      title: "New Recipe",
      adminTitle: "Create Recipe",
      adminSubtitle: "Save as draft by default, or publish explicitly.",
      adminNavActive: "recipes",
      adminPrimaryAction: { href: "/admin/recipes", label: "Back to Recipes" },
      adminPageJS: "admin-recipes.js",
      mode: "create",
      categories,
      recipe: {
        id: null,
        category_slug: categories[0]?.slug || "",
        title: "",
        subtitle: "",
        description: "",
        image_path: "",
        prep_minutes: null,
        cook_minutes: null,
        serves: null,
        is_published: false,
        ingredients: [],
        steps: [],
        tips: [],
      },
    });
  });

  app.get("/admin/recipes/:id/edit", requireAdminPage, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).send("Supabase write client is not configured.");
    try {
      const [recipe, categories] = await Promise.all([
        getRecipeAdminDetails(req.params.id),
        getFormCategories(),
      ]);
      return renderAdminPage(res, "admin/recipe-form", {
        title: "Edit Recipe",
        adminTitle: "Edit Recipe",
        adminSubtitle: "Update draft content, then publish when ready.",
        adminNavActive: "recipes",
        adminPrimaryAction: { href: "/admin/recipes", label: "Back to Recipes" },
        adminPageJS: "admin-recipes.js",
        mode: "edit",
        categories,
        recipe,
      });
    } catch (error) {
      return res.status(error?.status || 500).send(error?.message || "Failed to load recipe.");
    }
  });

  app.get("/admin/ingredients", requireAdminPage, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).send("Supabase write client is not configured.");
    const search = String(req.query.search || "").trim();
    const { page, pageSize } = parsePagination(req.query);

    try {
      const listResult = await listAdminIngredients({ search, page, pageSize });
      const pagination = createPaginationViewModel({
        page,
        pageSize,
        total: listResult.total,
        basePath: "/admin/ingredients",
        extraQuery: { search },
      });

      return renderAdminPage(res, "admin/ingredients-list", {
        title: "Ingredients",
        adminTitle: "Ingredients",
        adminSubtitle: "Manage ingredient names, images, and cleanup.",
        adminNavActive: "ingredients",
        adminPrimaryAction: { href: "/admin/ingredients/new", label: "+ New Ingredient" },
        adminSearch: {
          action: "/admin/ingredients",
          value: search,
          placeholder: "Search ingredients",
          hidden: {
            page_size: pageSize,
          },
        },
        adminPageJS: "admin-ingredients.js",
        items: listResult.items,
        searchFeedback: listResult.searchFeedback,
        filters: {
          search,
          pageSize,
        },
        pagination,
      });
    } catch (error) {
      return res.status(error?.status || 500).send(error?.message || "Failed to load ingredients.");
    }
  });

  app.get("/admin/ingredients/new", requireAdminPage, (req, res) => {
    return renderAdminPage(res, "admin/ingredient-form", {
      title: "New Ingredient",
      adminTitle: "Create Ingredient",
      adminSubtitle: "Ingredient image is required.",
      adminNavActive: "ingredients",
      adminPrimaryAction: { href: "/admin/ingredients", label: "Back to Ingredients" },
      adminPageJS: "admin-ingredients.js",
      mode: "create",
      ingredient: {
        id: null,
        name: "",
        image_path: "",
      },
    });
  });

  app.get("/admin/ingredients/:id/edit", requireAdminPage, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).send("Supabase write client is not configured.");
    const { data, error } = await supabaseAdmin.from("ingredients").select("id, name, image_path").eq("id", req.params.id).maybeSingle();
    if (error) return res.status(400).send(`Ingredient lookup failed: ${error.message}`);
    if (!data?.id) return res.status(404).send("Ingredient not found.");

    return renderAdminPage(res, "admin/ingredient-form", {
      title: "Edit Ingredient",
      adminTitle: "Edit Ingredient",
      adminSubtitle: "Update ingredient image and metadata.",
      adminNavActive: "ingredients",
      adminPrimaryAction: { href: "/admin/ingredients", label: "Back to Ingredients" },
      adminPageJS: "admin-ingredients.js",
      mode: "edit",
      ingredient: data,
    });
  });
}
