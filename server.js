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

// Serve static files (CSS, JS, images)
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
  res.render("categories/breakfast/ricotta-pancakes", {
    title: "Ricotta Pancakes Recipe",
    activePage: "breakfast",
    recipePageCSS: true,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
