import type { Difficulty } from "@prisma/client";

export type SimpleIngredient = {
  name: string;
  quantity?: string | null;
  unit?: string | null;
};

export type SimpleRecipe = {
  id: string;
  name: string;
  cuisineType?: string | null;
  prepTimeMinutes?: number | null;
  difficulty?: Difficulty | null;
  ingredients: SimpleIngredient[];
};

export type SimplePantryItem = {
  name: string;
  quantity?: string | null;
  unit?: string | null;
};

export type CookNowFilters = {
  cuisineType?: string;
  maxPrepTimeMinutes?: number;
  difficulty?: Difficulty;
};

export type CookMatch = {
  recipeId: string;
  recipeName: string;
  missingIngredients: string[];
  substitutions: string[];
};

export type CookNowResult = {
  canCookNow: CookMatch[];
  canAlmostCook: CookMatch[];
  shoppingList: string[];
  source: "fallback" | "ai";
  usedRelaxedFilters?: boolean;
  reason?: string;
  guidance?: string;
};

export type MetadataSuggestion = {
  cuisineType: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  nutrition?: Record<string, string>;
  allergens?: string[];
  source: "fallback" | "ai";
  provider?: "deepseek" | "openai" | "fallback";
};

