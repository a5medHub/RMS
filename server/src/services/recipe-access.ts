import { prisma } from "../config/db.js";

export const recipeInclude = {
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
};

export const getRecipeForUser = async (recipeId: string) =>
  prisma.recipe.findFirst({
    where: {
      id: recipeId,
    },
    include: recipeInclude,
  });

