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
//   Recipe page, action check-ingredients state
// ================================================

document.addEventListener("DOMContentLoaded", () => {
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
  //   Recipe page, action check-steps state
  // ================================================

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
