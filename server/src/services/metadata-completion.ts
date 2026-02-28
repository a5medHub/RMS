import { Difficulty, Prisma } from "@prisma/client";
import { prisma } from "../config/db.js";
import { generateMetadataSuggestion } from "./ai-provider.js";

const MIN_PREP_MINUTES = 5;
const MIN_COOK_MINUTES = 5;
const MIN_SERVINGS = 1;

type IngredientInput = {
  name: string;
};

type MetadataCompletionInput = {
  name: string;
  instructions: string;
  ingredients: IngredientInput[];
  cuisineType?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  servings?: number | null;
  difficulty?: Difficulty | null;
  tags?: string[];
  aiSuggestedMetadata?: Prisma.JsonValue | null;
};

const toSafeMinutes = (value: number | null | undefined, minimum: number) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.round(value));
};

const toSafeServings = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 2;
  }

  return Math.max(MIN_SERVINGS, Math.round(value));
};

const toSafeDifficulty = (value: Difficulty | string | null | undefined): Difficulty => {
  if (value === Difficulty.EASY || value === Difficulty.MEDIUM || value === Difficulty.HARD) {
    return value;
  }

  return Difficulty.MEDIUM;
};

export const hasMissingRecipeMetadata = (input: Pick<MetadataCompletionInput, "difficulty" | "prepTimeMinutes" | "cookTimeMinutes" | "servings">) => {
  return (
    !input.difficulty
    || !input.prepTimeMinutes
    || input.prepTimeMinutes <= 0
    || !input.cookTimeMinutes
    || input.cookTimeMinutes <= 0
    || !input.servings
    || input.servings <= 0
  );
};

export const completeRecipeMetadata = async (
  input: MetadataCompletionInput,
  options?: { force?: boolean },
) => {
  const shouldComplete = options?.force || hasMissingRecipeMetadata(input);

  if (!shouldComplete) {
    return {
      cuisineType: input.cuisineType ?? null,
      prepTimeMinutes: input.prepTimeMinutes ?? null,
      cookTimeMinutes: input.cookTimeMinutes ?? null,
      servings: input.servings ?? null,
      difficulty: input.difficulty ?? null,
      tags: input.tags ?? [],
      aiSuggestedMetadata: input.aiSuggestedMetadata ?? undefined,
      isAiMetadataConfirmed: Boolean(input.aiSuggestedMetadata),
    };
  }

  const suggestion = await generateMetadataSuggestion({
    name: input.name,
    instructions: input.instructions,
    ingredients: input.ingredients,
  });

  const prepTimeMinutes = toSafeMinutes(input.prepTimeMinutes ?? suggestion.prepTimeMinutes, MIN_PREP_MINUTES);
  const cookTimeMinutes = toSafeMinutes(input.cookTimeMinutes ?? suggestion.cookTimeMinutes, MIN_COOK_MINUTES);
  const servings = toSafeServings(input.servings ?? suggestion.servings);
  const difficulty = toSafeDifficulty(input.difficulty ?? suggestion.difficulty);

  const suggestedTags = Array.isArray(suggestion.tags) ? suggestion.tags : [];
  const currentTags = Array.isArray(input.tags) ? input.tags : [];
  const tags = currentTags.length > 0 ? currentTags : suggestedTags;

  const aiSuggestedMetadata: Prisma.InputJsonValue = {
    source: suggestion.source,
    provider: suggestion.provider ?? "fallback",
    generatedAt: new Date().toISOString(),
    suggested: {
      cuisineType: suggestion.cuisineType,
      prepTimeMinutes: suggestion.prepTimeMinutes,
      cookTimeMinutes: suggestion.cookTimeMinutes,
      servings: suggestion.servings,
      difficulty: suggestion.difficulty,
      tags: suggestion.tags,
      nutrition: suggestion.nutrition,
      allergens: suggestion.allergens,
    },
  };

  return {
    cuisineType: input.cuisineType ?? suggestion.cuisineType,
    prepTimeMinutes,
    cookTimeMinutes,
    servings,
    difficulty,
    tags,
    aiSuggestedMetadata,
    isAiMetadataConfirmed: false,
  };
};

export const parseBackfillLimit = (value?: unknown, fallback = 100) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(3000, Math.floor(parsed)));
};

export const backfillRecipeMetadata = async (limit = 100) => {
  const recipes = await prisma.recipe.findMany({
    where: {
      OR: [
        { difficulty: null },
        { prepTimeMinutes: null },
        { prepTimeMinutes: { lte: 0 } },
        { cookTimeMinutes: null },
        { cookTimeMinutes: { lte: 0 } },
        { servings: null },
        { servings: { lte: 0 } },
      ],
    },
    include: {
      ingredients: true,
    },
    take: limit,
    orderBy: {
      updatedAt: "desc",
    },
  });

  let updated = 0;
  let failed = 0;

  for (const recipe of recipes) {
    try {
      const metadata = await completeRecipeMetadata({
        name: recipe.name,
        instructions: recipe.instructions,
        ingredients: recipe.ingredients,
        cuisineType: recipe.cuisineType,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        servings: recipe.servings,
        difficulty: recipe.difficulty,
        tags: recipe.tags,
        aiSuggestedMetadata: recipe.aiSuggestedMetadata,
      }, { force: true });

      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          cuisineType: metadata.cuisineType,
          prepTimeMinutes: metadata.prepTimeMinutes,
          cookTimeMinutes: metadata.cookTimeMinutes,
          servings: metadata.servings,
          difficulty: metadata.difficulty,
          tags: metadata.tags,
          aiSuggestedMetadata: metadata.aiSuggestedMetadata,
          isAiMetadataConfirmed: metadata.isAiMetadataConfirmed,
        },
      });

      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: recipes.length,
    updated,
    failed,
  };
};