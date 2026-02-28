import { Router } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { fallbackCookNow, fallbackImageDataUri } from "../services/ai-fallback.js";
import { generateCookNarrative, generateDishImage, generateMetadataSuggestion, isAiConfigured } from "../services/ai-provider.js";
import { aiCookFiltersSchema, imageGenerationSchema, metadataDraftSchema } from "./schemas.js";
import { getRecipeForUser } from "../services/recipe-access.js";

export const aiRouter = Router();

aiRouter.use(requireAuth);

const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

aiRouter.post("/cook-now", asyncHandler(async (req, res) => {
  const filters = aiCookFiltersSchema.parse(req.body ?? {});
  const userId = req.user!.id;

  const recipes = await prisma.recipe.findMany({
    where: {
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
      cuisineType: filters.cuisineType ? { contains: filters.cuisineType, mode: "insensitive" } : undefined,
      prepTimeMinutes: filters.maxPrepTimeMinutes ? { lte: filters.maxPrepTimeMinutes } : undefined,
      difficulty: filters.difficulty,
    },
    include: {
      ingredients: true,
    },
  });

  const pantry = await prisma.pantryItem.findMany({ where: { userId } });

  const fallback = fallbackCookNow({
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      ingredients: recipe.ingredients,
    })),
    pantry,
  });

  const aiNarrative = await generateCookNarrative({
    pantry: pantry.map((item) => item.name),
    canCookNow: fallback.canCookNow.map((item) => item.recipeName),
    canAlmostCook: fallback.canAlmostCook.map((item) => ({
      name: item.recipeName,
      missing: item.missingIngredients,
    })),
  });

  res.json({
    ...fallback,
    source: aiNarrative ? "ai" : fallback.source,
    aiNarrative,
  });
}));

aiRouter.post("/metadata", asyncHandler(async (req, res) => {
  const payload = metadataDraftSchema.parse(req.body);
  const metadata = await generateMetadataSuggestion(payload);
  res.json(metadata);
}));

aiRouter.post("/recipes/:id/generate-image", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const payload = imageGenerationSchema.parse(req.body ?? {});
  const recipe = await getRecipeForUser(recipeId, req.user!.id);

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found." });
  }

  const prompt = `Food photography of ${recipe.name}. Ingredients: ${recipe.ingredients
    .map((item) => item.name)
    .join(", ")}. Style: ${payload.stylePrompt ?? "cinematic plated dish"}.`;

  const aiImage = await generateDishImage(prompt);
  const imageUrl = aiImage ?? fallbackImageDataUri(recipe.name, payload.stylePrompt);

  const updated = await prisma.recipe.update({
    where: {
      id: recipe.id,
    },
    data: {
      imageUrl,
      imagePrompt: prompt,
      imageGeneratedAt: new Date(),
    },
    include: {
      ingredients: true,
    },
  });

  res.json({
    recipe: updated,
    source: aiImage ? "ai" : "fallback",
    aiConfigured: isAiConfigured(),
  });
}));

