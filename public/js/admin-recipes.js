document.addEventListener("DOMContentLoaded", () => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
  const withCsrfHeaders = (baseHeaders = {}) => (csrfToken ? { ...baseHeaders, "X-CSRF-Token": csrfToken } : baseHeaders);

  const parseJsonOrThrow = async (response) => {
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || "Request failed.");
    }
    return json;
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });

  const setFileName = (el, file, fallback = "No file selected") => {
    if (!el) return;
    el.textContent = file?.name || fallback;
  };

  const recipeTable = document.querySelector(".admin-table");
  if (recipeTable) {
    recipeTable.addEventListener("click", async (event) => {
      const publishBtn = event.target.closest("[data-recipe-publish]");
      if (publishBtn) {
        const id = publishBtn.getAttribute("data-id");
        const nextState = publishBtn.getAttribute("data-next-state") === "true";
        if (!id) return;
        publishBtn.disabled = true;
        try {
          await parseJsonOrThrow(
            await fetch(`/api/admin/recipes/${id}/publish`, {
              method: "PATCH",
              headers: withCsrfHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ is_published: nextState }),
            }),
          );
          window.location.reload();
        } catch (error) {
          alert(error.message || "Publish update failed.");
          publishBtn.disabled = false;
        }
        return;
      }

      const deleteBtn = event.target.closest("[data-recipe-delete]");
      if (!deleteBtn) return;
      const id = deleteBtn.getAttribute("data-id");
      const title = deleteBtn.getAttribute("data-title") || "this recipe";
      if (!id) return;
      const ok = window.confirm(`Delete "${title}" permanently?`);
      if (!ok) return;
      deleteBtn.disabled = true;
      try {
        const response = await fetch(`/api/admin/recipes/${id}`, {
          method: "DELETE",
          headers: withCsrfHeaders(),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Delete failed.");
        }
        window.location.reload();
      } catch (error) {
        alert(error.message || "Delete failed.");
        deleteBtn.disabled = false;
      }
    });
  }

  const form = document.getElementById("admin-recipe-form");
  if (!form) return;

  const ingredientsList = document.getElementById("ingredients-list");
  const stepsList = document.getElementById("steps-list");
  const tipsList = document.getElementById("tips-list");
  const statusEl = document.getElementById("admin-recipe-status");
  const titleInput = form.querySelector('input[name="title"]');
  const recipeImageInput = form.querySelector('input[name="recipe_image"]');
  const recipeImageName = form.querySelector("[data-recipe-image-name]");
  const publishIntentInput = form.querySelector('input[name="publish_intent"]');
  const ingredientOptionsList = document.getElementById("ingredient-options-list");
  const recipeTitleOptionsList = document.getElementById("recipe-title-options-list");
  let submitIntent = publishIntentInput?.value === "publish" ? "publish" : "draft";
  const ingredientCatalogByName = new Map();
  const recipeCatalogByTitle = new Map();
  let ingredientSearchTimer = null;
  let recipeSearchTimer = null;

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `admin-form-status ${type}`.trim();
  };

  const ingredientRowTemplate = () => {
    const row = document.createElement("div");
    row.className = "admin-row ingredient-row";
    row.dataset.ingredientRow = "1";
    row.innerHTML = `
      <div class="ingredient-main">
        <div class="ingredient-fields">
          <input type="text" name="ingredient_name" placeholder="Ingredient name" list="ingredient-options-list" required />
          <input type="hidden" name="ingredient_id" value="" />
          <input type="number" name="ingredient_amount_value" min="0" step="0.01" placeholder="Amount" required />
          <input type="text" name="ingredient_amount_unit" placeholder="Unit" required />
        </div>
        <div class="ingredient-image-control">
          <button type="button" class="admin-btn admin-btn-outline image-trigger-btn" data-image-trigger>+ Add Image</button>
          <span class="file-name" data-image-name>No file selected</span>
          <input type="hidden" name="ingredient_existing_image_path" value="" />
          <input class="visually-hidden-input" type="file" name="ingredient_image" accept="image/*" />
        </div>
      </div>
      <button type="button" class="admin-btn admin-btn-danger" data-remove-row>Remove</button>
    `;
    return row;
  };

  const syncIngredientSelectionForRow = (row) => {
    if (!row) return;
    const nameInput = row.querySelector('input[name="ingredient_name"]');
    const ingredientIdInput = row.querySelector('input[name="ingredient_id"]');
    const existingPathInput = row.querySelector('input[name="ingredient_existing_image_path"]');
    const imageNameEl = row.querySelector("[data-image-name]");
    if (!nameInput || !ingredientIdInput) return;

    const key = nameInput.value.trim().toLowerCase();
    const selected = ingredientCatalogByName.get(key);
    if (!selected) {
      ingredientIdInput.value = "";
      if (existingPathInput && !row.querySelector('input[name="ingredient_image"]')?.files?.[0]) {
        existingPathInput.value = "";
      }
      return;
    }

    ingredientIdInput.value = selected.id || "";
    if ((!existingPathInput?.value || existingPathInput.value.trim() === "") && selected.image_path) {
      if (existingPathInput) existingPathInput.value = selected.image_path;
      setFileName(imageNameEl, null, "Current image selected");
    }
  };

  const findExistingIngredientByName = async (name) => {
    const normalized = String(name || "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;

    const fromCatalog = ingredientCatalogByName.get(normalized);
    if (fromCatalog) return fromCatalog;

    await fetchIngredientOptions(name);
    return ingredientCatalogByName.get(normalized) || null;
  };

  const getSelectedIngredientNames = (excludeRow = null) => {
    const selected = new Set();
    const rows = form.querySelectorAll("[data-ingredient-row]");
    for (const row of rows) {
      if (excludeRow && row === excludeRow) continue;
      const value = row.querySelector('input[name="ingredient_name"]')?.value.trim().toLowerCase();
      if (!value) continue;
      selected.add(value);
    }
    return selected;
  };

  const renderIngredientOptions = (items, activeRow = null) => {
    if (!ingredientOptionsList) return;
    ingredientOptionsList.innerHTML = "";
    const seen = new Set();
    const blockedNames = getSelectedIngredientNames(activeRow);

    for (const item of items || []) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      ingredientCatalogByName.set(key, {
        id: item.id || "",
        name,
        image_path: item.image_path || "",
      });

      if (blockedNames.has(key)) continue;

      const option = document.createElement("option");
      option.value = name;
      ingredientOptionsList.appendChild(option);
    }
  };

  const fetchIngredientOptions = async (search = "", activeRow = null) => {
    const query = new URLSearchParams({
      page_size: "100",
      page: "1",
    });
    if (search.trim()) query.set("search", search.trim());

    const response = await fetch(`/api/admin/ingredients?${query.toString()}`, {
      headers: withCsrfHeaders(),
    });
    const payload = await parseJsonOrThrow(response);
    renderIngredientOptions(payload.items || [], activeRow);
  };

  const renderRecipeTitleOptions = (items) => {
    if (!recipeTitleOptionsList) return;
    recipeTitleOptionsList.innerHTML = "";
    const seen = new Set();

    for (const item of items || []) {
      const title = String(item.title || "").trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      recipeCatalogByTitle.set(key, {
        id: item.id || "",
        title,
      });

      const option = document.createElement("option");
      option.value = title;
      recipeTitleOptionsList.appendChild(option);
    }
  };

  const fetchRecipeTitleOptions = async (search = "") => {
    const query = new URLSearchParams({
      page_size: "100",
      page: "1",
      status: "all",
    });
    if (search.trim()) query.set("search", search.trim());

    const response = await fetch(`/api/admin/recipes?${query.toString()}`, {
      headers: withCsrfHeaders(),
    });
    const payload = await parseJsonOrThrow(response);
    renderRecipeTitleOptions(payload.items || []);
  };

  const stepRowTemplate = () => {
    const row = document.createElement("div");
    row.className = "admin-row step-row";
    row.dataset.stepRow = "1";
    row.innerHTML = `
      <div class="step-fields">
        <input type="text" name="step_title" placeholder="Step title (optional)" />
        <textarea name="step_body" placeholder="Step instruction" required></textarea>
      </div>
      <button type="button" class="admin-btn admin-btn-danger" data-remove-row>Remove</button>
    `;
    return row;
  };

  const tipRowTemplate = () => {
    const row = document.createElement("div");
    row.className = "admin-row tip-row";
    row.dataset.tipRow = "1";
    row.innerHTML = `
      <textarea name="tip_text" placeholder="Tip"></textarea>
      <button type="button" class="admin-btn admin-btn-danger" data-remove-row>Remove</button>
    `;
    return row;
  };

  document.getElementById("add-ingredient")?.addEventListener("click", () => {
    ingredientsList?.appendChild(ingredientRowTemplate());
  });

  document.getElementById("add-step")?.addEventListener("click", () => {
    stepsList?.appendChild(stepRowTemplate());
  });

  document.getElementById("add-tip")?.addEventListener("click", () => {
    tipsList?.appendChild(tipRowTemplate());
  });

  if (ingredientsList && ingredientsList.querySelectorAll("[data-ingredient-row]").length === 0) {
    ingredientsList.appendChild(ingredientRowTemplate());
  }
  if (stepsList && stepsList.querySelectorAll("[data-step-row]").length === 0) {
    stepsList.appendChild(stepRowTemplate());
  }

  fetchIngredientOptions().catch(() => {
    setStatus("Could not load existing ingredients for autocomplete.", "error");
  });

  fetchRecipeTitleOptions().catch(() => {
    setStatus("Could not load existing recipe titles.", "error");
  });

  form.addEventListener("click", (event) => {
    const submitBtn = event.target.closest("[data-submit-intent]");
    if (submitBtn) {
      submitIntent = submitBtn.getAttribute("data-submit-intent") === "publish" ? "publish" : "draft";
      if (publishIntentInput) publishIntentInput.value = submitIntent;
      return;
    }

    const recipeImageTrigger = event.target.closest("[data-recipe-image-trigger]");
    if (recipeImageTrigger) {
      recipeImageInput?.click();
      return;
    }

    const ingredientImageTrigger = event.target.closest("[data-image-trigger]");
    if (ingredientImageTrigger) {
      ingredientImageTrigger.closest(".ingredient-image-control")?.querySelector('input[name="ingredient_image"]')?.click();
      return;
    }

    const removeBtn = event.target.closest("[data-remove-row]");
    if (removeBtn) {
      removeBtn.closest(".admin-row")?.remove();
    }
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.name === "ingredient_name") {
      syncIngredientSelectionForRow(target.closest("[data-ingredient-row]"));
      return;
    }

    if (target.name === "recipe_image") {
      const fallback = form.querySelector('input[name="existing_recipe_image_path"]')?.value
        ? "Current image selected"
        : "No file selected";
      setFileName(recipeImageName, target.files?.[0], fallback);
      return;
    }

    if (target.name === "ingredient_image") {
      const nameEl = target.closest(".ingredient-image-control")?.querySelector("[data-image-name]");
      const fallback = target.closest(".ingredient-image-control")?.querySelector('input[name="ingredient_existing_image_path"]')
        ?.value
        ? "Current image selected"
        : "No file selected";
      setFileName(nameEl, target.files?.[0], fallback);
    }
  });

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name === "ingredient_name") {
      const row = target.closest("[data-ingredient-row]");
      syncIngredientSelectionForRow(row);

      const value = target.value.trim();
      if (ingredientSearchTimer) window.clearTimeout(ingredientSearchTimer);
      ingredientSearchTimer = window.setTimeout(() => {
        fetchIngredientOptions(value, row).catch(() => {});
      }, 180);
      return;
    }

    if (target.name === "title") {
      const value = target.value.trim();
      if (recipeSearchTimer) window.clearTimeout(recipeSearchTimer);
      recipeSearchTimer = window.setTimeout(() => {
        fetchRecipeTitleOptions(value).catch(() => {});
      }, 180);
    }
  });

  form.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "ingredient_name") return;
    const row = target.closest("[data-ingredient-row]");
    fetchIngredientOptions(target.value.trim(), row).catch(() => {});
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving recipe...");

    const mode = form.dataset.mode || "create";
    const recipeId = form.dataset.recipeId || "";
    const currentTitle = titleInput?.value.trim() || "";

    if (mode === "create") {
      const existingRecipe = recipeCatalogByTitle.get(currentTitle.toLowerCase());
      if (existingRecipe?.id) {
        const goToEdit = window.confirm(
          `Recipe title \"${currentTitle}\" already exists. Do you want to open it for editing instead?`,
        );
        if (goToEdit) {
          window.location.href = `/admin/recipes/${existingRecipe.id}/edit`;
          return;
        }
        setStatus(`Recipe title \"${currentTitle}\" already exists.`, "error");
        return;
      }
    }

    const recipeImageFile = recipeImageInput?.files?.[0] || null;
    const existingRecipeImagePath = form.querySelector('input[name="existing_recipe_image_path"]')?.value || "";
    let recipeImageBase64 = "";
    if (recipeImageFile) {
      try {
        recipeImageBase64 = await fileToDataUrl(recipeImageFile);
      } catch {
        setStatus("Could not read recipe image.", "error");
        return;
      }
    }

    if (!recipeImageBase64 && !existingRecipeImagePath) {
      setStatus("Recipe image is required.", "error");
      return;
    }

    const ingredients = [];
    const ingredientRows = [...form.querySelectorAll("[data-ingredient-row]")];
    for (const row of ingredientRows) {
      const name = row.querySelector('input[name="ingredient_name"]')?.value.trim() || "";
      if (!name) continue;
      const amountValueRaw = row.querySelector('input[name="ingredient_amount_value"]')?.value;
      const amountUnit = row.querySelector('input[name="ingredient_amount_unit"]')?.value.trim() || "";
      const amountValue = Number(amountValueRaw);
      const ingredientIdInput = row.querySelector('input[name="ingredient_id"]');
      const existingImagePathInput = row.querySelector('input[name="ingredient_existing_image_path"]');
      let ingredientId = ingredientIdInput?.value.trim() || "";
      let existingImagePath = existingImagePathInput?.value || "";
      const imageFile = row.querySelector('input[name="ingredient_image"]')?.files?.[0] || null;

      if (!ingredientId || !existingImagePath) {
        try {
          const existingIngredient = await findExistingIngredientByName(name);
          if (existingIngredient?.id) {
            ingredientId = existingIngredient.id;
            if (ingredientIdInput) ingredientIdInput.value = ingredientId;
          }
          if (existingIngredient?.image_path && !existingImagePath) {
            existingImagePath = existingIngredient.image_path;
            if (existingImagePathInput) existingImagePathInput.value = existingImagePath;
            const imageNameEl = row.querySelector("[data-image-name]");
            setFileName(imageNameEl, null, "Current image selected");
          }
        } catch {
          setStatus(`Could not verify existing ingredient "${name}".`, "error");
          return;
        }
      }

      if (!amountValueRaw || !amountUnit) {
        setStatus(`Amount and unit are required for ingredient "${name}".`, "error");
        return;
      }

      if (!Number.isFinite(amountValue) || amountValue < 0) {
        setStatus(`Amount for ingredient "${name}" must be a valid number.`, "error");
        return;
      }

      let imageBase64 = "";
      if (imageFile) {
        try {
          imageBase64 = await fileToDataUrl(imageFile);
        } catch {
          setStatus(`Could not read image for ingredient "${name}".`, "error");
          return;
        }
      }

      if (!imageBase64 && !existingImagePath) {
        setStatus(`Image is required for ingredient "${name}".`, "error");
        return;
      }

      ingredients.push({
        ingredient_id: ingredientId || null,
        name,
        amount_value: amountValue,
        amount_unit: amountUnit,
        image_base64: imageBase64,
        existing_image_path: existingImagePath,
      });
    }

    if (!ingredients.length) {
      setStatus("At least one ingredient is required.", "error");
      return;
    }

    const steps = [...form.querySelectorAll("[data-step-row]")]
      .map((row) => ({
        title: row.querySelector('input[name="step_title"]')?.value.trim() || null,
        body: row.querySelector('textarea[name="step_body"]')?.value.trim() || "",
      }))
      .filter((step) => step.body.length > 0);

    if (!steps.length) {
      setStatus("At least one instruction step is required.", "error");
      return;
    }

    const tips = [...form.querySelectorAll("[data-tip-row]")]
      .map((row) => ({ tip: row.querySelector('textarea[name="tip_text"]')?.value.trim() || "" }))
      .filter((tip) => tip.tip.length > 0);

    const payload = {
      category: form.querySelector('select[name="category"]')?.value,
      title: form.querySelector('input[name="title"]')?.value.trim(),
      subtitle: form.querySelector('input[name="subtitle"]')?.value.trim(),
      description: form.querySelector('textarea[name="description"]')?.value.trim(),
      prep_minutes: form.querySelector('input[name="prep_minutes"]')?.value,
      cook_minutes: form.querySelector('input[name="cook_minutes"]')?.value,
      serves: form.querySelector('input[name="serves"]')?.value,
      recipe_image_base64: recipeImageBase64,
      existing_recipe_image_path: existingRecipeImagePath,
      ingredients,
      steps,
      tips,
      is_published: submitIntent === "publish",
    };

    const endpoint = mode === "edit" ? `/api/admin/recipes/${recipeId}` : "/api/admin/recipes";
    const method = mode === "edit" ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const json = await parseJsonOrThrow(response);
      setStatus("Saved. Redirecting...", "success");
      if (json.editLink) {
        window.location.href = json.editLink;
        return;
      }
      window.location.href = "/admin/recipes";
    } catch (error) {
      setStatus(error.message || "Failed to save recipe.", "error");
    }
  });
});
