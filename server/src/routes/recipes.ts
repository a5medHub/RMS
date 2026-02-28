import { Difficulty, Prisma, RecipeStatus, SharePermission, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { generateDishImage, isRenderableImageUrl } from "../services/ai-provider.js";
import { backfillRecipeImages } from "../services/image-backfill.js";
import { backfillRecipeMetadata, completeRecipeMetadata } from "../services/metadata-completion.js";
import { getRecipeForUser, recipeInclude } from "../services/recipe-access.js";
import { fetchTheMealDbRecipes } from "../services/recipe-source.js";
import { asyncHandler } from "../utils/async-handler.js";
import { canDeleteRecipe, canEditRecipe } from "../utils/permissions.js";
import {
  backfillLimitSchema,
  createRecipeSchema,
  importRecipesSchema,
  reviewSchema,
  shareRecipeSchema,
  updateRecipeSchema,
} from "./schemas.js";

export const recipeRouter = Router();

recipeRouter.use(requireAuth);

const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const parseRecipeStatus = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.toUpperCase();
  return Object.values(RecipeStatus).includes(normalized as RecipeStatus)
    ? (normalized as RecipeStatus)
    : undefined;
};

const parseDifficulty = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.toUpperCase();
  return Object.values(Difficulty).includes(normalized as Difficulty)
    ? (normalized as Difficulty)
    : undefined;
};

const ensureOwnerOrAdmin = (ownerId: string, currentUserId: string, currentUserRole: UserRole) =>
  ownerId === currentUserId || currentUserRole === UserRole.ADMIN;

recipeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const scope = (req.query.scope as string | undefined) ?? "all";
    const query = (req.query.query as string | undefined)?.trim();
    const ingredient = (req.query.ingredient as string | undefined)?.trim();
    const cuisineType = (req.query.cuisineType as string | undefined)?.trim();
    const maxPrepTimeMinutes = req.query.maxPrepTimeMinutes ? Number(req.query.maxPrepTimeMinutes) : undefined;
    const status = parseRecipeStatus(req.query.status as string | undefined);
    const difficulty = parseDifficulty(req.query.difficulty as string | undefined);

    const where: Prisma.RecipeWhereInput = {};
    const andFilters: Prisma.RecipeWhereInput[] = [];

    if (scope === "mine") {
      where.ownerId = userId;
    } else if (scope === "shared") {
      where.shares = { some: { userId } };
    }

    if (query) {
      andFilters.push({
        name: { contains: query, mode: "insensitive" },
      });
    }

    if (ingredient) {
      andFilters.push({
        ingredients: {
          some: {
            name: {
              contains: ingredient,
              mode: "insensitive",
            },
          },
        },
      });
    }

    if (cuisineType) {
      andFilters.push({
        cuisineType: { contains: cuisineType, mode: "insensitive" },
      });
    }

    if (typeof maxPrepTimeMinutes === "number" && Number.isFinite(maxPrepTimeMinutes)) {
      andFilters.push({ prepTimeMinutes: { lte: maxPrepTimeMinutes } });
    }

    if (status) {
      andFilters.push({ statuses: { has: status } });
    }

    if (difficulty) {
      andFilters.push({ difficulty });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const recipes = await prisma.recipe.findMany({
      where,
      include: recipeInclude,
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json(recipes);
  }),
);

recipeRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const recipe = await getRecipeForUser(recipeId);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    res.json(recipe);
  }),
);

recipeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createRecipeSchema.parse(req.body);
    const completedMetadata = await completeRecipeMetadata({
      name: data.name,
      instructions: data.instructions,
      ingredients: data.ingredients,
      cuisineType: data.cuisineType,
      prepTimeMinutes: data.prepTimeMinutes,
      cookTimeMinutes: data.cookTimeMinutes,
      servings: data.servings,
      difficulty: data.difficulty,
      tags: data.tags,
      aiSuggestedMetadata: data.aiSuggestedMetadata as Prisma.JsonValue | null | undefined,
    });

    const generatedImage = await generateDishImage({
      name: data.name,
      cuisineType: completedMetadata.cuisineType,
      ingredients: data.ingredients,
    });

    const recipe = await prisma.recipe.create({
      data: {
        ownerId: req.user!.id,
        name: data.name,
        instructions: data.instructions,
        cuisineType: completedMetadata.cuisineType,
        prepTimeMinutes: completedMetadata.prepTimeMinutes,
        cookTimeMinutes: completedMetadata.cookTimeMinutes,
        servings: completedMetadata.servings,
        difficulty: completedMetadata.difficulty,
        statuses: data.statuses,
        tags: completedMetadata.tags,
        aiSuggestedMetadata: completedMetadata.aiSuggestedMetadata as Prisma.InputJsonValue | undefined,
        isAiMetadataConfirmed: completedMetadata.isAiMetadataConfirmed,
        nutrition:
          data.nutrition === undefined
            ? undefined
            : (data.nutrition as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput),
        allergens: data.allergens,
        imageUrl: generatedImage.url,
        imageSource: generatedImage.source,
        imageQuery: generatedImage.query ?? null,
        imagePrompt: generatedImage.prompt,
        imageGeneratedAt: new Date(),
        ingredients: {
          create: data.ingredients.map((item) => ({
            name: item.name,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
          })),
        },
      },
      include: recipeInclude,
    });

    res.status(201).json(recipe);
  }),
);

recipeRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const data = updateRecipeSchema.parse(req.body);

    const existing = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    if (
      !canEditRecipe({
        ownerId: existing.ownerId,
        userId: req.user!.id,
        userRole: req.user!.role,
        isSystem: existing.isSystem,
      })
    ) {
      return res.status(403).json({ message: "You do not have permission to edit this recipe." });
    }

    const recipe = await prisma.$transaction(async (tx) => {
      if (data.ingredients) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
      }

      return tx.recipe.update({
        where: { id: recipeId },
        data: {
          name: data.name,
          instructions: data.instructions,
          cuisineType: data.cuisineType,
          prepTimeMinutes: data.prepTimeMinutes,
          cookTimeMinutes: data.cookTimeMinutes,
          servings: data.servings,
          difficulty: data.difficulty,
          statuses: data.statuses,
          tags: data.tags,
          aiSuggestedMetadata:
            data.aiSuggestedMetadata === undefined
              ? undefined
              : (data.aiSuggestedMetadata as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput),
          isAiMetadataConfirmed: data.isAiMetadataConfirmed,
          nutrition:
            data.nutrition === undefined
              ? undefined
              : (data.nutrition as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput),
          allergens: data.allergens,
          ingredients: data.ingredients
            ? {
                create: data.ingredients.map((item) => ({
                  name: item.name,
                  quantity: item.quantity ?? null,
                  unit: item.unit ?? null,
                })),
              }
            : undefined,
        },
        include: recipeInclude,
      });
    });

    const completedMetadata = await completeRecipeMetadata({
      name: recipe.name,
      instructions: recipe.instructions,
      ingredients: recipe.ingredients,
      cuisineType: recipe.cuisineType,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      tags: recipe.tags,
      aiSuggestedMetadata: recipe.aiSuggestedMetadata as Prisma.JsonValue | null | undefined,
    });

    let hydratedRecipe = recipe;
    const metadataNeedsUpdate = (
      hydratedRecipe.cuisineType !== completedMetadata.cuisineType
      || hydratedRecipe.prepTimeMinutes !== completedMetadata.prepTimeMinutes
      || hydratedRecipe.cookTimeMinutes !== completedMetadata.cookTimeMinutes
      || hydratedRecipe.servings !== completedMetadata.servings
      || hydratedRecipe.difficulty !== completedMetadata.difficulty
      || JSON.stringify(hydratedRecipe.tags) !== JSON.stringify(completedMetadata.tags)
    );

    if (metadataNeedsUpdate) {
      hydratedRecipe = await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          cuisineType: completedMetadata.cuisineType,
          prepTimeMinutes: completedMetadata.prepTimeMinutes,
          cookTimeMinutes: completedMetadata.cookTimeMinutes,
          servings: completedMetadata.servings,
          difficulty: completedMetadata.difficulty,
          tags: completedMetadata.tags,
          aiSuggestedMetadata: completedMetadata.aiSuggestedMetadata as Prisma.InputJsonValue | undefined,
          isAiMetadataConfirmed: completedMetadata.isAiMetadataConfirmed,
        },
        include: recipeInclude,
      });
    }

    if (!isRenderableImageUrl(hydratedRecipe.imageUrl)) {
      const regeneratedImage = await generateDishImage({
        name: hydratedRecipe.name,
        cuisineType: hydratedRecipe.cuisineType,
        ingredients: hydratedRecipe.ingredients,
      });

      const withImage = await prisma.recipe.update({
        where: { id: hydratedRecipe.id },
        data: {
          imageUrl: regeneratedImage.url,
          imageSource: regeneratedImage.source,
          imageQuery: regeneratedImage.query ?? null,
          imagePrompt: regeneratedImage.prompt,
          imageGeneratedAt: new Date(),
        },
        include: recipeInclude,
      });

      return res.json(withImage);
    }

    res.json(hydratedRecipe);
  }),
);

recipeRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const existing = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: {
        id: true,
        ownerId: true,
        isSystem: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    if (
      !canDeleteRecipe({
        ownerId: existing.ownerId,
        userId: req.user!.id,
        userRole: req.user!.role,
        isSystem: existing.isSystem,
      })
    ) {
      return res.status(403).json({ message: "You do not have permission to delete this recipe." });
    }

    await prisma.recipe.delete({ where: { id: recipeId } });
    res.status(204).send();
  }),
);

recipeRouter.post(
  "/import/free",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: "Only admin can import system recipes." });
    }

    const { count } = importRecipesSchema.parse({ count: req.query.count ?? req.body?.count ?? 100 });
    const freeRecipes = await fetchTheMealDbRecipes(count);
    let created = 0;
    let skipped = 0;

    for (const recipe of freeRecipes) {
      const exists = await prisma.recipe.findFirst({
        where: {
          name: {
            equals: recipe.name,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (exists) {
        skipped += 1;
        continue;
      }

      const completedMetadata = await completeRecipeMetadata({
        name: recipe.name,
        instructions: recipe.instructions,
        ingredients: recipe.ingredients,
        cuisineType: recipe.cuisineType,
        tags: recipe.tags,
      }, { force: true });

      await prisma.recipe.create({
        data: {
          ownerId: req.user!.id,
          isSystem: true,
          name: recipe.name,
          instructions: recipe.instructions,
          cuisineType: completedMetadata.cuisineType,
          prepTimeMinutes: completedMetadata.prepTimeMinutes,
          cookTimeMinutes: completedMetadata.cookTimeMinutes,
          servings: completedMetadata.servings,
          difficulty: completedMetadata.difficulty,
          tags: completedMetadata.tags,
          aiSuggestedMetadata: completedMetadata.aiSuggestedMetadata as Prisma.InputJsonValue | undefined,
          isAiMetadataConfirmed: completedMetadata.isAiMetadataConfirmed,
          imageUrl: recipe.imageUrl,
          imageSource: recipe.imageUrl ? "themealdb" : null,
          imageQuery: recipe.imageUrl ? recipe.name : null,
          imageGeneratedAt: recipe.imageUrl ? new Date() : null,
          statuses: [RecipeStatus.TO_TRY],
          ingredients: {
            create: recipe.ingredients.map((item) => ({
              name: item.name,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
            })),
          },
        },
      });

      created += 1;
    }

    res.json({
      message: "Free recipe import finished.",
      source: "TheMealDB",
      requested: count,
      fetched: freeRecipes.length,
      created,
      skipped,
    });
  }),
);

recipeRouter.post(
  "/images/backfill",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: "Only admin can backfill recipe images." });
    }

    const { limit } = backfillLimitSchema.parse({ limit: req.body?.limit ?? req.query.limit ?? 100 });
    const result = await backfillRecipeImages(limit);

    res.json({
      message: "Backfill completed.",
      ...result,
    });
  }),
);

recipeRouter.post(
  "/metadata/backfill",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: "Only admin can backfill recipe metadata." });
    }

    const { limit } = backfillLimitSchema.parse({ limit: req.body?.limit ?? req.query.limit ?? 100 });
    const result = await backfillRecipeMetadata(limit);

    res.json({
      message: "Metadata backfill completed.",
      ...result,
    });
  }),
);

recipeRouter.post(
  "/:id/share",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const payload = shareRecipeSchema.parse(req.body);

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { id: true, ownerId: true },
    });

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    if (!ensureOwnerOrAdmin(recipe.ownerId, req.user!.id, req.user!.role)) {
      return res.status(403).json({ message: "Only owner or admin can share this recipe." });
    }

    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      return res.status(404).json({ message: "User to share with was not found." });
    }

    if (user.id === recipe.ownerId) {
      return res.status(400).json({ message: "Owner already has access." });
    }

    const share = await prisma.recipeShare.upsert({
      where: {
        recipeId_userId: {
          recipeId: recipe.id,
          userId: user.id,
        },
      },
      update: {
        permission: payload.permission,
      },
      create: {
        recipeId: recipe.id,
        userId: user.id,
        permission: payload.permission,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json(share);
  }),
);

recipeRouter.delete(
  "/:id/share/:userId",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    const targetUserId = readParam(req.params.userId);
    if (!recipeId || !targetUserId) {
      return res.status(400).json({ message: "Invalid share id parameters." });
    }

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { id: true, ownerId: true },
    });

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    if (!ensureOwnerOrAdmin(recipe.ownerId, req.user!.id, req.user!.role)) {
      return res.status(403).json({ message: "Only owner or admin can remove sharing." });
    }

    await prisma.recipeShare.deleteMany({
      where: {
        recipeId: recipe.id,
        userId: targetUserId,
      },
    });

    res.status(204).send();
  }),
);

recipeRouter.get(
  "/:id/shares",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { id: true, ownerId: true },
    });

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    if (!ensureOwnerOrAdmin(recipe.ownerId, req.user!.id, req.user!.role)) {
      return res.status(403).json({ message: "Only owner or admin can list sharing permissions." });
    }

    const shares = await prisma.recipeShare.findMany({
      where: {
        recipeId: recipe.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(shares);
  }),
);

recipeRouter.post(
  "/:id/share/editor",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { id: true, ownerId: true },
    });

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    if (!ensureOwnerOrAdmin(recipe.ownerId, req.user!.id, req.user!.role)) {
      return res.status(403).json({ message: "Only owner or admin can edit sharing permissions." });
    }

    const userId = req.body?.userId as string | undefined;
    if (!userId) {
      return res.status(400).json({ message: "userId is required." });
    }

    const share = await prisma.recipeShare.updateMany({
      where: {
        recipeId: recipe.id,
        userId,
      },
      data: {
        permission: SharePermission.EDITOR,
      },
    });

    if (share.count === 0) {
      return res.status(404).json({ message: "Share entry not found." });
    }

    res.json({ message: "Permission updated." });
  }),
);

recipeRouter.get(
  "/:id/reviews",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const recipe = await getRecipeForUser(recipeId);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    const reviews = await prisma.recipeReview.findMany({
      where: { recipeId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(reviews);
  }),
);

recipeRouter.post(
  "/:id/reviews",
  asyncHandler(async (req, res) => {
    const recipeId = readParam(req.params.id);
    if (!recipeId) {
      return res.status(400).json({ message: "Invalid recipe id." });
    }

    const payload = reviewSchema.parse(req.body);
    const recipe = await getRecipeForUser(recipeId);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    const review = await prisma.recipeReview.upsert({
      where: {
        recipeId_userId: {
          recipeId,
          userId: req.user!.id,
        },
      },
      update: {
        rating: payload.rating,
        comment: payload.comment,
      },
      create: {
        recipeId,
        userId: req.user!.id,
        rating: payload.rating,
        comment: payload.comment,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json(review);
  }),
);
