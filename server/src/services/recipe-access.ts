import { SharePermission } from "@prisma/client";
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
    },
  },
};

export const getRecipeForUser = async (recipeId: string, userId: string) =>
  prisma.recipe.findFirst({
    where: {
      id: recipeId,
      OR: [
        { ownerId: userId },
        {
          shares: {
            some: {
              userId,
            },
          },
        },
      ],
    },
    include: recipeInclude,
  });

export const getSharePermission = (recipe: { ownerId: string; shares: Array<{ userId: string; permission: SharePermission }> }, userId: string) => {
  if (recipe.ownerId === userId) {
    return SharePermission.EDITOR;
  }

  return recipe.shares.find((share) => share.userId === userId)?.permission;
};

