function initSideMenu() {
  const sideMenu = document.querySelector(".side-menu");
  const siteShell = document.querySelector(".site-shell");
  const openBtn = document.querySelector(".menu-open-btn");
  const closeBtn = document.querySelector(".menu-close-btn");
  const backdrop = document.querySelector(".menu-backdrop");
  if (!sideMenu || !siteShell || !openBtn || !closeBtn || !backdrop) return;

  const setMenuState = (isOpen) => {
    sideMenu.classList.toggle("open", isOpen);
    siteShell.classList.toggle("menu-open", isOpen);
    document.body.classList.toggle("menu-open", isOpen);
    openBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  openBtn.addEventListener("click", () => setMenuState(true));
  closeBtn.addEventListener("click", () => setMenuState(false));
  backdrop.addEventListener("click", () => setMenuState(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuState(false);
  });

  document.querySelectorAll(".menu-title").forEach((titleBtn) => {
    titleBtn.addEventListener("click", () => {
      const nextExpanded = titleBtn.getAttribute("aria-expanded") !== "true";
      titleBtn.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      const listId = titleBtn.getAttribute("aria-controls");
      const dropdown = listId ? document.getElementById(listId) : titleBtn.nextElementSibling;
      dropdown?.classList.toggle("open", nextExpanded);
    });
  });
}

function initRecipeChecklist() {
  const canVibrate = Boolean(navigator.vibrate);
  document.addEventListener("click", (event) => {
    const ingredientCard = event.target.closest(".ingredient-item");
    if (ingredientCard) {
      ingredientCard.classList.toggle("has-ingredient");
      if (canVibrate) navigator.vibrate(50);
      return;
    }

    const stepItem = event.target.closest(".steps-list li");
    if (stepItem) {
      stepItem.classList.toggle("completed-step");
      if (canVibrate) navigator.vibrate(50);
    }
  });
}

function initServingsScaling() {
  const servingsControl = document.querySelector("[data-base-serves]");
  if (!servingsControl) return;

  const baseServes = Number(servingsControl.getAttribute("data-base-serves"));
  const input = servingsControl.querySelector("[data-servings-input]");
  const incBtn = servingsControl.querySelector("[data-servings-increase]");
  const decBtn = servingsControl.querySelector("[data-servings-decrease]");
  if (!input || !incBtn || !decBtn || !Number.isFinite(baseServes) || baseServes <= 0) return;

  const amountNodes = document.querySelectorAll("[data-ingredient-amount]");
  const prepNode = document.querySelector("[data-meta-prep]");
  const cookNode = document.querySelector("[data-meta-cook]");
  const servesNode = document.querySelector("[data-meta-serves]");

  const PREP_TIME_EXPONENT = 0.4;
  const COOK_TIME_EXPONENT = 0.2;

  const formatScaledAmount = (value) => {
    if (!Number.isFinite(value)) return "";
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
  };

  const updateTimeMeta = (node, icon, label, ratio, exponent) => {
    if (!node) return;
    const baseMinutes = Number(node.getAttribute("data-base-minutes"));
    if (!Number.isFinite(baseMinutes) || baseMinutes <= 0) return;
    const scaled = Math.max(1, Math.round(baseMinutes * Math.pow(ratio, exponent)));
    node.textContent = `${icon} ${scaled} min ${label}`;
  };

  const updateAmounts = () => {
    const currentServes = Number(input.value || baseServes);
    if (!Number.isFinite(currentServes) || currentServes <= 0) return;
    const ratio = currentServes / baseServes;

    amountNodes.forEach((node) => {
      const amountValue = Number(node.getAttribute("data-amount-value"));
      const amountUnit = String(node.getAttribute("data-amount-unit") || "").trim();
      const originalAmount = String(node.getAttribute("data-original-amount") || "").trim();

      if (Number.isFinite(amountValue)) {
        node.textContent = `${formatScaledAmount(amountValue * ratio)}${amountUnit ? ` ${amountUnit}` : ""}`;
      } else {
        node.textContent = originalAmount;
      }
    });

    if (servesNode) servesNode.textContent = `👥 Serves ${currentServes}`;
    updateTimeMeta(prepNode, "⏱", "Prep", ratio, PREP_TIME_EXPONENT);
    updateTimeMeta(cookNode, "🔥", "Cook", ratio, COOK_TIME_EXPONENT);
  };

  incBtn.addEventListener("click", () => {
    input.value = String(Math.max(1, Number(input.value || 1) + 1));
    updateAmounts();
  });

  decBtn.addEventListener("click", () => {
    input.value = String(Math.max(1, Number(input.value || 1) - 1));
    updateAmounts();
  });

  input.addEventListener("input", () => {
    input.value = String(Math.max(1, Math.round(Number(input.value || "1"))));
    updateAmounts();
  });

  updateAmounts();
}

document.addEventListener("DOMContentLoaded", () => {
  initSideMenu();
  initRecipeChecklist();
  initServingsScaling();
});
