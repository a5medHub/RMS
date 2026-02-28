import type { Difficulty } from "@prisma/client";
import { fallbackCookNow } from "./ai-fallback.js";

type RecipeInput = {
  id: string;
  name: string;
  ingredients: Array<{ name: string }>;
};

type PantryInput = {
  name: string;
};

type AssistantFilters = {
  cuisineType?: string;
  maxPrepTimeMinutes?: number;
  difficulty?: Difficulty;
};

export type CookNowEvaluation = ReturnType<typeof fallbackCookNow> & {
  usedRelaxedFilters: boolean;
  reason: string;
  guidance: string;
};

const hasFilters = (filters: AssistantFilters) => Boolean(filters.cuisineType || filters.maxPrepTimeMinutes || filters.difficulty);

export const evaluateCookNow = (payload: {
  pantry: PantryInput[];
  strictRecipes: RecipeInput[];
  relaxedRecipes?: RecipeInput[];
  filters: AssistantFilters;
}): CookNowEvaluation => {
  const strictResult = fallbackCookNow({
    recipes: payload.strictRecipes,
    pantry: payload.pantry,
  });

  if (payload.pantry.length === 0) {
    return {
      ...strictResult,
      usedRelaxedFilters: false,
      reason: "Your pantry is empty.",
      guidance: "Add ingredients in My Pantry to get cooking recommendations.",
    };
  }

  const strictHasMatches = strictResult.canCookNow.length > 0 || strictResult.canAlmostCook.length > 0;

  if (strictHasMatches) {
    return {
      ...strictResult,
      usedRelaxedFilters: false,
      reason: "",
      guidance: "",
    };
  }

  const filtersApplied = hasFilters(payload.filters);
  if (filtersApplied && payload.relaxedRecipes && payload.relaxedRecipes.length > 0) {
    const relaxedResult = fallbackCookNow({
      recipes: payload.relaxedRecipes,
      pantry: payload.pantry,
    });

    const relaxedHasMatches = relaxedResult.canCookNow.length > 0 || relaxedResult.canAlmostCook.length > 0;
    if (relaxedHasMatches) {
      return {
        ...relaxedResult,
        usedRelaxedFilters: true,
        reason: "No strict filter matches were found.",
        guidance: "Showing relaxed matches based on your pantry ingredients.",
      };
    }

    return {
      ...strictResult,
      usedRelaxedFilters: false,
      reason: "No recipes matched the selected filters.",
      guidance: "Try removing cuisine/prep/difficulty filters or add more pantry ingredients.",
    };
  }

  return {
    ...strictResult,
    usedRelaxedFilters: false,
    reason: "No matching recipes found for pantry ingredients.",
    guidance: "Add pantry items or import recipes with overlapping ingredients.",
  };
};