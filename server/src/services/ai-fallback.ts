import type { MetadataSuggestion } from "./types.js";

const CUISINE_KEYWORDS: Record<string, string[]> = {
  Italian: ["basil", "oregano", "parmesan", "pasta", "tomato"],
  Mexican: ["tortilla", "jalapeno", "cumin", "beans", "avocado"],
  Indian: ["garam masala", "turmeric", "curry", "ginger", "cardamom"],
  Japanese: ["soy sauce", "miso", "nori", "mirin", "dashi"],
  American: ["cheddar", "bbq", "mustard", "ketchup", "beef"],
};

const SUBSTITUTIONS: Record<string, string[]> = {
  egg: ["flaxseed meal + water", "mashed banana"],
  milk: ["oat milk", "almond milk"],
  butter: ["olive oil", "coconut oil"],
  sugar: ["honey", "maple syrup"],
  flour: ["oat flour", "almond flour"],
};

const normalize = (value: string) => value.trim().toLowerCase();

const findCuisine = (text: string) => {
  const normalized = normalize(text);

  for (const [cuisine, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return cuisine;
    }
  }

  return "International";
};

export const fallbackMetadataSuggestion = (payload: {
  name: string;
  ingredients: Array<{ name: string }>;
  instructions: string;
}): MetadataSuggestion => {
  const allText = `${payload.name} ${payload.ingredients.map((item) => item.name).join(" ")} ${payload.instructions}`;
  const ingredientCount = payload.ingredients.length;
  const wordCount = payload.instructions.split(/\s+/).filter(Boolean).length;

  const prepTimeMinutes = Math.min(60, Math.max(10, ingredientCount * 4));
  const cookTimeMinutes = Math.min(120, Math.max(10, Math.round(wordCount / 2)));

  let difficulty: MetadataSuggestion["difficulty"] = "EASY";
  if (ingredientCount > 8 || wordCount > 140) {
    difficulty = "MEDIUM";
  }
  if (ingredientCount > 14 || wordCount > 260) {
    difficulty = "HARD";
  }

  const tags = [
    payload.name.toLowerCase().includes("salad") ? "fresh" : "home-cooked",
    payload.name.toLowerCase().includes("soup") ? "comfort" : "weeknight",
  ];

  return {
    cuisineType: findCuisine(allText),
    prepTimeMinutes,
    cookTimeMinutes,
    servings: Math.min(8, Math.max(2, Math.ceil(ingredientCount / 2))),
    difficulty,
    tags: Array.from(new Set(tags)),
    nutrition: {
      calories: "Estimated by ingredient volume",
      protein: "Moderate",
      carbs: "Moderate",
      fat: "Moderate",
    },
    allergens: payload.ingredients
      .map((item) => item.name.toLowerCase())
      .filter((name) => ["milk", "cheese", "egg", "peanut", "almond", "wheat", "soy"].includes(name)),
    source: "fallback",
  };
};

export const fallbackImageDataUri = (recipeName: string, stylePrompt?: string) => {
  const safeTitle = recipeName.replace(/[<>&"]/g, "");
  const safeStyle = (stylePrompt ?? "Chef style plating").replace(/[<>&"]/g, "");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="512" cy="440" r="220" fill="#fff" opacity="0.9"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="54" font-family="Verdana" fill="#1f2937">${safeTitle}</text><text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-size="30" font-family="Verdana" fill="#1f2937">${safeStyle}</text></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

export const fallbackCookNow = (payload: {
  recipes: Array<{ id: string; name: string; ingredients: Array<{ name: string }> }>;
  pantry: Array<{ name: string }>;
}) => {
  const pantrySet = new Set(payload.pantry.map((item) => normalize(item.name)));

  const canCookNow: Array<{
    recipeId: string;
    recipeName: string;
    missingIngredients: string[];
    substitutions: string[];
  }> = [];
  const canAlmostCook: Array<{
    recipeId: string;
    recipeName: string;
    missingIngredients: string[];
    substitutions: string[];
  }> = [];

  for (const recipe of payload.recipes) {
    const missing = recipe.ingredients
      .map((item) => normalize(item.name))
      .filter((name) => !pantrySet.has(name));

    const substitutions = missing.flatMap((name) => {
      const key = Object.keys(SUBSTITUTIONS).find((subKey) => name.includes(subKey));
      if (!key) {
        return [];
      }

      return SUBSTITUTIONS[key].map((value) => `${name} -> ${value}`);
    });

    if (missing.length === 0) {
      canCookNow.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        missingIngredients: [],
        substitutions,
      });
      continue;
    }

    if (missing.length <= 3) {
      canAlmostCook.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        missingIngredients: missing,
        substitutions,
      });
    }
  }

  const shoppingList = Array.from(new Set(canAlmostCook.flatMap((recipe) => recipe.missingIngredients))).sort();

  return {
    canCookNow,
    canAlmostCook,
    shoppingList,
    source: "fallback" as const,
  };
};

