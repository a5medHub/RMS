import { Difficulty, RecipeStatus, SharePermission } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { canEditRecipe } from "../utils/permissions.js";
import { createRecipeSchema, importRecipesSchema, reviewSchema, shareRecipeSchema, updateRecipeSchema } from "./schemas.js";
import { getRecipeForUser, getSharePermission, recipeInclude } from "../services/recipe-access.js";
import { fetchTheMealDbRecipes } from "../services/recipe-source.js";

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
  return Object.values(Difficulty).includes(normalized as Difficulty) ? (normalized as Difficulty) : undefined;
};

recipeRouter.get("/", asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const scope = (req.query.scope as string | undefined) ?? "all";
  const query = (req.query.query as string | undefined)?.trim();
  const ingredient = (req.query.ingredient as string | undefined)?.trim();
  const cuisineType = (req.query.cuisineType as string | undefined)?.trim();
  const maxPrepTimeMinutes = req.query.maxPrepTimeMinutes ? Number(req.query.maxPrepTimeMinutes) : undefined;
  const status = parseRecipeStatus(req.query.status as string | undefined);
  const difficulty = parseDifficulty(req.query.difficulty as string | undefined);

  const where: Record<string, unknown> = {};

  if (scope === "mine") {
    where.ownerId = userId;
  } else if (scope === "shared") {
    where.shares = { some: { userId } };
  } else {
    where.OR = [{ ownerId: userId }, { shares: { some: { userId } } }];
  }

  if (query) {
    where.AND = [...((where.AND as unknown[]) ?? []), { name: { contains: query, mode: "insensitive" } }];
  }

  if (ingredient) {
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      {
        ingredients: {
          some: {
            name: {
              contains: ingredient,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  if (cuisineType) {
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      { cuisineType: { contains: cuisineType, mode: "insensitive" } },
    ];
  }

  if (typeof maxPrepTimeMinutes === "number" && Number.isFinite(maxPrepTimeMinutes)) {
    where.AND = [...((where.AND as unknown[]) ?? []), { prepTimeMinutes: { lte: maxPrepTimeMinutes } }];
  }

  if (status) {
    where.AND = [...((where.AND as unknown[]) ?? []), { statuses: { has: status } }];
  }

  if (difficulty) {
    where.AND = [...((where.AND as unknown[]) ?? []), { difficulty }];
  }

  const recipes = await prisma.recipe.findMany({
    where,
    include: recipeInclude,
    orderBy: {
      updatedAt: "desc",
    },
  });

  res.json(recipes);
}));

recipeRouter.get("/:id", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const recipe = await getRecipeForUser(recipeId, req.user!.id);

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found." });
  }

  res.json(recipe);
}));

recipeRouter.post("/", asyncHandler(async (req, res) => {
  const data = createRecipeSchema.parse(req.body);

  const recipe = await prisma.recipe.create({
    data: {
      ownerId: req.user!.id,
      name: data.name,
      instructions: data.instructions,
      cuisineType: data.cuisineType ?? null,
      prepTimeMinutes: data.prepTimeMinutes ?? null,
      cookTimeMinutes: data.cookTimeMinutes ?? null,
      servings: data.servings ?? null,
      difficulty: data.difficulty ?? null,
      statuses: data.statuses,
      tags: data.tags,
      aiSuggestedMetadata: data.aiSuggestedMetadata ?? undefined,
      isAiMetadataConfirmed: data.isAiMetadataConfirmed ?? false,
      nutrition: data.nutrition ?? undefined,
      allergens: data.allergens,
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
}));

recipeRouter.put("/:id", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const data = updateRecipeSchema.parse(req.body);

  const existing = await getRecipeForUser(recipeId, req.user!.id);
  if (!existing) {
    return res.status(404).json({ message: "Recipe not found." });
  }

  const permission = getSharePermission(existing, req.user!.id);
  if (!canEditRecipe(existing.ownerId, req.user!.id, permission)) {
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
        aiSuggestedMetadata: data.aiSuggestedMetadata as object | undefined,
        isAiMetadataConfirmed: data.isAiMetadataConfirmed,
        nutrition: data.nutrition as object | undefined,
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

  res.json(recipe);
}));

recipeRouter.delete("/:id", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const existing = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      ownerId: req.user!.id,
    },
  });

  if (!existing) {
    return res.status(404).json({ message: "Recipe not found or not owned by current user." });
  }

  await prisma.recipe.delete({ where: { id: recipeId } });
  res.status(204).send();
}));

recipeRouter.post("/:id/share", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const payload = shareRecipeSchema.parse(req.body);

  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      ownerId: req.user!.id,
    },
  });

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found or not owned by current user." });
  }

  const user = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!user) {
    return res.status(404).json({ message: "User to share with was not found." });
  }

  if (user.id === req.user!.id) {
    return res.status(400).json({ message: "You already own this recipe." });
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
}));

recipeRouter.delete("/:id/share/:userId", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  const targetUserId = readParam(req.params.userId);
  if (!recipeId || !targetUserId) {
    return res.status(400).json({ message: "Invalid share id parameters." });
  }

  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      ownerId: req.user!.id,
    },
  });

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found or not owned by current user." });
  }

  await prisma.recipeShare.deleteMany({
    where: {
      recipeId: recipe.id,
      userId: targetUserId,
    },
  });

  res.status(204).send();
}));

recipeRouter.get("/:id/shares", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      ownerId: req.user!.id,
    },
  });

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found or not owned by current user." });
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
}));

recipeRouter.post("/:id/share/editor", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      ownerId: req.user!.id,
    },
  });

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found or not owned by current user." });
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
}));

recipeRouter.get("/:id/reviews", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const recipe = await getRecipeForUser(recipeId, req.user!.id);
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
}));

recipeRouter.post("/:id/reviews", asyncHandler(async (req, res) => {
  const recipeId = readParam(req.params.id);
  if (!recipeId) {
    return res.status(400).json({ message: "Invalid recipe id." });
  }

  const payload = reviewSchema.parse(req.body);
  const recipe = await getRecipeForUser(recipeId, req.user!.id);
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
}));

recipeRouter.post("/import/free", asyncHandler(async (req, res) => {
  const { count } = importRecipesSchema.parse({ count: req.query.count ?? req.body?.count ?? 100 });
  const freeRecipes = await fetchTheMealDbRecipes(count);
  let created = 0;
  let skipped = 0;

  for (const recipe of freeRecipes) {
    const exists = await prisma.recipe.findFirst({
      where: {
        ownerId: req.user!.id,
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

    await prisma.recipe.create({
      data: {
        ownerId: req.user!.id,
        name: recipe.name,
        instructions: recipe.instructions,
        cuisineType: recipe.cuisineType,
        tags: recipe.tags,
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
}));

