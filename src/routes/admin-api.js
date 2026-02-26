export function registerAdminApiRoutes(app, deps) {
  const {
    requireAdminApi,
    requireSameOrigin,
    requireCsrfApi,
    supabaseAdmin,
    parsePagination,
    listAdminRecipes,
    handleApiError,
    createRecipeFromRequestBody,
    writeAdminAuditLog,
    getRecipeAdminDetails,
    updateRecipeFromRequestBody,
    deleteStorageObjectByPublicUrl,
    listAdminIngredients,
    createIngredientFromRequestBody,
    updateIngredientFromRequestBody,
    toDisplayImagePath,
  } = deps;

  app.get("/api/admin/recipes", requireAdminApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    const search = String(req.query.search || "").trim();
    const status = ["all", "published", "draft"].includes(String(req.query.status || "")) ? String(req.query.status) : "all";
    const category = String(req.query.category || "").trim();
    const { page, pageSize } = parsePagination(req.query);

    try {
      const result = await listAdminRecipes({ search, status, category, page, pageSize });
      const totalPages = Math.max(1, Math.ceil((result.total || 0) / pageSize));
      return res.json({
        items: result.items,
        search_feedback: result.searchFeedback,
        page,
        page_size: pageSize,
        total: result.total,
        total_pages: totalPages,
      });
    } catch (error) {
      return handleApiError(res, error, "Failed to list recipes.");
    }
  });

  app.post("/api/admin/recipes", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    try {
      const result = await createRecipeFromRequestBody(req.body);
      await writeAdminAuditLog({
        req,
        action: "recipe.create",
        entityType: "recipe",
        entityId: result.id,
        metadata: {
          slug: result.slug,
          category_slug: result.categorySlug,
          is_published: result.isPublished,
        },
      });
      return res.status(201).json({
        id: result.id,
        slug: result.slug,
        link: `/categories/${result.categorySlug}/${result.slug}`,
        editLink: `/admin/recipes/${result.id}/edit`,
        is_published: result.isPublished,
      });
    } catch (error) {
      return handleApiError(res, error, "Failed to create recipe.");
    }
  });

  app.get("/api/admin/recipes/:id", requireAdminApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    try {
      const recipe = await getRecipeAdminDetails(req.params.id);
      return res.json(recipe);
    } catch (error) {
      return handleApiError(res, error, "Failed to load recipe.");
    }
  });

  app.patch("/api/admin/recipes/:id", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    try {
      const result = await updateRecipeFromRequestBody(req.params.id, req.body);
      await writeAdminAuditLog({
        req,
        action: "recipe.update",
        entityType: "recipe",
        entityId: result.id,
        metadata: {
          slug: result.slug,
          category_slug: result.categorySlug,
          is_published: result.isPublished,
        },
      });
      return res.json({
        id: result.id,
        slug: result.slug,
        link: `/categories/${result.categorySlug}/${result.slug}`,
        editLink: `/admin/recipes/${result.id}/edit`,
        is_published: result.isPublished,
      });
    } catch (error) {
      return handleApiError(res, error, "Failed to update recipe.");
    }
  });

  app.patch("/api/admin/recipes/:id/publish", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });

    const recipeId = req.params.id;
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("recipes")
      .select("id, is_published")
      .eq("id", recipeId)
      .maybeSingle();
    if (lookupError) return res.status(400).json({ error: `Recipe lookup failed: ${lookupError.message}` });
    if (!existing?.id) return res.status(404).json({ error: "Recipe not found." });

    const nextIsPublished = typeof req.body.is_published === "boolean" ? req.body.is_published : !Boolean(existing.is_published);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("recipes")
      .update({ is_published: nextIsPublished })
      .eq("id", recipeId)
      .select("id, is_published")
      .single();
    if (updateError) return res.status(400).json({ error: `Publish update failed: ${updateError.message}` });
    await writeAdminAuditLog({
      req,
      action: updated.is_published ? "recipe.publish" : "recipe.unpublish",
      entityType: "recipe",
      entityId: updated.id,
      metadata: { is_published: updated.is_published },
    });
    return res.json(updated);
  });

  app.delete("/api/admin/recipes/:id", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    const recipeId = req.params.id;

    const [recipeRes, stepImagesRes] = await Promise.all([
      supabaseAdmin.from("recipes").select("id, image_path").eq("id", recipeId).maybeSingle(),
      supabaseAdmin.from("recipe_steps").select("image_path").eq("recipe_id", recipeId).not("image_path", "is", null),
    ]);

    if (recipeRes.error) return res.status(400).json({ error: `Recipe lookup failed: ${recipeRes.error.message}` });
    if (!recipeRes.data?.id) return res.status(404).json({ error: "Recipe not found." });
    if (stepImagesRes.error) return res.status(400).json({ error: `Step image lookup failed: ${stepImagesRes.error.message}` });

    const imagePaths = [
      recipeRes.data.image_path,
      ...(stepImagesRes.data || []).map((item) => item.image_path).filter(Boolean),
    ].filter(Boolean);

    const { error: deleteError } = await supabaseAdmin.from("recipes").delete().eq("id", recipeId);
    if (deleteError) return res.status(400).json({ error: `Recipe delete failed: ${deleteError.message}` });

    await writeAdminAuditLog({
      req,
      action: "recipe.delete",
      entityType: "recipe",
      entityId: recipeId,
      metadata: { image_count: imagePaths.length },
    });

    for (const imagePath of imagePaths) {
      await deleteStorageObjectByPublicUrl(imagePath, "recipe-images");
    }

    return res.status(204).send();
  });

  app.get("/api/admin/ingredients", requireAdminApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    const search = String(req.query.search || "").trim();
    const { page, pageSize } = parsePagination(req.query);

    try {
      const result = await listAdminIngredients({ search, page, pageSize });
      const totalPages = Math.max(1, Math.ceil((result.total || 0) / pageSize));
      return res.json({
        items: result.items,
        search_feedback: result.searchFeedback,
        page,
        page_size: pageSize,
        total: result.total,
        total_pages: totalPages,
      });
    } catch (error) {
      return handleApiError(res, error, "Failed to list ingredients.");
    }
  });

  app.post("/api/admin/ingredients", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    try {
      const item = await createIngredientFromRequestBody(req.body);
      await writeAdminAuditLog({
        req,
        action: "ingredient.create",
        entityType: "ingredient",
        entityId: item.id,
        metadata: { name: item.name },
      });
      return res.status(201).json(item);
    } catch (error) {
      return handleApiError(res, error, "Failed to create ingredient.");
    }
  });

  app.get("/api/admin/ingredients/:id", requireAdminApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    const { data, error } = await supabaseAdmin
      .from("ingredients")
      .select("id, name, image_path")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return res.status(400).json({ error: `Ingredient lookup failed: ${error.message}` });
    if (!data?.id) return res.status(404).json({ error: "Ingredient not found." });
    return res.json({
      ...data,
      image_path: toDisplayImagePath(data.image_path, "ingredient-images"),
    });
  });

  app.patch("/api/admin/ingredients/:id", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    try {
      const item = await updateIngredientFromRequestBody(req.params.id, req.body);
      await writeAdminAuditLog({
        req,
        action: "ingredient.update",
        entityType: "ingredient",
        entityId: item.id,
        metadata: { name: item.name },
      });
      return res.json(item);
    } catch (error) {
      return handleApiError(res, error, "Failed to update ingredient.");
    }
  });

  app.delete("/api/admin/ingredients/:id", requireAdminApi, requireSameOrigin, requireCsrfApi, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Supabase write client is not configured." });
    const ingredientId = req.params.id;

    const [{ count: usageCount, error: usageError }, { data: ingredient, error: ingredientError }] = await Promise.all([
      supabaseAdmin.from("recipe_ingredients").select("*", { count: "exact", head: true }).eq("ingredient_id", ingredientId),
      supabaseAdmin.from("ingredients").select("id, name, image_path").eq("id", ingredientId).maybeSingle(),
    ]);
    if (usageError) return res.status(400).json({ error: `Ingredient usage lookup failed: ${usageError.message}` });
    if (ingredientError) return res.status(400).json({ error: `Ingredient lookup failed: ${ingredientError.message}` });
    if (!ingredient?.id) return res.status(404).json({ error: "Ingredient not found." });
    if ((usageCount || 0) > 0) {
      return res
        .status(409)
        .json({ error: `Ingredient "${ingredient.name}" is used in ${usageCount} recipes. Remove usage before deleting.` });
    }

    const { error: deleteError } = await supabaseAdmin.from("ingredients").delete().eq("id", ingredientId);
    if (deleteError) return res.status(400).json({ error: `Ingredient delete failed: ${deleteError.message}` });

    await writeAdminAuditLog({
      req,
      action: "ingredient.delete",
      entityType: "ingredient",
      entityId: ingredientId,
      metadata: { name: ingredient.name },
    });

    await deleteStorageObjectByPublicUrl(ingredient.image_path, "ingredient-images");
    return res.status(204).send();
  });
}
