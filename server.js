import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import expressEjsLayouts from "express-ejs-layouts";
import { registerAuthRoutes } from "./src/routes/auth.js";
import { registerAdminPageRoutes } from "./src/routes/admin-pages.js";
import { registerAdminApiRoutes } from "./src/routes/admin-api.js";
import { registerPublicRoutes } from "./src/routes/public.js";
import { createAuthMiddleware } from "./src/middleware/auth.js";
import { createPublicContentService } from "./src/services/public-content.js";
import { createAdminService } from "./src/services/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AUTH_COOKIE_NAME = "ndk_admin_token";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const CSRF_COOKIE_NAME = "ndk_csrf_token";
const CSRF_COOKIE_MAX_AGE_SECONDS = AUTH_COOKIE_MAX_AGE_SECONDS;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

app.use((req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(express.json({ limit: "60mb" }));

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

const authMiddleware = createAuthMiddleware({
  supabaseAuth,
  supabaseAdmin,
  authCookieName: AUTH_COOKIE_NAME,
  authCookieMaxAgeSeconds: AUTH_COOKIE_MAX_AGE_SECONDS,
  csrfCookieName: CSRF_COOKIE_NAME,
  csrfCookieMaxAgeSeconds: CSRF_COOKIE_MAX_AGE_SECONDS,
  loginRateLimitWindowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  loginRateLimitMaxAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  nodeEnv: process.env.NODE_ENV,
});

const publicContentService = createPublicContentService({
  supabase,
  supabaseReadEnabled,
  fallbackCategoryTitles,
  fallbackRecipesByCategory,
  fallbackRecipeDetails,
});

const adminService = createAdminService({
  supabaseAdmin,
  supabaseUrl,
});

app.use(authMiddleware.attachCsrfToken);
app.use(authMiddleware.attachAuthContext);

registerAuthRoutes(app, {
  supabaseAuth,
  supabaseAdmin,
  getSafeAdminRedirect: authMiddleware.getSafeAdminRedirect,
  getLoginRateLimitEntry: authMiddleware.getLoginRateLimitEntry,
  getLoginRateLimitError: authMiddleware.getLoginRateLimitError,
  hasValidCsrfToken: authMiddleware.hasValidCsrfToken,
  registerFailedLoginAttempt: authMiddleware.registerFailedLoginAttempt,
  isAdminUser: authMiddleware.isAdminUser,
  clearLoginRateLimit: authMiddleware.clearLoginRateLimit,
  setAuthCookie: authMiddleware.setAuthCookie,
  clearAuthCookie: authMiddleware.clearAuthCookie,
});

registerAdminPageRoutes(app, {
  requireAdminPage: authMiddleware.requireAdminPage,
  supabaseAdmin,
  getAdminDashboardCounts: adminService.getAdminDashboardCounts,
  renderAdminPage: adminService.renderAdminPage,
  parsePagination: adminService.parsePagination,
  listAdminRecipes: adminService.listAdminRecipes,
  getFormCategories: publicContentService.getFormCategories,
  createPaginationViewModel: adminService.createPaginationViewModel,
  getRecipeAdminDetails: adminService.getRecipeAdminDetails,
  listAdminIngredients: adminService.listAdminIngredients,
});

registerAdminApiRoutes(app, {
  requireAdminApi: authMiddleware.requireAdminApi,
  requireSameOrigin: adminService.requireSameOrigin,
  requireCsrfApi: authMiddleware.requireCsrfApi,
  supabaseAdmin,
  parsePagination: adminService.parsePagination,
  listAdminRecipes: adminService.listAdminRecipes,
  handleApiError: adminService.handleApiError,
  createRecipeFromRequestBody: adminService.createRecipeFromRequestBody,
  writeAdminAuditLog: adminService.writeAdminAuditLog,
  getRecipeAdminDetails: adminService.getRecipeAdminDetails,
  updateRecipeFromRequestBody: adminService.updateRecipeFromRequestBody,
  deleteStorageObjectByPublicUrl: adminService.deleteStorageObjectByPublicUrl,
  listAdminIngredients: adminService.listAdminIngredients,
  createIngredientFromRequestBody: adminService.createIngredientFromRequestBody,
  updateIngredientFromRequestBody: adminService.updateIngredientFromRequestBody,
});

registerPublicRoutes(app, {
  getRecipeDetails: publicContentService.getRecipeDetails,
  getCategoryBySlug: publicContentService.getCategoryBySlug,
  getRecipesByCategory: publicContentService.getRecipesByCategory,
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
