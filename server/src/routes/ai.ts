import { Difficulty, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { evaluateCookNow } from "../services/cook-now.js";
import {
  generateCookNarrative,
  generateDishImage,
  generateMetadataSuggestion,
  isAiConfigured,
} from "../services/ai-provider.js";
import { getRecipeForUser } from "../services/recipe-access.js";
import { asyncHandler } from "../utils/async-handler.js";
import { aiCookFiltersSchema, imageGenerationSchema, metadataDraftSchema } from "./schemas.js";

export const aiRouter = Router();

aiRouter.use(requireAuth);

const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const buildRecipeWhere = (filters: {
  cuisineType?: string;
  maxPrepTimeMinutes?: number;
  difficulty?: Difficulty;
}): Prisma.RecipeWhereInput => ({
  cuisineType: filters.cuisineType ? { contains: filters.cuisineType, mode: "insensitive" } : undefined,
  prepTimeMinutes: filters.maxPrepTimeMinutes ? { lte: filters.maxPrepTimeMinutes } : undefined,
  difficulty: filters.difficulty,
});

aiRouter.post(
  "/cook-now",
  asyncHandler(async (req, res) => {
    const filters = aiCookFiltersSchema.parse(req.body ?? {});
    const userId = req.user!.id;

    const pantry = await prisma.pantryItem.findMany({ where: { userId } });

    const strictRecipes = await prisma.recipe.findMany({
      where: buildRecipeWhere(filters),
      include: {
        ingredients: true,
      },
    });
    let evaluation = evaluateCookNow({
      pantry,
      strictRecipes: strictRecipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        ingredients: recipe.ingredients,
      })),
      filters,
    });

    if (!evaluation.usedRelaxedFilters && evaluation.canCookNow.length === 0 && evaluation.canAlmostCook.length === 0) {
      const relaxedRecipes = await prisma.recipe.findMany({
        include: {
          ingredients: true,
        },
      });

      evaluation = evaluateCookNow({
        pantry,
        strictRecipes: strictRecipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          ingredients: recipe.ingredients,
        })),
        relaxedRecipes: relaxedRecipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          ingredients: recipe.ingredients,
        })),
        filters,
      });
    }

    const aiNarrative = pantry.length > 0
      ? await generateCookNarrative({
          pantry: pantry.map((item) => item.name),
          canCookNow: evaluation.canCookNow.map((item) => item.recipeName),
          canAlmostCook: evaluation.canAlmostCook.map((item) => ({
            name: item.recipeName,
            missing: item.missingIngredients,
          })),
        })
      : null;

    res.json({
      ...evaluation,
      source: aiNarrative ? "ai" : evaluation.source,
      aiNarrative,
    });
  }),
);

aiRouter.post(
  "/metadata",
  asyncHandler(async (req, res) => {
    const payload = metadataDraftSchema.parse(req.body);
    const metadata = await generateMetadataSuggestion(payload);
    res.json(metadata);
  }),
);

aiRouter.post(
  "/recipes/:id/generate-image",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const payload = imageGenerationSchema.parse(req.body ?? {});
    const recipe = await getRecipeForUser(recipeId);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    const generated = await generateDishImage({
      name: recipe.name,
      cuisineType: recipe.cuisineType,
      ingredients: recipe.ingredients,
      stylePrompt: payload.stylePrompt,
    });

    const updated = await prisma.recipe.update({
      where: {
        id: recipe.id,
      },
      data: {
        imageUrl: generated.url,
        imageSource: generated.source,
        imageQuery: generated.query ?? null,
        imagePrompt: generated.prompt,
        imageGeneratedAt: new Date(),
      },
      include: {
        ingredients: true,
      },
    });

    res.json({
      recipe: updated,
      source: generated.source,
      aiConfigured: isAiConfigured(),
    });
  }),
);
