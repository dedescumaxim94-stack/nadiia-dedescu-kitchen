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

  const ingredientTable = document.querySelector(".admin-table");
  if (ingredientTable) {
    ingredientTable.addEventListener("click", async (event) => {
      const deleteBtn = event.target.closest("[data-ingredient-delete]");
      if (!deleteBtn) return;
      const id = deleteBtn.getAttribute("data-id");
      const name = deleteBtn.getAttribute("data-name") || "this ingredient";
      if (!id) return;
      const ok = window.confirm(`Delete "${name}" permanently?`);
      if (!ok) return;
      deleteBtn.disabled = true;
      try {
        const response = await fetch(`/api/admin/ingredients/${id}`, {
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

  const form = document.getElementById("admin-ingredient-form");
  if (!form) return;

  const statusEl = document.getElementById("admin-ingredient-status");
  const imageInput = form.querySelector('input[name="image"]');
  const imageNameEl = form.querySelector("[data-ingredient-image-name]");
  const existingImagePathInput = form.querySelector('input[name="existing_image_path"]');
  const nameInput = form.querySelector('input[name="name"]');
  const ingredientOptionsList = document.getElementById("ingredient-name-options-list");
  const ingredientCatalogByName = new Map();
  let ingredientSearchTimer = null;

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `admin-form-status ${type}`.trim();
  };

  const renderIngredientNameOptions = (items) => {
    if (!ingredientOptionsList) return;
    ingredientOptionsList.innerHTML = "";
    ingredientCatalogByName.clear();

    for (const item of items || []) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (ingredientCatalogByName.has(key)) continue;

      ingredientCatalogByName.set(key, {
        id: item.id || "",
        name,
      });

      const option = document.createElement("option");
      option.value = name;
      ingredientOptionsList.appendChild(option);
    }
  };

  const fetchIngredientNameOptions = async (search = "") => {
    const query = new URLSearchParams({
      page_size: "100",
      page: "1",
      status: "all",
    });
    if (search.trim()) query.set("search", search.trim());

    const response = await fetch(`/api/admin/ingredients?${query.toString()}`, {
      headers: withCsrfHeaders(),
    });
    const payload = await parseJsonOrThrow(response);
    renderIngredientNameOptions(payload.items || []);
  };

  form.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-ingredient-image-trigger]");
    if (!trigger) return;
    imageInput?.click();
  });

  imageInput?.addEventListener("change", () => {
    const fallback = existingImagePathInput?.value ? "Current image selected" : "No file selected";
    imageNameEl.textContent = imageInput.files?.[0]?.name || fallback;
  });

  fetchIngredientNameOptions().catch(() => {
    setStatus("Could not load existing ingredient names.", "error");
  });

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "name") return;

    const value = target.value.trim();
    if (ingredientSearchTimer) window.clearTimeout(ingredientSearchTimer);
    ingredientSearchTimer = window.setTimeout(() => {
      fetchIngredientNameOptions(value).catch(() => {});
    }, 180);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving ingredient...");

    const mode = form.dataset.mode || "create";
    const ingredientId = form.dataset.ingredientId || "";
    const name = form.querySelector('input[name="name"]')?.value.trim() || "";
    const existingImagePath = existingImagePathInput?.value || "";
    const imageFile = imageInput?.files?.[0] || null;
    const currentName = nameInput?.value.trim() || "";

    if (mode === "create") {
      const existingIngredient = ingredientCatalogByName.get(currentName.toLowerCase());
      if (existingIngredient?.id) {
        const goToEdit = window.confirm(`Ingredient \"${currentName}\" already exists. Do you want to open it for editing instead?`);
        if (goToEdit) {
          window.location.href = `/admin/ingredients/${existingIngredient.id}/edit`;
          return;
        }
        setStatus(`Ingredient \"${currentName}\" already exists.`, "error");
        return;
      }
    }

    if (!name) {
      setStatus("Ingredient name is required.", "error");
      return;
    }

    let imageBase64 = "";
    if (imageFile) {
      try {
        imageBase64 = await fileToDataUrl(imageFile);
      } catch {
        setStatus("Could not read ingredient image.", "error");
        return;
      }
    }

    if (!imageBase64 && !existingImagePath) {
      setStatus("Ingredient image is required.", "error");
      return;
    }

    const payload = {
      name,
      image_base64: imageBase64,
      existing_image_path: existingImagePath,
    };

    const endpoint = mode === "edit" ? `/api/admin/ingredients/${ingredientId}` : "/api/admin/ingredients";
    const method = mode === "edit" ? "PATCH" : "POST";

    try {
      await parseJsonOrThrow(
        await fetch(endpoint, {
          method,
          headers: withCsrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        }),
      );
      setStatus("Saved. Redirecting...", "success");
      window.location.href = "/admin/ingredients";
    } catch (error) {
      setStatus(error.message || "Failed to save ingredient.", "error");
    }
  });
});
