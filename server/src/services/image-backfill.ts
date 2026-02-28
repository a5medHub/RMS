import { prisma } from "../config/db.js";
import { generateDishImage, isRenderableImageUrl } from "./ai-provider.js";

export const parseBackfillLimit = (value?: unknown, fallback = 100) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(3000, Math.floor(parsed)));
};

export const backfillRecipeImages = async (limit = 100) => {
  const recipes = await prisma.recipe.findMany({
    where: {
      OR: [
        { imageUrl: null },
        { imageUrl: "" },
        { imageUrl: { startsWith: "data:text" } },
        { imageUrl: { contains: "undefined" } },
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
    if (isRenderableImageUrl(recipe.imageUrl)) {
      continue;
    }

    try {
      const image = await generateDishImage({
        name: recipe.name,
        cuisineType: recipe.cuisineType,
        ingredients: recipe.ingredients,
      });

      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          imageUrl: image.url,
          imageSource: image.source,
          imageQuery: image.query ?? null,
          imagePrompt: image.prompt,
          imageGeneratedAt: new Date(),
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
