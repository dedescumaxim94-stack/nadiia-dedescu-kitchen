import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import expressEjsLayouts from "express-ejs-layouts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressEjsLayouts);
app.set("layout", "layout");

// Serve static files (CSS, JS, images) without caching
app.use((req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Category titles mapping
const categoryTitles = {
  breakfast: "Breakfast Recipes",
  lunch: "Lunch Recipes",
  dinner: "Dinner Recipes",
  dessert: "Dessert Recipes",
  "set-menu": "Set Menu Recipes",
  "new-recipes": "New Recipe Recipes",
};

// Home route
app.get("/", (req, res) => {
  res.render("index", {
    title: "Categories",
    activePage: "home",
  });
});

// Dynamic category routes
app.get("/categories/:category", (req, res) => {
  const { category } = req.params;

  if (!categoryTitles[category]) {
    return res.status(404).render("404", { title: "Page Not Found" });
  }

  res.render("categories/category", {
    title: categoryTitles[category],
    activePage: category,
    categoryPageCSS: true,
  });
});

// Recipe detail route
app.get("/categories/breakfast/ricotta-pancakes", (req, res) => {
  res.render("categories/recipe", {
    title: "Ricotta Pancakes",
    subtitle: "Gourmet Ricotta Pancakes",
    description:
      "Delicate and airy ricotta pancakes with a soft, creamy texture, inspired by the French love for refined desserts. Light, fragrant, and perfect for breakfast or a sweet moment any time of day. Delicious on their own or served with honey, berries, or sour cream. 🤍",
    image: "/src/images/breakfast/Ricotta-Pancakes.png",
    activePage: "breakfast",
    recipePageCSS: true,
    meta: ["⏱ 10 min Prep", "🔥 15 min Cook", "👥 Serves 4"],
    ingredients: [
      { name: "Ricotta", image: "/src/images/ingredients/ricota-cheese.png", amount: "1 cup" },
      { name: "Eggs", image: "/src/images/ingredients/egg.png", amount: "1 large" },
      { name: "Sugar", image: "/src/images/ingredients/sugar.png", amount: "1.5 tbsp" },
      { name: "Vanilla Sugar", image: "/src/images/ingredients/vanilla-sugar.png", amount: "1 tsp" },
      { name: "All-purpose Flour", image: "/src/images/ingredients/all-purpose-flour.png", amount: "4 tbsp" },
      { name: "Baking Powder", image: "/src/images/ingredients/baking-powder.png", amount: "1/2 tsp" },
      { name: "Lemon", image: "/src/images/ingredients/lemon.png", amount: "1/4 tsp" },
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
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
