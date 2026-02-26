import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAuthMiddleware } from "../src/middleware/auth.js";
import { registerAdminApiRoutes } from "../src/routes/admin-api.js";

function createAuthForTests() {
  return createAuthMiddleware({
    supabaseAuth: null,
    supabaseAdmin: null,
    authCookieName: "ndk_admin_token",
    authCookieMaxAgeSeconds: 60,
    csrfCookieName: "ndk_csrf_token",
    csrfCookieMaxAgeSeconds: 60,
    loginRateLimitWindowMs: 1000,
    loginRateLimitMaxAttempts: 3,
    nodeEnv: "test",
  });
}

function createMockRes() {
  const res = {
    locals: {},
    statusCode: 200,
    redirectedTo: null,
    jsonBody: null,
    rendered: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
    send(payload) {
      this.sentBody = payload;
      return this;
    },
    render(view, model) {
      this.rendered = { view, model };
      return this;
    },
  };
  return res;
}

function createMockApiApp() {
  const getRoutes = new Map();
  const patchRoutes = new Map();
  const deleteRoutes = new Map();
  return {
    getRoutes,
    patchRoutes,
    deleteRoutes,
    get(path, ...handlers) {
      getRoutes.set(path, handlers);
    },
    post() {},
    delete(path, ...handlers) {
      deleteRoutes.set(path, handlers);
    },
    patch(path, ...handlers) {
      patchRoutes.set(path, handlers);
    },
  };
}

async function runHandlers(handlers, req, res) {
  const invoke = async (index) => {
    if (index >= handlers.length) return;
    await handlers[index](req, res, () => invoke(index + 1));
  };
  await invoke(0);
}

function createSupabaseAdminRecipeStub(recipeState) {
  return {
    from(tableName) {
      assert.equal(tableName, "recipes");
      const state = {
        idFilter: null,
        updatePayload: null,
      };

      return {
        select() {
          return this;
        },
        eq(column, value) {
          if (column === "id") state.idFilter = value;
          return this;
        },
        maybeSingle: async () => {
          if (state.idFilter !== recipeState.id) return { data: null, error: null };
          return {
            data: { id: recipeState.id, is_published: recipeState.is_published },
            error: null,
          };
        },
        update(payload) {
          state.updatePayload = payload;
          return this;
        },
        single: async () => {
          if (state.idFilter !== recipeState.id) {
            return { data: null, error: { message: "Recipe not found." } };
          }
          recipeState.is_published = Boolean(state.updatePayload?.is_published);
          return {
            data: { id: recipeState.id, is_published: recipeState.is_published },
            error: null,
          };
        },
      };
    },
  };
}

function createSupabaseAdminIngredientConflictStub({ ingredientId, ingredientName, usageCount }) {
  return {
    from(tableName) {
      if (tableName === "recipe_ingredients") {
        return {
          select() {
            return this;
          },
          eq(column, value) {
            assert.equal(column, "ingredient_id");
            assert.equal(value, ingredientId);
            return Promise.resolve({ count: usageCount, error: null });
          },
        };
      }

      if (tableName === "ingredients") {
        return {
          select() {
            return this;
          },
          eq(column, value) {
            assert.equal(column, "id");
            assert.equal(value, ingredientId);
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: ingredientId,
              name: ingredientName,
              image_path: "ingredients/mock.png",
            },
            error: null,
          }),
          delete() {
            throw new Error("Delete should not be reached for in-use ingredient.");
          },
        };
      }

      throw new Error(`Unexpected table: ${tableName}`);
    },
  };
}

describe("Admin regression skeleton", () => {
  test("smoke: test runner is configured", () => {
    assert.equal(typeof process.version, "string");
  });

  test("auth guard: anonymous user is redirected from /admin", () => {
    const auth = createAuthForTests();
    const req = { originalUrl: "/admin/recipes" };
    const res = createMockRes();
    res.locals.auth = { isAuthenticated: false, isAdmin: false };

    let nextCalled = false;
    auth.requireAdminPage(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.redirectedTo, "/login?next=%2Fadmin%2Frecipes");
  });

  test("auth guard: anonymous user is rejected by admin API", () => {
    const auth = createAuthForTests();
    const req = { originalUrl: "/api/admin/recipes" };
    const res = createMockRes();
    res.locals.auth = { isAuthenticated: false, isAdmin: false };

    let nextCalled = false;
    auth.requireAdminApi(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.jsonBody, { error: "Authentication required." });
  });

  test("publish flow: PATCH /api/admin/recipes/:id/publish toggles state and persists", async () => {
    const app = createMockApiApp();
    const recipeState = { id: "recipe-1", is_published: false };
    const auditCalls = [];

    registerAdminApiRoutes(app, {
      requireAdminApi: (_req, _res, next) => next(),
      requireSameOrigin: (_req, _res, next) => next(),
      requireCsrfApi: (_req, _res, next) => next(),
      supabaseAdmin: createSupabaseAdminRecipeStub(recipeState),
      parsePagination: () => ({ page: 1, pageSize: 20 }),
      listAdminRecipes: async () => ({ items: [], total: 0, searchFeedback: "" }),
      handleApiError: (res, error) => res.status(error?.status || 500).json({ error: error?.message || "Failed" }),
      createRecipeFromRequestBody: async () => ({}),
      writeAdminAuditLog: async (entry) => {
        auditCalls.push(entry);
      },
      getRecipeAdminDetails: async () => ({}),
      updateRecipeFromRequestBody: async () => ({}),
      deleteStorageObjectByPublicUrl: async () => {},
      listAdminIngredients: async () => ({ items: [], total: 0, searchFeedback: "" }),
      createIngredientFromRequestBody: async () => ({}),
      updateIngredientFromRequestBody: async () => ({}),
      toDisplayImagePath: (value) => value,
    });

    const publishHandlers = app.patchRoutes.get("/api/admin/recipes/:id/publish");
    assert.ok(Array.isArray(publishHandlers) && publishHandlers.length > 0);

    const reqOne = { params: { id: "recipe-1" }, body: {} };
    const resOne = createMockRes();
    await runHandlers(publishHandlers, reqOne, resOne);

    assert.equal(resOne.statusCode, 200);
    assert.deepEqual(resOne.jsonBody, { id: "recipe-1", is_published: true });
    assert.equal(recipeState.is_published, true);

    const reqTwo = { params: { id: "recipe-1" }, body: {} };
    const resTwo = createMockRes();
    await runHandlers(publishHandlers, reqTwo, resTwo);

    assert.equal(resTwo.statusCode, 200);
    assert.deepEqual(resTwo.jsonBody, { id: "recipe-1", is_published: false });
    assert.equal(recipeState.is_published, false);

    const actions = auditCalls.map((call) => call.action);
    assert.deepEqual(actions, ["recipe.publish", "recipe.unpublish"]);
  });

  test("ingredient delete conflict: deleting in-use ingredient returns conflict response", async () => {
    const app = createMockApiApp();
    const auditCalls = [];
    const storageDeleteCalls = [];

    registerAdminApiRoutes(app, {
      requireAdminApi: (_req, _res, next) => next(),
      requireSameOrigin: (_req, _res, next) => next(),
      requireCsrfApi: (_req, _res, next) => next(),
      supabaseAdmin: createSupabaseAdminIngredientConflictStub({
        ingredientId: "ingredient-1",
        ingredientName: "Sugar",
        usageCount: 3,
      }),
      parsePagination: () => ({ page: 1, pageSize: 20 }),
      listAdminRecipes: async () => ({ items: [], total: 0, searchFeedback: "" }),
      handleApiError: (res, error) => res.status(error?.status || 500).json({ error: error?.message || "Failed" }),
      createRecipeFromRequestBody: async () => ({}),
      writeAdminAuditLog: async (entry) => {
        auditCalls.push(entry);
      },
      getRecipeAdminDetails: async () => ({}),
      updateRecipeFromRequestBody: async () => ({}),
      deleteStorageObjectByPublicUrl: async (...args) => {
        storageDeleteCalls.push(args);
      },
      listAdminIngredients: async () => ({ items: [], total: 0, searchFeedback: "" }),
      createIngredientFromRequestBody: async () => ({}),
      updateIngredientFromRequestBody: async () => ({}),
      toDisplayImagePath: (value) => value,
    });

    const ingredientDeleteHandlers = app.deleteRoutes.get("/api/admin/ingredients/:id");
    assert.ok(Array.isArray(ingredientDeleteHandlers) && ingredientDeleteHandlers.length > 0);

    const req = { params: { id: "ingredient-1" }, body: {} };
    const res = createMockRes();
    await runHandlers(ingredientDeleteHandlers, req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.jsonBody, {
      error: 'Ingredient "Sugar" is used in 3 recipes. Remove usage before deleting.',
    });
    assert.equal(auditCalls.length, 0);
    assert.equal(storageDeleteCalls.length, 0);
  });

  test("pagination + search ordering: starts-with results rank ahead of contains", async () => {
    const app = createMockApiApp();

    registerAdminApiRoutes(app, {
      requireAdminApi: (_req, _res, next) => next(),
      requireSameOrigin: (_req, _res, next) => next(),
      requireCsrfApi: (_req, _res, next) => next(),
      supabaseAdmin: {},
      parsePagination: () => ({ page: 2, pageSize: 2 }),
      listAdminRecipes: async () => ({
        items: [
          { id: "r-prefix", title: "Apple Pie", slug: "apple-pie", is_published: true },
          { id: "r-contains", title: "Spiced Apple Tart", slug: "spiced-apple-tart", is_published: false },
        ],
        total: 5,
        searchFeedback: "Prefix matches are shown first.",
      }),
      handleApiError: (res, error) => res.status(error?.status || 500).json({ error: error?.message || "Failed" }),
      createRecipeFromRequestBody: async () => ({}),
      writeAdminAuditLog: async () => {},
      getRecipeAdminDetails: async () => ({}),
      updateRecipeFromRequestBody: async () => ({}),
      deleteStorageObjectByPublicUrl: async () => {},
      listAdminIngredients: async () => ({ items: [], total: 0, searchFeedback: "" }),
      createIngredientFromRequestBody: async () => ({}),
      updateIngredientFromRequestBody: async () => ({}),
      toDisplayImagePath: (value) => value,
    });

    const listHandlers = app.getRoutes.get("/api/admin/recipes");
    assert.ok(Array.isArray(listHandlers) && listHandlers.length > 0);

    const req = { query: { search: "apple", page: "2", page_size: "2", status: "all" } };
    const res = createMockRes();
    await runHandlers(listHandlers, req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonBody.page, 2);
    assert.equal(res.jsonBody.page_size, 2);
    assert.equal(res.jsonBody.total, 5);
    assert.equal(res.jsonBody.total_pages, 3);
    assert.equal(res.jsonBody.search_feedback, "Prefix matches are shown first.");
    assert.equal(res.jsonBody.items[0].id, "r-prefix");
    assert.equal(res.jsonBody.items[1].id, "r-contains");
  });
});
