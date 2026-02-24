function initCarousel() {
  const track = document.querySelector(".carousel-track");
  if (!track) return;

  const nextBtn = document.querySelector(".next-btn");
  const prevBtn = document.querySelector(".prev-btn");
  const items = Array.from(track.children);
  if (!nextBtn || !prevBtn || items.length === 0) return;

  let currentIndex = 0;

  const moveToSlide = (index) => {
    const itemWidth = items[0].getBoundingClientRect().width;
    track.style.transform = `translateX(-${index * itemWidth}px)`;
  };

  const maxIndex = Math.max(0, items.length - 5);

  nextBtn.addEventListener("click", () => {
    currentIndex = currentIndex < maxIndex ? currentIndex + 1 : 0;
    moveToSlide(currentIndex);
  });

  prevBtn.addEventListener("click", () => {
    currentIndex = currentIndex > 0 ? currentIndex - 1 : maxIndex;
    moveToSlide(currentIndex);
  });

  window.addEventListener("resize", () => {
    moveToSlide(currentIndex);
  });
}

function initSideMenu() {
  const sideMenu = document.querySelector(".side-menu");
  const gridContainer = document.querySelector(".grid-container");
  const menuIcons = document.querySelectorAll(".menu-icon-btn");
  if (!sideMenu || !gridContainer || menuIcons.length === 0) return;

  const closeAllDropdowns = () => {
    sideMenu.querySelectorAll(".dropdown").forEach((drop) => drop.classList.remove("open"));
  };

  const openDefaultDropdown = () => {
    const firstDropdown = sideMenu.querySelector(".dropdown");
    firstDropdown?.classList.add("open");
  };

  menuIcons.forEach((icon) => {
    icon.addEventListener("click", () => {
      const isOpening = !sideMenu.classList.contains("open");
      sideMenu.classList.toggle("open");
      gridContainer.classList.toggle("menu-open");
      if (isOpening) {
        openDefaultDropdown();
      } else {
        closeAllDropdowns();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".side-menu") || event.target.closest(".menu-icon-btn")) return;
    sideMenu.classList.remove("open");
    gridContainer.classList.remove("menu-open");
    closeAllDropdowns();
  });

  sideMenu.querySelectorAll(".menu-title").forEach((title) => {
    title.addEventListener("click", () => {
      closeAllDropdowns();
      title.nextElementSibling?.classList.add("open");
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
  initCarousel();
  initSideMenu();
  initRecipeChecklist();
  initServingsScaling();
});
