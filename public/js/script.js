// ================================================
//     Home page Carousel pictures
// ================================================

const track = document.querySelector(".carousel-track");

// Only run carousel code if the carousel exists (home page only)
if (track) {
  const nextBtn = document.querySelector(".next-btn");
  const prevBtn = document.querySelector(".prev-btn");
  const items = Array.from(track.children);

  let currentIndex = 0;

  // 1. Function to move the carousel
  const moveToSlide = (index) => {
    // We calculate the width of a single item dynamically
    const itemWidth = items[0].getBoundingClientRect().width;

    // Move the track: index * width (negative because we slide left)
    track.style.transform = `translateX(-${index * itemWidth}px)`;
  };

  // 2. Next Button Listener
  nextBtn.addEventListener("click", () => {
    // Only move if we aren't at the very end
    // (Total items minus the 5 visible ones)
    const maxIndex = items.length - 5;

    if (currentIndex < maxIndex) {
      currentIndex++;
      moveToSlide(currentIndex);
    } else {
      // Optional: Loop back to start
      currentIndex = 0;
      moveToSlide(currentIndex);
    }
  });

  // 3. Previous Button Listener
  prevBtn.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      moveToSlide(currentIndex);
    } else {
      // Optional: Loop to the very end
      currentIndex = items.length - 5;
      moveToSlide(currentIndex);
    }
  });

  // 4. Handle Window Resize
  // If the user resizes the window, the image width changes.
  // We need to update the position so it stays aligned.
  window.addEventListener("resize", () => {
    moveToSlide(currentIndex);
  });
}

// ================================================
//     Side Menu Toggle
// ================================================

document.addEventListener("DOMContentLoaded", () => {
  const menuIcons = document.querySelectorAll(".menu-icon-btn");
  const sideMenu = document.querySelector(".side-menu");
  const body = document.querySelector(".grid-container");

  menuIcons.forEach((icon) => {
    icon.addEventListener("click", () => {
      sideMenu.classList.toggle("open");
      body.classList.toggle("menu-open");
      // Open the first dropdown by default when menu opens
      const firstDropdown = document.querySelector(".dropdown");
      if (sideMenu.classList.contains("open")) {
        firstDropdown.classList.add("open");
      } else {
        // Close all dropdowns when menu closes
        document.querySelectorAll(".dropdown").forEach((drop) => drop.classList.remove("open"));
      }
    });
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".side-menu") && !e.target.closest(".menu-icon-btn")) {
      sideMenu.classList.remove("open");
      body.classList.remove("menu-open");
      // Close all dropdowns
      document.querySelectorAll(".dropdown").forEach((drop) => drop.classList.remove("open"));
    }
  });

  // Dropdown toggles
  const menuTitles = document.querySelectorAll(".menu-title");
  menuTitles.forEach((title) => {
    title.addEventListener("click", () => {
      // Close all dropdowns
      document.querySelectorAll(".dropdown").forEach((drop) => drop.classList.remove("open"));
      // Open the clicked one
      const dropdown = title.nextElementSibling;
      dropdown.classList.add("open");
    });
  });

  // ================================================
  //   Recipe page, action check-ingredients state
  // ================================================

  // 1. Select all ingredient cards
  const ingredients = document.querySelectorAll(".ingredient-item");

  // 2. Loop through them and add the click event
  ingredients.forEach((card) => {
    card.addEventListener("click", () => {
      // 3. Toggle the class "has-ingredient" on/off
      card.classList.toggle("has-ingredient");

      // Optional: Add a subtle vibration for mobile users (Haptic Feedback)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    });
  });

  // ================================================
  //   Action check-steps state

  // 1. Select all step items
  const steps = document.querySelectorAll(".steps-list li");

  // 2. Loop through them and add the click event
  steps.forEach((step) => {
    step.addEventListener("click", () => {
      // 3. Toggle the class "completed-step" on/off
      step.classList.toggle("completed-step");

      // Optional: Add a subtle vibration for mobile users (Haptic Feedback)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    });
  });
});
