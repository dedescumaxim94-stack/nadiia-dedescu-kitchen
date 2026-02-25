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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let createClient = null;
try {
  ({ createClient } = await import("@supabase/supabase-js"));
} catch {
  console.log("@supabase/supabase-js is not installed.");
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
  throw new Error("Supabase read access is required. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
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
