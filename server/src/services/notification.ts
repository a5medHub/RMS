import { NotificationType, type SharePermission } from "@prisma/client";
import { prisma } from "../config/db.js";

type RecipeShareNotificationPayload = {
  recipientUserId: string;
  sharedBy: {
    id: string;
    name: string;
    email: string;
  };
  recipe: {
    id: string;
    name: string;
  };
  permission: SharePermission;
};

export const createRecipeShareNotification = async (payload: RecipeShareNotificationPayload) =>
  prisma.notification.create({
    data: {
      userId: payload.recipientUserId,
      type: NotificationType.RECIPE_SHARED,
      title: "Recipe shared with you",
      message: `${payload.sharedBy.name} shared "${payload.recipe.name}" with ${payload.permission.toLowerCase()} access.`,
      data: {
        recipeId: payload.recipe.id,
        recipeName: payload.recipe.name,
        permission: payload.permission,
        sharedBy: payload.sharedBy,
      },
    },
  });

