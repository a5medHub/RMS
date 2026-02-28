import { prisma } from "../config/db.js";
import type { RecipeStatus } from "@prisma/client";

export const recipeIncludeForUser = (userId: string) => ({
  ingredients: true,
  reviews: {
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
      createdAt: "desc" as const,
    },
  },
  shares: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  recipeUserStatuses: {
    where: {
      userId,
    },
    select: {
      statuses: true,
    },
    take: 1,
  },
});

type RecipeWithStatusJoin = {
  recipeUserStatuses: Array<{ statuses: RecipeStatus[] }>;
};

export const toRecipeForUser = <T extends RecipeWithStatusJoin>(recipe: T) => {
  const myStatuses = recipe.recipeUserStatuses[0]?.statuses ?? [];
  const { recipeUserStatuses, ...rest } = recipe;
  void recipeUserStatuses;
  return {
    ...rest,
    myStatuses,
    // compatibility for existing clients still reading `statuses`
    statuses: myStatuses,
  };
};

export const toRecipesForUser = <T extends RecipeWithStatusJoin>(recipes: T[]) =>
  recipes.map((recipe) => toRecipeForUser(recipe));

export const getRecipeForUser = async (recipeId: string, userId: string) => {
  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
    },
    include: recipeIncludeForUser(userId),
  });

  if (!recipe) {
    return null;
  }

  return toRecipeForUser(recipe);
};

