import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import expressEjsLayouts from "express-ejs-layouts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AUTH_COOKIE_NAME = "ndk_admin_token";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// Disable browser caching while developing locally.
app.use((req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(express.json({ limit: "60mb" }));

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressEjsLayouts);
app.set("layout", "layout");

const fallbackCategoryTitles = {
  breakfast: "Breakfast Recipes",
  lunch: "Lunch Recipes",
  dinner: "Dinner Recipes",
  dessert: "Dessert Recipes",
  "set-menu": "Set Menu Recipes",
  "new-recipes": "New Recipe Recipes",
};

const fallbackRecipesByCategory = {
  breakfast: [
    {
      title: "Ricotta Pancakes",
      link: "/categories/breakfast/ricotta-pancakes",
      image: "/src/images/breakfast/Ricotta-Pancakes.png",
      alt: "Ricotta Pancakes",
      description: "A classic gourmet dish featuring cheese pancakes with a soft, creamy texture...",
      time: "25 min",
      timeISO: "PT25M",
    },
  ],
  lunch: [],
  dinner: [],
  dessert: [],
  "set-menu": [],
  "new-recipes": [],
};

const fallbackRecipeDetails = {
  "breakfast/ricotta-pancakes": {
    title: "Ricotta Pancakes",
    subtitle: "Gourmet Ricotta Pancakes",
    description:
      "Delicate and airy ricotta pancakes with a soft, creamy texture, inspired by the French love for refined desserts. Light, fragrant, and perfect for breakfast or a sweet moment any time of day. Delicious on their own or served with honey, berries, or sour cream. 🤍",
    image: "/src/images/breakfast/Ricotta-Pancakes.png",
    activePage: "breakfast",
    recipePageCSS: true,
    serves: 4,
    prepMinutes: 10,
    cookMinutes: 15,
    meta: ["⏱ 10 min Prep", "🔥 15 min Cook", "👥 Serves 4"],
    ingredients: [
      { name: "Ricotta", image: "/src/images/ingredients/ricota-cheese.png", amountValue: 1, amountUnit: "cup", amount: "1 cup" },
      { name: "Eggs", image: "/src/images/ingredients/egg.png", amountValue: 1, amountUnit: "large", amount: "1 large" },
      { name: "Sugar", image: "/src/images/ingredients/sugar.png", amountValue: 1.5, amountUnit: "tbsp", amount: "1.5 tbsp" },
      { name: "Vanilla Sugar", image: "/src/images/ingredients/vanilla-sugar.png", amountValue: 1, amountUnit: "tsp", amount: "1 tsp" },
      { name: "All-purpose Flour", image: "/src/images/ingredients/all-purpose-flour.png", amountValue: 4, amountUnit: "tbsp", amount: "4 tbsp" },
      { name: "Baking Powder", image: "/src/images/ingredients/baking-powder.png", amountValue: 0.5, amountUnit: "tsp", amount: "1/2 tsp" },
      { name: "Lemon", image: "/src/images/ingredients/lemon.png", amountValue: 0.25, amountUnit: "tsp", amount: "1/4 tsp" },
    ],
    instructions: [
      {
        title: "Mix Ingredients:",
        text: "Combine all ingredients in a bowl and mix until smooth. If using lemon, add the zest and juice of 1/4 lemon.",
      },
      { title: "Heat the Pan:", text: "Heat oil in a non-stick frying pan over medium heat. Lightly moisten your hands with water." },
      {
        title: "Shape:",
        text: "Shape small balls from the ricotta mixture and place them in the pan, gently flattening and shaping them with a spatula if needed.",
      },
      {
        title: "Cook:",
        text: "Fry for a few minutes until golden. Flip, gently press with a spatula, and cook the other side until golden.",
      },
      {
        title: "Serve:",
        text: "Transfer the pancakes to a plate lined with paper towels. Serve with sour cream (or Greek yogurt), jam, honey, or sweetened condensed milk.",
      },
      { title: "Enjoy:", text: "Enjoy your delicious breakfast! ☀️🥞" },
    ],
    tips: [
      "Don’t chase a perfect shape — it’s better for the pancakes to be tender and flavorful than overloaded with flour.",
      "Shaping the pancakes with slightly wet hands makes the process much easier.",
      "Cook the pancakes over medium heat, not high. Otherwise, they may brown too quickly on the outside without cooking through.",
    ],
  },
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let createClient = null;
try {
  ({ createClient } = await import("@supabase/supabase-js"));
} catch {
  console.log("@supabase/supabase-js is not installed. Using static fallback data.");
}

const supabaseReadKey = supabaseAnonKey || supabaseServiceRoleKey;
const supabaseReadEnabled = Boolean(createClient && supabaseUrl && supabaseReadKey);
const supabaseWriteEnabled = Boolean(createClient && supabaseUrl && supabaseServiceRoleKey);
const supabaseAuthEnabled = Boolean(createClient && supabaseUrl && supabaseAnonKey);

const supabase = supabaseReadEnabled
  ? createClient(supabaseUrl, supabaseReadKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const supabaseAuth = supabaseAuthEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const supabaseAdmin = supabaseWriteEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

if (!supabaseReadEnabled) {
  console.log("Supabase read env vars not set or Supabase client missing. Using static fallback data.");
}

if (!supabaseWriteEnabled) {
  console.log("Supabase service role key missing. Recipe write API is disabled.");
}

if (!supabaseAuthEnabled) {
  console.log("Supabase anon key missing. Auth routes are disabled.");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const eqIndex = pair.indexOf("=");
      if (eqIndex === -1) return acc;
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function getAuthTokenFromRequest(req) {
  return parseCookies(req.headers.cookie || "")[AUTH_COOKIE_NAME] || null;
}

function setAuthCookie(res, token) {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearAuthCookie(res) {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

async function getAuthenticatedUser(token) {
  if (!supabaseAuth || !token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function isAdminUser(userId) {
  if (!supabaseAdmin || !userId) return false;
  const { data, error } = await supabaseAdmin.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("Admin lookup failed:", error.message);
    return false;
  }
  return Boolean(data?.user_id);
}

function getSafeAdminRedirect(nextParam) {
  if (typeof nextParam !== "string") return "/admin";
  if (!nextParam.startsWith("/admin")) return "/admin";
  return nextParam;
}

async function attachAuthContext(req, res, next) {
  res.locals.auth = {
    isAuthenticated: false,
    isAdmin: false,
    email: null,
  };

  const token = getAuthTokenFromRequest(req);
  if (!token) return next();

  const user = await getAuthenticatedUser(token);
  if (!user) {
    clearAuthCookie(res);
    return next();
  }

  const isAdmin = await isAdminUser(user.id);
  res.locals.auth = {
    isAuthenticated: true,
    isAdmin,
    email: user.email || null,
  };
  req.authToken = token;
  req.authUser = user;
  req.isAdmin = isAdmin;
  return next();
}

function requireAdminPage(req, res, next) {
  if (!res.locals.auth?.isAuthenticated) {
    const nextPath = encodeURIComponent(req.originalUrl || "/admin");
    return res.redirect(`/login?next=${nextPath}`);
  }
  if (!res.locals.auth?.isAdmin) {
    return res.status(403).render("auth/login", {
      title: "Login",
      activePage: "login",
      loginPageCSS: true,
      error: "This account is not authorized for admin access.",
      nextPath: "/admin",
    });
  }
  return next();
}

function requireAdminApi(req, res, next) {
  if (!res.locals.auth?.isAuthenticated) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!res.locals.auth?.isAdmin) {
    return res.status(403).json({ error: "Admin access required." });
  }
  return next();
}

async function getAdminDashboardCounts() {
  if (!supabaseAdmin) {
    return { categories: 0, recipes: 0, draftRecipes: 0, ingredients: 0 };
  }

  const [categoriesRes, recipesRes, draftRecipesRes, ingredientsRes] = await Promise.all([
    supabaseAdmin.from("categories").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("recipes").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("recipes").select("*", { count: "exact", head: true }).eq("is_published", false),
    supabaseAdmin.from("ingredients").select("*", { count: "exact", head: true }),
  ]);

  if (categoriesRes.error || recipesRes.error || draftRecipesRes.error || ingredientsRes.error) {
    console.error(
      "Admin dashboard count query failed:",
      categoriesRes.error?.message || recipesRes.error?.message || draftRecipesRes.error?.message || ingredientsRes.error?.message
    );
    return { categories: 0, recipes: 0, draftRecipes: 0, ingredients: 0 };
  }

  return {
    categories: categoriesRes.count || 0,
    recipes: recipesRes.count || 0,
    draftRecipes: draftRecipesRes.count || 0,
    ingredients: ingredientsRes.count || 0,
  };
}

app.use(attachAuthContext);

function toSlug(value = "") {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

  const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);
  return publicUrlData.publicUrl;
}

async function getCategoryBySlug(categorySlug) {
  if (!supabaseReadEnabled) {
    const title = fallbackCategoryTitles[categorySlug];
    return title ? { slug: categorySlug, title } : null;
  }

  const { data, error } = await supabase.from("categories").select("slug, title").eq("slug", categorySlug).maybeSingle();
  if (error) {
    console.error("Supabase category lookup failed:", error.message);
    const title = fallbackCategoryTitles[categorySlug];
    return title ? { slug: categorySlug, title } : null;
  }
  return data;
}

async function getFormCategories() {
  if (!supabaseReadEnabled) {
    return Object.entries(fallbackCategoryTitles)
      .filter(([slug]) => slug !== "new-recipes")
      .map(([slug, title]) => ({ slug, title }));
  }

  const { data, error } = await supabase.from("categories").select("slug, title").order("title");
  if (error) {
    console.error("Supabase categories list failed:", error.message);
    return Object.entries(fallbackCategoryTitles)
      .filter(([slug]) => slug !== "new-recipes")
      .map(([slug, title]) => ({ slug, title }));
  }

  return (data || []).filter((c) => c.slug !== "new-recipes");
}

async function getRecipesByCategory(categorySlug) {
  if (!supabaseReadEnabled) return fallbackRecipesByCategory[categorySlug] || [];

  const { data, error } = await supabase
    .from("recipes")
    .select("slug, title, description, image_path, prep_minutes, cook_minutes, categories!inner(slug)")
    .eq("categories.slug", categorySlug)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase recipes list failed:", error.message);
    return fallbackRecipesByCategory[categorySlug] || [];
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
  if (!supabaseReadEnabled) return fallbackRecipeDetails[`${categorySlug}/${recipeSlug}`] || null;

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id, title, subtitle, description, image_path, prep_minutes, cook_minutes, serves, categories!inner(slug)")
    .eq("categories.slug", categorySlug)
    .eq("slug", recipeSlug)
    .eq("is_published", true)
    .maybeSingle();

  if (recipeError) {
    console.error("Supabase recipe detail failed:", recipeError.message);
    return fallbackRecipeDetails[`${categorySlug}/${recipeSlug}`] || null;
  }

  if (!recipe) return null;

  const [ingredientsRes, stepsRes, tipsRes] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("position, amount_text, amount_value, amount_unit, ingredients(name, image_path)")
      .eq("recipe_id", recipe.id)
      .order("position", { ascending: true }),
    supabase.from("recipe_steps").select("step_number, title, body").eq("recipe_id", recipe.id).order("step_number", { ascending: true }),
    supabase.from("recipe_tips").select("position, tip").eq("recipe_id", recipe.id).order("position", { ascending: true }),
  ]);

  if (ingredientsRes.error || stepsRes.error || tipsRes.error) {
    console.error("Supabase nested detail failed:", ingredientsRes.error?.message || stepsRes.error?.message || tipsRes.error?.message);
    return fallbackRecipeDetails[`${categorySlug}/${recipeSlug}`] || null;
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

app.get("/login", (req, res) => {
  if (res.locals.auth?.isAdmin) return res.redirect("/admin");
  const nextPath = getSafeAdminRedirect(req.query.next);
  return res.render("auth/login", {
    title: "Login",
    activePage: "login",
    loginPageCSS: true,
    error: null,
    nextPath,
  });
});

app.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const nextPath = getSafeAdminRedirect(req.body.next);

  if (!supabaseAuth || !supabaseAdmin) {
    return res.status(503).render("auth/login", {
      title: "Login",
      activePage: "login",
      loginPageCSS: true,
      error: "Auth is not configured. Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
      nextPath,
    });
  }

  if (!email || !password) {
    return res.status(400).render("auth/login", {
      title: "Login",
      activePage: "login",
      loginPageCSS: true,
      error: "Email and password are required.",
      nextPath,
    });
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data?.user || !data?.session?.access_token) {
    return res.status(401).render("auth/login", {
      title: "Login",
      activePage: "login",
      loginPageCSS: true,
      error: "Invalid email or password.",
      nextPath,
    });
  }

  const isAdmin = await isAdminUser(data.user.id);
  if (!isAdmin) {
    return res.status(403).render("auth/login", {
      title: "Login",
      activePage: "login",
      loginPageCSS: true,
      error: "This account is not authorized for admin access.",
      nextPath,
    });
  }

  setAuthCookie(res, data.session.access_token);
  return res.redirect(nextPath);
});

app.post("/logout", (req, res) => {
  clearAuthCookie(res);
  return res.redirect("/login");
});

app.get("/admin", requireAdminPage, async (req, res) => {
  const counts = await getAdminDashboardCounts();
  return res.render("admin/dashboard", {
    title: "Admin Dashboard",
    activePage: "admin",
    adminPageCSS: true,
    counts,
  });
});

// Home route
app.get("/", (req, res) => {
  res.render("index", {
    title: "Categories",
    activePage: "home",
  });
});

app.get("/categories/new-recipes", requireAdminPage, async (req, res) => {
  const categories = await getFormCategories();
  res.render("categories/new-recipe", {
    title: "Add New Recipe",
    activePage: "new-recipes",
    newRecipePageCSS: true,
    newRecipePageJS: true,
    categories,
  });
});

// Recipe detail route
app.get("/categories/:category/:recipe", async (req, res) => {
  const { category, recipe } = req.params;
  const recipeData = await getRecipeDetails(category, recipe);
  if (!recipeData) return res.status(404).send("Recipe not found");
  return res.render("categories/recipe", recipeData);
});

// Dynamic category routes
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

app.post("/api/recipes", requireAdminApi, async (req, res) => {
  if (!supabaseWriteEnabled || !supabaseAdmin) {
    return res.status(503).json({
      error: "Recipe writes are disabled. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const category = String(req.body.category || "").trim();
  const title = String(req.body.title || "").trim();
  const slug = toSlug(req.body.slug || title);
  const description = String(req.body.description || "").trim();
  const subtitle = String(req.body.subtitle || "").trim() || null;
  const recipeImageBase64 = String(req.body.recipe_image_base64 || "").trim();

  if (!category || !title || !slug || !description || !recipeImageBase64) {
    return res.status(400).json({
      error: "category, title, slug/title, description, and recipe image are required.",
    });
  }

  const rawIngredients = Array.isArray(req.body.ingredients)
    ? req.body.ingredients
        .map((item, index) => ({
          name: String(item.name || "").trim(),
          image_base64: String(item.image_base64 || "").trim(),
          amount_value: parseNumberOrNull(item.amount_value),
          amount_unit: String(item.amount_unit || "").trim() || null,
          position: index,
        }))
        .filter((item) => item.name.length > 0)
    : [];

  if (rawIngredients.length === 0) {
    return res.status(400).json({ error: "At least one ingredient is required." });
  }

  for (const ingredient of rawIngredients) {
    if (!ingredient.image_base64) {
      return res.status(400).json({ error: `Image is required for ingredient "${ingredient.name}".` });
    }
    if (ingredient.amount_value === null || !ingredient.amount_unit) {
      return res.status(400).json({ error: `Amount value and unit are required for ingredient "${ingredient.name}".` });
    }
  }

  const steps = Array.isArray(req.body.steps)
    ? req.body.steps
        .map((item, index) => ({
          step_number: index + 1,
          title: String(item.title || "").trim() || null,
          body: String(item.body || "").trim(),
        }))
        .filter((item) => item.body.length > 0)
    : [];

  if (steps.length === 0) {
    return res.status(400).json({ error: "At least one instruction step is required." });
  }

  const tips = Array.isArray(req.body.tips)
    ? req.body.tips
        .map((item, index) => ({
          tip: String(item.tip || "").trim(),
          position: index,
        }))
        .filter((item) => item.tip.length > 0)
    : [];

  let recipeImagePath = null;
  try {
    recipeImagePath = await uploadImageOrThrow({
      bucket: "recipe-images",
      folder: slug,
      fileBase64: recipeImageBase64,
      fieldName: "recipe image",
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Recipe image upload failed." });
  }

  const ingredients = [];
  try {
    for (const ingredient of rawIngredients) {
      const ingredientImagePath = await uploadImageOrThrow({
        bucket: "ingredient-images",
        folder: slug,
        fileBase64: ingredient.image_base64,
        fieldName: `ingredient image (${ingredient.name})`,
      });
      ingredients.push({
        name: ingredient.name,
        image_path: ingredientImagePath,
        amount_value: ingredient.amount_value,
        amount_unit: ingredient.amount_unit,
        amount_text: null,
        position: ingredient.position,
      });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message || "Ingredient image upload failed." });
  }

  const payload = {
    p_category_slug: category,
    p_slug: slug,
    p_title: title,
    p_subtitle: subtitle,
    p_description: description,
    p_image_path: recipeImagePath,
    p_prep_minutes: parseNumberOrNull(req.body.prep_minutes),
    p_cook_minutes: parseNumberOrNull(req.body.cook_minutes),
    p_serves: parseNumberOrNull(req.body.serves),
    p_is_published: Boolean(req.body.is_published),
    p_ingredients: ingredients,
    p_steps: steps,
    p_tips: tips,
  };

  const { data, error } = await supabaseAdmin.rpc("create_recipe_with_details", payload);
  if (error) {
    console.error("Recipe creation failed:", error.message);
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    id: data,
    slug,
    link: `/categories/${category}/${slug}`,
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
