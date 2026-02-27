import { randomUUID } from "crypto";

const ADMIN_DEFAULT_PAGE_SIZE = 20;
const ADMIN_MAX_PAGE_SIZE = 100;
const RECIPE_IMAGE_BUCKET = "recipe-images";
const INGREDIENT_IMAGE_BUCKET = "ingredient-images";
const adminDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function createAdminService({ supabaseAdmin, supabaseUrl }) {
  function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function toSlug(value = "") {
    return value
      .toLowerCase()
      .trim()
      .replace(/["']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function parseNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseBooleanInput(value, fallback = false) {
    if (value === true || value === "true" || value === "1" || value === 1 || value === "on") return true;
    if (value === false || value === "false" || value === "0" || value === 0 || value === "off") return false;
    return fallback;
  }

  function parseUuidOrNull(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
  }

  function formatDateLabel(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return adminDateFormatter.format(date);
  }

  function parsePagination(query) {
    const rawPage = Number(query.page);
    const rawPageSize = Number(query.page_size);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSizeBase = Number.isInteger(rawPageSize) && rawPageSize > 0 ? rawPageSize : ADMIN_DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(ADMIN_MAX_PAGE_SIZE, pageSizeBase);
    return { page, pageSize };
  }

  function buildQueryString(params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value === null || value === undefined || value === "") continue;
      query.set(key, String(value));
    }
    return query.toString();
  }

  function buildAdminQueryUrl(pathname, params) {
    const query = buildQueryString(params);
    return query ? `${pathname}?${query}` : pathname;
  }

  function createPaginationViewModel({ page, pageSize, total, basePath, extraQuery }) {
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const prevPage = Math.max(1, safePage - 1);
    const nextPage = Math.min(totalPages, safePage + 1);
    return {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      prevUrl: buildAdminQueryUrl(basePath, { ...extraQuery, page: prevPage, page_size: pageSize }),
      nextUrl: buildAdminQueryUrl(basePath, { ...extraQuery, page: nextPage, page_size: pageSize }),
    };
  }

  function escapeForPostgrestOr(value = "") {
    return String(value).replace(/,/g, "\\,");
  }

  function getRelationOne(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }

  function renderAdminPage(res, view, options = {}) {
    return res.render(view, {
      ...options,
      layout: "layouts/admin",
      adminPageCSS: true,
    });
  }

  function requireSameOrigin(req, res, next) {
    const hostHeader = String(req.get("host") || "").toLowerCase();
    const origin = req.get("origin");
    const referer = req.get("referer");

    const matchesHost = (rawUrl) => {
      try {
        const parsed = new URL(rawUrl);
        return parsed.host.toLowerCase() === hostHeader;
      } catch {
        return false;
      }
    };

    if (origin) {
      if (!matchesHost(origin)) return res.status(403).json({ error: "Origin mismatch." });
      return next();
    }

    if (referer) {
      if (!matchesHost(referer)) return res.status(403).json({ error: "Origin mismatch." });
      return next();
    }

    return res.status(403).json({ error: "Origin check required." });
  }

  function extensionFromMime(contentType) {
    const map = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
    };
    return map[contentType] || null;
  }

  function parseImageDataUrl(dataUrl, fieldName) {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) {
      throw new Error(`${fieldName} must be a valid base64 image.`);
    }
    const contentType = match[1];
    const extension = extensionFromMime(contentType);
    if (!extension) {
      throw new Error(`${fieldName} has unsupported image type: ${contentType}.`);
    }
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) {
      throw new Error(`${fieldName} is empty.`);
    }
    if (buffer.length > 15 * 1024 * 1024) {
      throw new Error(`${fieldName} is too large. Max 15MB.`);
    }
    return { buffer, contentType, extension };
  }

  async function uploadImageOrThrow({ bucket, folder, fileBase64, fieldName }) {
    if (!supabaseAdmin) throw new Error("Supabase admin client is unavailable.");
    const { buffer, contentType, extension } = parseImageDataUrl(fileBase64, fieldName);
    const filePath = `${folder}/${Date.now()}-${randomUUID()}.${extension}`;
    const { error } = await supabaseAdmin.storage.from(bucket).upload(filePath, buffer, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed for ${fieldName}: ${error.message}`);

    return filePath;
  }

  function parseStorageImageReference(value, defaultBucket = null) {
    const input = String(value || "").trim();
    if (!input) return null;

    if (input.startsWith("/")) {
      return { type: "local", path: input };
    }

    if (/^https?:\/\//i.test(input)) {
      const matched = input.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
      if (matched?.[1] && matched?.[2]) {
        return {
          type: "storage",
          bucket: matched[1],
          objectPath: matched[2],
        };
      }
      return { type: "url", url: input };
    }

    return {
      type: "storage",
      bucket: defaultBucket,
      objectPath: input,
    };
  }

  function normalizeStoredImagePath(value, defaultBucket = null) {
    const parsed = parseStorageImageReference(value, defaultBucket);
    if (!parsed) return null;
    if (parsed.type === "storage") {
      if (!parsed.objectPath) return null;
      if (defaultBucket && parsed.objectPath.startsWith(`${defaultBucket}/`)) {
        return parsed.objectPath.slice(defaultBucket.length + 1);
      }
      return parsed.objectPath;
    }
    if (parsed.type === "local") return parsed.path;
    if (parsed.type === "url") return parsed.url;
    return null;
  }

  function toDisplayImagePath(value, defaultBucket = null) {
    const parsed = parseStorageImageReference(value, defaultBucket);
    if (!parsed) return "";
    if (parsed.type === "local") return parsed.path;
    if (parsed.type === "url") return parsed.url;
    if (!parsed.bucket || !parsed.objectPath) return parsed.objectPath || "";

    const { data } = supabaseAdmin.storage.from(parsed.bucket).getPublicUrl(parsed.objectPath);
    if (data?.publicUrl) return data.publicUrl;

    if (supabaseUrl) {
      try {
        const origin = new URL(supabaseUrl).origin;
        return `${origin}/storage/v1/object/public/${parsed.bucket}/${parsed.objectPath}`;
      } catch {
        return parsed.objectPath;
      }
    }

    return parsed.objectPath;
  }

  async function deleteStorageObjectByPublicUrl(publicUrl, defaultBucket = null) {
    if (!supabaseAdmin || !publicUrl) return;
    const parsed = parseStorageImageReference(publicUrl, defaultBucket);
    if (!parsed || parsed.type !== "storage" || !parsed.bucket || !parsed.objectPath) return;
    const objectPath = normalizeStoredImagePath(parsed.objectPath, parsed.bucket) || parsed.objectPath;
    const { error } = await supabaseAdmin.storage.from(parsed.bucket).remove([objectPath]);
    if (error) {
      console.warn(`Storage cleanup skipped for ${publicUrl}:`, error.message);
    }
  }

  async function getCategoryIdBySlugOrThrow(categorySlug) {
    const { data, error } = await supabaseAdmin.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
    if (error) throw createHttpError(400, `Category lookup failed: ${error.message}`);
    if (!data?.id) throw createHttpError(400, `Unknown category: ${categorySlug}`);
    return data.id;
  }

  async function ensureUniqueRecipeSlug(rawValue, excludeRecipeId = null) {
    const baseSlug = toSlug(rawValue);
    if (!baseSlug) throw createHttpError(400, "Title is required to generate a recipe slug.");

    let candidate = baseSlug;
    let suffix = 2;
    while (true) {
      let query = supabaseAdmin.from("recipes").select("id").eq("slug", candidate);
      if (excludeRecipeId) query = query.neq("id", excludeRecipeId);
      const { data, error } = await query.maybeSingle();
      if (error && error.code !== "PGRST116") {
        throw createHttpError(400, `Recipe slug check failed: ${error.message}`);
      }
      if (!data) return candidate;
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }

  async function ensureUniqueRecipeTitle(rawTitle, excludeRecipeId = null) {
    const title = String(rawTitle || "").trim();
    if (!title) throw createHttpError(400, "Recipe title is required.");

    let query = supabaseAdmin.from("recipes").select("id, title").ilike("title", title).limit(1);
    if (excludeRecipeId) query = query.neq("id", excludeRecipeId);
    const { data, error } = await query;
    if (error) throw createHttpError(400, `Recipe title check failed: ${error.message}`);
    if ((data || []).length > 0) {
      throw createHttpError(409, `Recipe title \"${title}\" already exists.`);
    }
  }

  function normalizeRecipeWriteInput(body) {
    const categorySlug = String(body.category || "").trim();
    const title = String(body.title || "").trim();
    const subtitle = String(body.subtitle || "").trim() || null;
    const description = String(body.description || "").trim();
    const recipeImageBase64 = String(body.recipe_image_base64 || "").trim();
    const existingRecipeImagePath = String(body.existing_recipe_image_path || "").trim() || null;
    const prepMinutes = parseNumberOrNull(body.prep_minutes);
    const cookMinutes = parseNumberOrNull(body.cook_minutes);
    const serves = parseNumberOrNull(body.serves);
    const isPublished = parseBooleanInput(body.is_published, false);

    if (!categorySlug || !title || !description) {
      throw createHttpError(400, "category, title, and description are required.");
    }
    if (prepMinutes !== null && prepMinutes < 0) throw createHttpError(400, "prep_minutes must be 0 or greater.");
    if (cookMinutes !== null && cookMinutes < 0) throw createHttpError(400, "cook_minutes must be 0 or greater.");
    if (serves !== null && serves <= 0) throw createHttpError(400, "serves must be greater than 0.");

    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
          .map((item, index) => ({
            ingredient_id: parseUuidOrNull(item.ingredient_id),
            name: String(item.name || "").trim(),
            amount_value: parseNumberOrNull(item.amount_value),
            amount_unit: String(item.amount_unit || "").trim(),
            image_base64: String(item.image_base64 || "").trim(),
            existing_image_path: String(item.existing_image_path || "").trim() || null,
            position: index,
          }))
          .filter((item) => item.name.length > 0)
      : [];

    if (!ingredients.length) throw createHttpError(400, "At least one ingredient is required.");

    const seenIngredientNames = new Set();
    for (const ingredient of ingredients) {
      // Amount value and unit are now optional. Only check if value is present and negative.
      if (ingredient.amount_value !== null && ingredient.amount_value !== undefined && ingredient.amount_value < 0) {
        throw createHttpError(400, `Amount value cannot be negative for ingredient "${ingredient.name}".`);
      }
      const key = ingredient.name.toLowerCase();
      if (seenIngredientNames.has(key)) {
        throw createHttpError(400, `Ingredient "${ingredient.name}" is duplicated in this recipe.`);
      }
      seenIngredientNames.add(key);
    }

    const steps = Array.isArray(body.steps)
      ? body.steps
          .map((item, index) => ({
            step_number: index + 1,
            title: String(item.title || "").trim() || null,
            body: String(item.body || "").trim(),
          }))
          .filter((item) => item.body.length > 0)
      : [];

    if (!steps.length) throw createHttpError(400, "At least one instruction step is required.");

    const tips = Array.isArray(body.tips)
      ? body.tips
          .map((item, index) => ({
            tip: String(item.tip || "").trim(),
            position: index,
          }))
          .filter((item) => item.tip.length > 0)
      : [];

    return {
      categorySlug,
      title,
      subtitle,
      description,
      recipeImageBase64,
      existingRecipeImagePath,
      prepMinutes,
      cookMinutes,
      serves,
      isPublished,
      ingredients,
      steps,
      tips,
    };
  }

  async function resolveRecipeImagePath({ slug, recipeImageBase64, existingRecipeImagePath }) {
    if (recipeImageBase64) {
      return uploadImageOrThrow({
        bucket: RECIPE_IMAGE_BUCKET,
        folder: slug,
        fileBase64: recipeImageBase64,
        fieldName: "recipe image",
      });
    }
    if (existingRecipeImagePath) return normalizeStoredImagePath(existingRecipeImagePath, RECIPE_IMAGE_BUCKET);
    throw createHttpError(400, "Recipe image is required.");
  }

  async function resolveIngredientPayloads({ slug, ingredients }) {
    const resolved = [];
    for (const ingredient of ingredients) {
      let imagePath = normalizeStoredImagePath(ingredient.existing_image_path, INGREDIENT_IMAGE_BUCKET);
      if (ingredient.image_base64) {
        imagePath = await uploadImageOrThrow({
          bucket: INGREDIENT_IMAGE_BUCKET,
          folder: slug,
          fileBase64: ingredient.image_base64,
          fieldName: `ingredient image (${ingredient.name})`,
        });
      }
      if (!imagePath) throw createHttpError(400, `Image is required for ingredient "${ingredient.name}".`);

      resolved.push({
        ingredient_id: ingredient.ingredient_id,
        name: ingredient.name,
        amount_value: ingredient.amount_value,
        amount_unit: ingredient.amount_unit,
        amount_text: null,
        position: ingredient.position,
        image_path: imagePath,
      });
    }
    return resolved;
  }

  async function upsertIngredientAndGetId({ name, imagePath }) {
    const { data: existingByName, error: existingByNameError } = await supabaseAdmin
      .from("ingredients")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    if (existingByNameError && existingByNameError.code !== "PGRST116") {
      throw createHttpError(400, `Ingredient lookup failed for \"${name}\": ${existingByNameError.message}`);
    }

    if (existingByName?.id) return existingByName.id;

    const { data, error } = await supabaseAdmin
      .from("ingredients")
      .upsert({ name, image_path: imagePath }, { onConflict: "name", ignoreDuplicates: false })
      .select("id")
      .single();
    if (error || !data?.id) {
      throw createHttpError(400, `Ingredient write failed for "${name}": ${error?.message || "Unknown error"}`);
    }
    return data.id;
  }

  async function replaceRecipeChildren(recipeId, normalizedIngredients, steps, tips) {
    const { error: delRiError } = await supabaseAdmin.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (delRiError) throw createHttpError(400, `Failed to update recipe ingredients: ${delRiError.message}`);

    const { error: delStepsError } = await supabaseAdmin.from("recipe_steps").delete().eq("recipe_id", recipeId);
    if (delStepsError) throw createHttpError(400, `Failed to update recipe steps: ${delStepsError.message}`);

    const { error: delTipsError } = await supabaseAdmin.from("recipe_tips").delete().eq("recipe_id", recipeId);
    if (delTipsError) throw createHttpError(400, `Failed to update recipe tips: ${delTipsError.message}`);

    const recipeIngredientsRows = [];
    for (const item of normalizedIngredients) {
      const ingredientId = item.ingredient_id || (await upsertIngredientAndGetId({ name: item.name, imagePath: item.image_path }));
      recipeIngredientsRows.push({
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        amount_value: item.amount_value,
        amount_unit: item.amount_unit,
        amount_text: item.amount_text,
        position: item.position,
      });
    }

    if (recipeIngredientsRows.length) {
      const { error } = await supabaseAdmin.from("recipe_ingredients").insert(recipeIngredientsRows);
      if (error) throw createHttpError(400, `Failed to write recipe ingredients: ${error.message}`);
    }

    if (steps.length) {
      const { error } = await supabaseAdmin
        .from("recipe_steps")
        .insert(steps.map((step) => ({ recipe_id: recipeId, step_number: step.step_number, title: step.title, body: step.body })));
      if (error) throw createHttpError(400, `Failed to write recipe steps: ${error.message}`);
    }

    if (tips.length) {
      const { error } = await supabaseAdmin
        .from("recipe_tips")
        .insert(tips.map((tip) => ({ recipe_id: recipeId, tip: tip.tip, position: tip.position })));
      if (error) throw createHttpError(400, `Failed to write recipe tips: ${error.message}`);
    }
  }

  async function createRecipeFromRequestBody(body) {
    if (!supabaseAdmin) throw createHttpError(503, "Recipe writes are disabled.");
    const normalized = normalizeRecipeWriteInput(body);
    await ensureUniqueRecipeTitle(normalized.title);
    const categoryId = await getCategoryIdBySlugOrThrow(normalized.categorySlug);
    const slug = await ensureUniqueRecipeSlug(body.slug || normalized.title);
    const recipeImagePath = await resolveRecipeImagePath({
      slug,
      recipeImageBase64: normalized.recipeImageBase64,
      existingRecipeImagePath: normalized.existingRecipeImagePath,
    });
    const ingredientPayloads = await resolveIngredientPayloads({ slug, ingredients: normalized.ingredients });

    const { data: recipeRow, error: recipeInsertError } = await supabaseAdmin
      .from("recipes")
      .insert({
        category_id: categoryId,
        slug,
        title: normalized.title,
        subtitle: normalized.subtitle,
        description: normalized.description,
        image_path: recipeImagePath,
        prep_minutes: normalized.prepMinutes,
        cook_minutes: normalized.cookMinutes,
        serves: normalized.serves,
        is_published: normalized.isPublished,
      })
      .select("id")
      .single();

    if (recipeInsertError || !recipeRow?.id) {
      throw createHttpError(400, `Recipe creation failed: ${recipeInsertError?.message || "Unknown error"}`);
    }

    try {
      await replaceRecipeChildren(recipeRow.id, ingredientPayloads, normalized.steps, normalized.tips);
    } catch (error) {
      await supabaseAdmin.from("recipes").delete().eq("id", recipeRow.id);
      throw error;
    }

    return {
      id: recipeRow.id,
      slug,
      categorySlug: normalized.categorySlug,
      isPublished: normalized.isPublished,
    };
  }

  async function updateRecipeFromRequestBody(recipeId, body) {
    if (!supabaseAdmin) throw createHttpError(503, "Recipe writes are disabled.");

    const { data: existingRecipe, error: existingRecipeError } = await supabaseAdmin
      .from("recipes")
      .select("id, slug, image_path")
      .eq("id", recipeId)
      .maybeSingle();
    if (existingRecipeError) throw createHttpError(400, `Recipe lookup failed: ${existingRecipeError.message}`);
    if (!existingRecipe?.id) throw createHttpError(404, "Recipe not found.");

    const normalized = normalizeRecipeWriteInput(body);
    await ensureUniqueRecipeTitle(normalized.title, recipeId);
    const categoryId = await getCategoryIdBySlugOrThrow(normalized.categorySlug);
    const slug = await ensureUniqueRecipeSlug(body.slug || normalized.title, recipeId);
    const recipeImagePath = await resolveRecipeImagePath({
      slug,
      recipeImageBase64: normalized.recipeImageBase64,
      existingRecipeImagePath: normalized.existingRecipeImagePath || existingRecipe.image_path,
    });
    const ingredientPayloads = await resolveIngredientPayloads({ slug, ingredients: normalized.ingredients });

    const { error: recipeUpdateError } = await supabaseAdmin
      .from("recipes")
      .update({
        category_id: categoryId,
        slug,
        title: normalized.title,
        subtitle: normalized.subtitle,
        description: normalized.description,
        image_path: recipeImagePath,
        prep_minutes: normalized.prepMinutes,
        cook_minutes: normalized.cookMinutes,
        serves: normalized.serves,
        is_published: normalized.isPublished,
      })
      .eq("id", recipeId);
    if (recipeUpdateError) throw createHttpError(400, `Recipe update failed: ${recipeUpdateError.message}`);

    await replaceRecipeChildren(recipeId, ingredientPayloads, normalized.steps, normalized.tips);

    if (normalized.recipeImageBase64 && existingRecipe.image_path && existingRecipe.image_path !== recipeImagePath) {
      await deleteStorageObjectByPublicUrl(existingRecipe.image_path, RECIPE_IMAGE_BUCKET);
    }

    return {
      id: recipeId,
      slug,
      categorySlug: normalized.categorySlug,
      isPublished: normalized.isPublished,
    };
  }

  async function getRecipeAdminDetails(recipeId) {
    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select(
        "id, category_id, slug, title, subtitle, description, image_path, prep_minutes, cook_minutes, serves, is_published, categories(slug, title)",
      )
      .eq("id", recipeId)
      .maybeSingle();

    if (recipeError) throw createHttpError(400, `Recipe lookup failed: ${recipeError.message}`);
    if (!recipe?.id) throw createHttpError(404, "Recipe not found.");

    const [ingredientsRes, stepsRes, tipsRes] = await Promise.all([
      supabaseAdmin
        .from("recipe_ingredients")
        .select("position, amount_value, amount_unit, amount_text, ingredient_id, ingredients(name, image_path)")
        .eq("recipe_id", recipeId)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("recipe_steps")
        .select("step_number, title, body")
        .eq("recipe_id", recipeId)
        .order("step_number", { ascending: true }),
      supabaseAdmin.from("recipe_tips").select("position, tip").eq("recipe_id", recipeId).order("position", { ascending: true }),
    ]);

    if (ingredientsRes.error || stepsRes.error || tipsRes.error) {
      throw createHttpError(
        400,
        ingredientsRes.error?.message || stepsRes.error?.message || tipsRes.error?.message || "Recipe detail query failed.",
      );
    }

    const category = getRelationOne(recipe.categories);

    return {
      id: recipe.id,
      category_slug: category?.slug || "",
      category_title: category?.title || "",
      slug: recipe.slug,
      title: recipe.title,
      subtitle: recipe.subtitle || "",
      description: recipe.description,
      image_path: toDisplayImagePath(recipe.image_path, RECIPE_IMAGE_BUCKET),
      prep_minutes: recipe.prep_minutes,
      cook_minutes: recipe.cook_minutes,
      serves: recipe.serves,
      is_published: recipe.is_published,
      ingredients: (ingredientsRes.data || []).map((item) => ({
        ingredient_id: item.ingredient_id,
        name: item.ingredients?.name || "",
        image_path: toDisplayImagePath(item.ingredients?.image_path, INGREDIENT_IMAGE_BUCKET),
        amount_value: item.amount_value,
        amount_unit: item.amount_unit || "",
        amount_text: item.amount_text || null,
        position: item.position,
      })),
      steps: (stepsRes.data || []).map((step) => ({
        step_number: step.step_number,
        title: step.title || "",
        body: step.body || "",
      })),
      tips: (tipsRes.data || []).map((tip) => ({
        position: tip.position,
        tip: tip.tip || "",
      })),
    };
  }

  function mapRecipeListRows(rows) {
    return (rows || []).map((row) => {
      const categoryRelation = getRelationOne(row.categories);
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        category_slug: categoryRelation?.slug || row.category_slug || "",
        category_title: categoryRelation?.title || row.category_title || "-",
        is_published: Boolean(row.is_published),
        prep_minutes: row.prep_minutes,
        cook_minutes: row.cook_minutes,
        serves: row.serves,
        updated_at: row.updated_at,
        updated_label: formatDateLabel(row.updated_at),
      };
    });
  }

  function mapIngredientListRows(rows) {
    return (rows || []).map((row) => ({
      id: row.id,
      name: row.name,
      image_path: toDisplayImagePath(row.image_path, INGREDIENT_IMAGE_BUCKET),
      updated_at: row.updated_at,
      updated_label: formatDateLabel(row.updated_at),
    }));
  }

  async function listAdminRecipes({ search, status, category, page, pageSize }) {
    const offset = (page - 1) * pageSize;
    const to = offset + pageSize - 1;
    const hasSearch = Boolean(search);

    const applyRecipeFilters = (query) => {
      if (status === "published") query = query.eq("is_published", true);
      if (status === "draft") query = query.eq("is_published", false);
      if (category) query = query.eq("categories.slug", category);
      return query;
    };

    const baseSelect = "id, slug, title, is_published, prep_minutes, cook_minutes, serves, updated_at, categories!inner(slug, title)";

    if (!hasSearch) {
      let query = supabaseAdmin.from("recipes").select(baseSelect, { count: "exact" });
      query = applyRecipeFilters(query);
      const { data, error, count } = await query.order("updated_at", { ascending: false }).range(offset, to);
      if (error) throw createHttpError(400, `Recipe list failed: ${error.message}`);
      return {
        items: mapRecipeListRows(data),
        total: count || 0,
        searchFeedback: null,
        fuzzyFallbackUsed: false,
      };
    }

    const safe = escapeForPostgrestOr(search);
    const prefixOr = `title.ilike.${safe}%,slug.ilike.${safe}%`;
    const containsOr = `title.ilike.%${safe}%,slug.ilike.%${safe}%`;

    let prefixCountQuery = supabaseAdmin.from("recipes").select("*", { count: "exact", head: true });
    let containsCountQuery = supabaseAdmin.from("recipes").select("*", { count: "exact", head: true });
    prefixCountQuery = applyRecipeFilters(prefixCountQuery).or(prefixOr);
    containsCountQuery = applyRecipeFilters(containsCountQuery).or(containsOr);

    const [prefixCountRes, containsCountRes] = await Promise.all([prefixCountQuery, containsCountQuery]);
    if (prefixCountRes.error) throw createHttpError(400, `Recipe prefix search failed: ${prefixCountRes.error.message}`);
    if (containsCountRes.error) throw createHttpError(400, `Recipe search failed: ${containsCountRes.error.message}`);

    const prefixTotal = prefixCountRes.count || 0;
    const containsTotal = containsCountRes.count || 0;

    if (containsTotal > 0) {
      const rows = [];

      if (offset < prefixTotal) {
        const prefixFrom = offset;
        const prefixTo = Math.min(prefixTotal - 1, to);

        let prefixQuery = supabaseAdmin.from("recipes").select(baseSelect);
        prefixQuery = applyRecipeFilters(prefixQuery).or(prefixOr);
        const { data, error } = await prefixQuery.order("updated_at", { ascending: false }).range(prefixFrom, prefixTo);
        if (error) throw createHttpError(400, `Recipe prefix page failed: ${error.message}`);
        rows.push(...(data || []));

        const remaining = pageSize - rows.length;
        if (remaining > 0) {
          let containsTailQuery = supabaseAdmin.from("recipes").select(baseSelect);
          containsTailQuery = applyRecipeFilters(containsTailQuery)
            .or(containsOr)
            .not("title", "ilike", `${search}%`)
            .not("slug", "ilike", `${search}%`);
          const { data: containsTailRows, error: containsTailError } = await containsTailQuery
            .order("updated_at", { ascending: false })
            .range(0, remaining - 1);
          if (containsTailError) throw createHttpError(400, `Recipe contains search failed: ${containsTailError.message}`);
          rows.push(...(containsTailRows || []));
        }
      } else {
        const containsOffset = offset - prefixTotal;
        const containsTo = containsOffset + pageSize - 1;
        let containsQuery = supabaseAdmin.from("recipes").select(baseSelect);
        containsQuery = applyRecipeFilters(containsQuery)
          .or(containsOr)
          .not("title", "ilike", `${search}%`)
          .not("slug", "ilike", `${search}%`);
        const { data, error } = await containsQuery.order("updated_at", { ascending: false }).range(containsOffset, containsTo);
        if (error) throw createHttpError(400, `Recipe contains page failed: ${error.message}`);
        rows.push(...(data || []));
      }

      return {
        items: mapRecipeListRows(rows),
        total: containsTotal,
        searchFeedback: null,
        fuzzyFallbackUsed: false,
      };
    }

    const fuzzyFeedback = `No exact matches for "${search}".`;
    const fuzzyParams = {
      p_search: search,
      p_status: status,
      p_category_slug: category || null,
      p_limit: pageSize,
      p_offset: offset,
    };

    const [fuzzyRowsRes, fuzzyCountRes] = await Promise.all([
      supabaseAdmin.rpc("admin_search_recipes_fuzzy", fuzzyParams),
      supabaseAdmin.rpc("admin_count_recipes_fuzzy", {
        p_search: search,
        p_status: status,
        p_category_slug: category || null,
      }),
    ]);

    if (fuzzyRowsRes.error || fuzzyCountRes.error) {
      const code = fuzzyRowsRes.error?.code || fuzzyCountRes.error?.code || "";
      if (code === "PGRST202") {
        return {
          items: [],
          total: 0,
          searchFeedback: `${fuzzyFeedback} Fuzzy helper is not deployed yet.`,
          fuzzyFallbackUsed: false,
        };
      }
      throw createHttpError(
        400,
        `Recipe fuzzy search failed: ${fuzzyRowsRes.error?.message || fuzzyCountRes.error?.message || "Unknown error"}`,
      );
    }

    const fuzzyRows = fuzzyRowsRes.data || [];
    const fuzzyTotal = Number(fuzzyCountRes.data || 0);
    return {
      items: mapRecipeListRows(fuzzyRows),
      total: fuzzyTotal,
      searchFeedback: fuzzyRows.length > 0 ? `${fuzzyFeedback} Showing closest matches.` : fuzzyFeedback,
      fuzzyFallbackUsed: fuzzyRows.length > 0,
    };
  }

  async function listAdminIngredients({ search, page, pageSize }) {
    const offset = (page - 1) * pageSize;
    const to = offset + pageSize - 1;
    const hasSearch = Boolean(search);

    let rows = [];
    let total = 0;
    let searchFeedback = null;
    let fuzzyFallbackUsed = false;

    if (!hasSearch) {
      const { data, error, count } = await supabaseAdmin
        .from("ingredients")
        .select("id, name, image_path, updated_at", { count: "exact" })
        .order("name")
        .range(offset, to);
      if (error) throw createHttpError(400, `Ingredient list failed: ${error.message}`);
      rows = data || [];
      total = count || 0;
    } else {
      const prefixPattern = `${search}%`;
      const containsPattern = `%${search}%`;

      const [prefixCountRes, containsCountRes] = await Promise.all([
        supabaseAdmin.from("ingredients").select("*", { count: "exact", head: true }).ilike("name", prefixPattern),
        supabaseAdmin.from("ingredients").select("*", { count: "exact", head: true }).ilike("name", containsPattern),
      ]);

      if (prefixCountRes.error) throw createHttpError(400, `Ingredient prefix search failed: ${prefixCountRes.error.message}`);
      if (containsCountRes.error) throw createHttpError(400, `Ingredient search failed: ${containsCountRes.error.message}`);

      const prefixTotal = prefixCountRes.count || 0;
      const containsTotal = containsCountRes.count || 0;

      if (containsTotal > 0) {
        const merged = [];
        if (offset < prefixTotal) {
          const prefixFrom = offset;
          const prefixTo = Math.min(prefixTotal - 1, to);
          const { data: prefixRows, error: prefixRowsError } = await supabaseAdmin
            .from("ingredients")
            .select("id, name, image_path, updated_at")
            .ilike("name", prefixPattern)
            .order("name")
            .range(prefixFrom, prefixTo);
          if (prefixRowsError) throw createHttpError(400, `Ingredient prefix page failed: ${prefixRowsError.message}`);
          merged.push(...(prefixRows || []));

          const remaining = pageSize - merged.length;
          if (remaining > 0) {
            const { data: containsTailRows, error: containsTailError } = await supabaseAdmin
              .from("ingredients")
              .select("id, name, image_path, updated_at")
              .ilike("name", containsPattern)
              .not("name", "ilike", prefixPattern)
              .order("name")
              .range(0, remaining - 1);
            if (containsTailError) throw createHttpError(400, `Ingredient contains search failed: ${containsTailError.message}`);
            merged.push(...(containsTailRows || []));
          }
        } else {
          const containsOffset = offset - prefixTotal;
          const containsTo = containsOffset + pageSize - 1;
          const { data: containsRows, error: containsRowsError } = await supabaseAdmin
            .from("ingredients")
            .select("id, name, image_path, updated_at")
            .ilike("name", containsPattern)
            .not("name", "ilike", prefixPattern)
            .order("name")
            .range(containsOffset, containsTo);
          if (containsRowsError) throw createHttpError(400, `Ingredient contains page failed: ${containsRowsError.message}`);
          merged.push(...(containsRows || []));
        }

        rows = merged;
        total = containsTotal;
      } else {
        const fuzzyFeedback = `No exact matches for "${search}".`;
        const [fuzzyRowsRes, fuzzyCountRes] = await Promise.all([
          supabaseAdmin.rpc("admin_search_ingredients_fuzzy", {
            p_search: search,
            p_limit: pageSize,
            p_offset: offset,
          }),
          supabaseAdmin.rpc("admin_count_ingredients_fuzzy", {
            p_search: search,
          }),
        ]);

        if (fuzzyRowsRes.error || fuzzyCountRes.error) {
          const code = fuzzyRowsRes.error?.code || fuzzyCountRes.error?.code || "";
          if (code === "PGRST202") {
            rows = [];
            total = 0;
            searchFeedback = `${fuzzyFeedback} Fuzzy helper is not deployed yet.`;
          } else {
            throw createHttpError(
              400,
              `Ingredient fuzzy search failed: ${fuzzyRowsRes.error?.message || fuzzyCountRes.error?.message || "Unknown error"}`,
            );
          }
        } else {
          rows = fuzzyRowsRes.data || [];
          total = Number(fuzzyCountRes.data || 0);
          searchFeedback = rows.length > 0 ? `${fuzzyFeedback} Showing closest matches.` : fuzzyFeedback;
          fuzzyFallbackUsed = rows.length > 0;
        }
      }
    }

    const ingredientIds = rows.map((item) => item.id);
    const usageMap = new Map();
    if (ingredientIds.length > 0) {
      const { data: usageRows, error: usageError } = await supabaseAdmin
        .from("recipe_ingredients")
        .select("ingredient_id")
        .in("ingredient_id", ingredientIds);
      if (usageError) throw createHttpError(400, `Ingredient usage lookup failed: ${usageError.message}`);
      for (const row of usageRows || []) {
        usageMap.set(row.ingredient_id, (usageMap.get(row.ingredient_id) || 0) + 1);
      }
    }

    const items = mapIngredientListRows(rows).map((row) => ({
      ...row,
      recipe_usage_count: usageMap.get(row.id) || 0,
    }));

    return {
      items,
      total,
      searchFeedback,
      fuzzyFallbackUsed,
    };
  }

  async function createIngredientFromRequestBody(body) {
    const name = String(body.name || "").trim();
    const imageBase64 = String(body.image_base64 || "").trim();
    if (!name) throw createHttpError(400, "Ingredient name is required.");
    if (!imageBase64) throw createHttpError(400, "Ingredient image is required.");

    const imagePath = await uploadImageOrThrow({
      bucket: INGREDIENT_IMAGE_BUCKET,
      folder: "ingredients",
      fileBase64: imageBase64,
      fieldName: `ingredient image (${name})`,
    });

    const { data, error } = await supabaseAdmin
      .from("ingredients")
      .insert({ name, image_path: imagePath })
      .select("id, name, image_path")
      .single();

    if (error) {
      if (String(error.code || "") === "23505") throw createHttpError(409, "Ingredient name already exists.");
      throw createHttpError(400, `Ingredient creation failed: ${error.message}`);
    }
    return data;
  }

  async function updateIngredientFromRequestBody(ingredientId, body) {
    const name = String(body.name || "").trim();
    const imageBase64 = String(body.image_base64 || "").trim();
    const existingImagePathBody = String(body.existing_image_path || "").trim() || null;

    if (!name) throw createHttpError(400, "Ingredient name is required.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("ingredients")
      .select("id, image_path")
      .eq("id", ingredientId)
      .maybeSingle();
    if (existingError) throw createHttpError(400, `Ingredient lookup failed: ${existingError.message}`);
    if (!existing?.id) throw createHttpError(404, "Ingredient not found.");

    let imagePath = normalizeStoredImagePath(existingImagePathBody || existing.image_path, INGREDIENT_IMAGE_BUCKET);
    if (imageBase64) {
      imagePath = await uploadImageOrThrow({
        bucket: INGREDIENT_IMAGE_BUCKET,
        folder: "ingredients",
        fileBase64: imageBase64,
        fieldName: `ingredient image (${name})`,
      });
    }

    if (!imagePath) throw createHttpError(400, "Ingredient image is required.");

    const { data, error } = await supabaseAdmin
      .from("ingredients")
      .update({ name, image_path: imagePath })
      .eq("id", ingredientId)
      .select("id, name, image_path")
      .single();

    if (error) {
      if (String(error.code || "") === "23505") throw createHttpError(409, "Ingredient name already exists.");
      throw createHttpError(400, `Ingredient update failed: ${error.message}`);
    }

    if (imageBase64 && existing.image_path && existing.image_path !== imagePath) {
      await deleteStorageObjectByPublicUrl(existing.image_path, INGREDIENT_IMAGE_BUCKET);
    }

    return data;
  }

  function handleApiError(res, error, fallbackMessage) {
    const status = error?.status || 500;
    if (status >= 500) console.error(fallbackMessage, error?.message || error);
    return res.status(status).json({ error: error?.message || fallbackMessage });
  }

  async function writeAdminAuditLog({ req, action, entityType, entityId = null, metadata = {} }) {
    if (!supabaseAdmin) return;
    const payload = {
      actor_user_id: req.authUser?.id || null,
      actor_email: req.authUser?.email || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    };
    const { error } = await supabaseAdmin.from("admin_audit_logs").insert(payload);
    if (error) {
      console.warn("Admin audit log skipped:", error.message);
    }
  }

  async function getAdminDashboardCounts() {
    if (!supabaseAdmin) {
      return { categories: 0, recipes: 0, publishedRecipes: 0, draftRecipes: 0, ingredients: 0 };
    }

    const [categoriesRes, recipesRes, publishedRecipesRes, draftRecipesRes, ingredientsRes] = await Promise.all([
      supabaseAdmin.from("categories").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("recipes").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("recipes").select("*", { count: "exact", head: true }).eq("is_published", true),
      supabaseAdmin.from("recipes").select("*", { count: "exact", head: true }).eq("is_published", false),
      supabaseAdmin.from("ingredients").select("*", { count: "exact", head: true }),
    ]);

    if (categoriesRes.error || recipesRes.error || publishedRecipesRes.error || draftRecipesRes.error || ingredientsRes.error) {
      console.error(
        "Admin dashboard count query failed:",
        categoriesRes.error?.message ||
          recipesRes.error?.message ||
          publishedRecipesRes.error?.message ||
          draftRecipesRes.error?.message ||
          ingredientsRes.error?.message,
      );
      return { categories: 0, recipes: 0, publishedRecipes: 0, draftRecipes: 0, ingredients: 0 };
    }

    return {
      categories: categoriesRes.count || 0,
      recipes: recipesRes.count || 0,
      publishedRecipes: publishedRecipesRes.count || 0,
      draftRecipes: draftRecipesRes.count || 0,
      ingredients: ingredientsRes.count || 0,
    };
  }

  return {
    parsePagination,
    createPaginationViewModel,
    renderAdminPage,
    requireSameOrigin,
    deleteStorageObjectByPublicUrl,
    getRecipeAdminDetails,
    listAdminRecipes,
    listAdminIngredients,
    createRecipeFromRequestBody,
    updateRecipeFromRequestBody,
    createIngredientFromRequestBody,
    updateIngredientFromRequestBody,
    toDisplayImagePath,
    handleApiError,
    writeAdminAuditLog,
    getAdminDashboardCounts,
  };
}
