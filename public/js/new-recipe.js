document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("new-recipe-form");
  if (!form) return;

  const statusEl = document.getElementById("form-status");
  const ingredientsList = document.getElementById("ingredients-list");
  const stepsList = document.getElementById("steps-list");
  const tipsList = document.getElementById("tips-list");
  const recipeImageInput = form.querySelector('input[name="recipe_image"]');
  const recipeImageName = form.querySelector("[data-recipe-image-name]");

  const slugify = (value = "") =>
    value
      .toLowerCase()
      .trim()
      .replace(/["']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const setFileName = (el, file) => {
    if (!el) return;
    el.textContent = file?.name || "No file selected";
  };

  function ingredientRow() {
    const row = document.createElement("div");
    row.className = "row ingredient-row";
    row.dataset.ingredientRow = "1";
    row.innerHTML = `
      <div class="ingredient-main">
        <div class="ingredient-fields">
          <input type="text" name="ingredient_name" placeholder="Ingredient name" required />
          <input type="number" name="ingredient_amount_value" min="0" step="0.01" placeholder="Amount (e.g. 1.5)" />
          <input type="text" name="ingredient_amount_unit" placeholder="Unit (e.g. cup, tbsp, g)" />
        </div>
        <div class="ingredient-image-control">
          <button type="button" class="outline-btn image-trigger-btn" data-image-trigger>+ Add Image</button>
          <span class="file-name" data-image-name>No file selected</span>
          <input class="visually-hidden-input" type="file" name="ingredient_image" accept="image/*" required />
        </div>
      </div>
      <button type="button" class="remove-btn ingredient-remove-btn" data-remove-row>Remove</button>
    `;
    return row;
  }

  function stepRow() {
    const row = document.createElement("div");
    row.className = "row step-row";
    row.dataset.stepRow = "1";
    row.innerHTML = `
      <div class="step-fields">
        <input type="text" name="step_title" placeholder="Step title (optional)" />
        <textarea name="step_body" placeholder="Step instruction" required></textarea>
      </div>
      <button type="button" class="remove-btn" data-remove-row>Remove</button>
    `;
    return row;
  }

  function tipRow() {
    const row = document.createElement("div");
    row.className = "row tip-row";
    row.dataset.tipRow = "1";
    row.innerHTML = `
      <textarea name="tip_text" placeholder="Tip"></textarea>
      <button type="button" class="remove-btn" data-remove-row>Remove</button>
    `;
    return row;
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `form-status ${type || ""}`.trim();
  }

  function readRequiredImage(file, message) {
    if (!file) throw new Error(message);
    return fileToDataUrl(file);
  }

  document.getElementById("add-ingredient")?.addEventListener("click", () => {
    ingredientsList.appendChild(ingredientRow());
  });

  document.getElementById("add-step")?.addEventListener("click", () => {
    stepsList.appendChild(stepRow());
  });

  document.getElementById("add-tip")?.addEventListener("click", () => {
    tipsList.appendChild(tipRow());
  });

  form.addEventListener("click", (event) => {
    const ingredientImageTrigger = event.target.closest("[data-image-trigger]");
    if (ingredientImageTrigger) {
      const wrapper = ingredientImageTrigger.closest(".ingredient-image-control");
      wrapper?.querySelector('input[name="ingredient_image"]')?.click();
      return;
    }

    const recipeImageTrigger = event.target.closest("[data-recipe-image-trigger]");
    if (recipeImageTrigger) {
      recipeImageInput?.click();
      return;
    }

    const button = event.target.closest("[data-remove-row]");
    if (!button) return;
    button.closest(".row")?.remove();
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.name === "ingredient_image") {
      const nameEl = target.closest(".ingredient-image-control")?.querySelector("[data-image-name]");
      setFileName(nameEl, target.files?.[0]);
      return;
    }
  });

  recipeImageInput?.addEventListener("change", () => {
    setFileName(recipeImageName, recipeImageInput.files?.[0]);
  });

  ingredientsList.appendChild(ingredientRow());
  stepsList.appendChild(stepRow());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving recipe...", "");

    let recipeImageBase64 = "";
    try {
      const recipeImageFile = form.querySelector('input[name="recipe_image"]')?.files?.[0] || null;
      recipeImageBase64 = await readRequiredImage(recipeImageFile, "Recipe image is required.");
    } catch (error) {
      setStatus(error.message || "Could not read recipe image.", "error");
      return;
    }

    const ingredientRows = [...form.querySelectorAll("[data-ingredient-row]")];
    const ingredients = [];
    for (const row of ingredientRows) {
      const name = row.querySelector('input[name="ingredient_name"]')?.value.trim() || "";
      if (!name) continue;
      const amountValueInput = row.querySelector('input[name="ingredient_amount_value"]')?.value;
      const amountUnit = row.querySelector('input[name="ingredient_amount_unit"]')?.value.trim() || "";
      const imageFile = row.querySelector('input[name="ingredient_image"]')?.files?.[0] || null;
      const amountValue = Number(amountValueInput);

      // Amount value and unit are now optional. Only check if value is present and negative.
      if (amountValueInput && (!Number.isFinite(amountValue) || amountValue < 0)) {
        setStatus(`Amount value cannot be negative for ingredient "${name}".`, "error");
        return;
      }

      if (!Number.isFinite(amountValue) || amountValue < 0) {
        setStatus(`Amount for ingredient "${name}" must be a valid number.`, "error");
        return;
      }

      let imageBase64 = "";
      try {
        imageBase64 = await readRequiredImage(imageFile, `Image is required for ingredient "${name}".`);
      } catch (error) {
        setStatus(error.message || `Could not read image for ingredient "${name}".`, "error");
        return;
      }

      ingredients.push({
        name,
        amount_value: amountValue,
        amount_unit: amountUnit,
        image_base64: imageBase64,
      });
    }

    if (ingredients.length === 0) {
      setStatus("Add at least one ingredient.", "error");
      return;
    }

    const steps = [...form.querySelectorAll("[data-step-row]")]
      .map((row) => ({
        title: row.querySelector('input[name="step_title"]')?.value.trim() || null,
        body: row.querySelector('textarea[name="step_body"]')?.value.trim() || "",
      }))
      .filter((item) => item.body.length > 0);

    if (steps.length === 0) {
      setStatus("Add at least one instruction step.", "error");
      return;
    }

    const tips = [...form.querySelectorAll("[data-tip-row]")]
      .map((row) => ({ tip: row.querySelector('textarea[name="tip_text"]')?.value.trim() || "" }))
      .filter((item) => item.tip.length > 0);

    const payload = {
      category: form.querySelector('select[name="category"]')?.value,
      title: form.querySelector('input[name="title"]')?.value.trim(),
      slug: slugify(form.querySelector('input[name="title"]')?.value || ""),
      subtitle: form.querySelector('input[name="subtitle"]')?.value.trim(),
      description: form.querySelector('textarea[name="description"]')?.value.trim(),
      recipe_image_base64: recipeImageBase64,
      prep_minutes: form.querySelector('input[name="prep_minutes"]')?.value,
      cook_minutes: form.querySelector('input[name="cook_minutes"]')?.value,
      serves: form.querySelector('input[name="serves"]')?.value,
      is_published: form.querySelector('input[name="is_published"]')?.checked,
      ingredients,
      steps,
      tips,
    };

    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        setStatus(json.error || "Failed to create recipe.", "error");
        return;
      }

      setStatus("Recipe created. Redirecting...", "success");
      if (json.link) {
        window.location.href = json.link;
      }
    } catch (error) {
      setStatus("Network error while creating recipe.", "error");
    }
  });
});
