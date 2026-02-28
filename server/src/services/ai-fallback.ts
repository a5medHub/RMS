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
  tomato: ["canned tomato", "tomato puree"],
};

const INGREDIENT_SYNONYMS: Record<string, string> = {
  tomatoes: "tomato",
  tomatos: "tomato",
  scallions: "green onion",
  springonion: "green onion",
  capsicum: "bell pepper",
  chillies: "chili",
  chilies: "chili",
  coriander: "cilantro",
  garbanzo: "chickpea",
  chickpeas: "chickpea",
  potatoes: "potato",
  onions: "onion",
  cloves: "clove",
  eggs: "egg",
  carrots: "carrot",
  peppers: "pepper",
};

const normalizeWhitespace = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const singularize = (value: string) => {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("es") && value.length > 4) {
    return value.slice(0, -2);
  }

  if (value.endsWith("s") && value.length > 3) {
    return value.slice(0, -1);
  }

  return value;
};

const canonicalWord = (word: string) => {
  const collapsed = word.replace(/[^a-z0-9]/g, "");
  const singular = singularize(collapsed);
  return INGREDIENT_SYNONYMS[singular] ?? singular;
};

const tokenizeIngredient = (value: string) => normalizeWhitespace(value)
  .split(/[^a-z0-9]+/)
  .filter(Boolean)
  .map(canonicalWord)
  .filter(Boolean);

const canonicalIngredient = (value: string) => tokenizeIngredient(value).join(" ");

const ingredientMatches = (pantryValue: string, recipeIngredient: string) => {
  const pantryTokens = tokenizeIngredient(pantryValue);
  const recipeTokens = tokenizeIngredient(recipeIngredient);

  if (!pantryTokens.length || !recipeTokens.length) {
    return false;
  }

  const pantrySet = new Set(pantryTokens);
  const overlap = recipeTokens.filter((token) => pantrySet.has(token));
  const ratio = overlap.length / recipeTokens.length;

  if (ratio >= 0.5) {
    return true;
  }

  const pantryCanonical = pantryTokens.join(" ");
  const recipeCanonical = recipeTokens.join(" ");
  return pantryCanonical.includes(recipeCanonical) || recipeCanonical.includes(pantryCanonical);
};

const normalize = (value: string) => normalizeWhitespace(value);

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
      .map((item) => canonicalWord(item.name.toLowerCase()))
      .filter((name) => ["milk", "cheese", "egg", "peanut", "almond", "wheat", "soy"].includes(name)),
    source: "fallback",
  };
};

export const fallbackImageDataUri = (recipeName: string, stylePrompt?: string) => {
  const tone = (recipeName + (stylePrompt ?? "")).toLowerCase();
  const sauce = tone.includes("tomato") || tone.includes("pizza") ? "#ef4444" : "#f59e0b";
  const garnish = tone.includes("salad") || tone.includes("herb") ? "#22c55e" : "#84cc16";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#16a34a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><ellipse cx="512" cy="520" rx="300" ry="90" fill="#0f172a" opacity="0.2"/><circle cx="512" cy="460" r="250" fill="#f8fafc"/><circle cx="512" cy="460" r="200" fill="#fff"/><ellipse cx="512" cy="460" rx="170" ry="120" fill="${sauce}" opacity="0.9"/><circle cx="445" cy="430" r="30" fill="${garnish}" opacity="0.9"/><circle cx="565" cy="495" r="26" fill="${garnish}" opacity="0.8"/><circle cx="520" cy="415" r="18" fill="#fde68a"/></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

export const fallbackCookNow = (payload: {
  recipes: Array<{ id: string; name: string; ingredients: Array<{ name: string }> }>;
  pantry: Array<{ name: string }>;
}) => {
  const pantryCanonical = payload.pantry
    .map((item) => canonicalIngredient(item.name))
    .filter(Boolean);

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
      .map((item) => item.name)
      .filter((ingredient) => {
        return !pantryCanonical.some((pantryItem) => ingredientMatches(pantryItem, ingredient));
      });

    const substitutions = missing.flatMap((name) => {
      const canonical = canonicalIngredient(name);
      const key = Object.keys(SUBSTITUTIONS).find((subKey) => canonical.includes(subKey));
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

    const recipeSize = Math.max(1, recipe.ingredients.length);
    const completionRatio = (recipeSize - missing.length) / recipeSize;
    if (missing.length <= 3 || completionRatio >= 0.55) {
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