import { SharePermission } from "@prisma/client";

export const canViewRecipe = (ownerId: string, userId: string, permission?: SharePermission) => {
  if (ownerId === userId) {
    return true;
  }

  return permission === SharePermission.VIEWER || permission === SharePermission.EDITOR;
};

export const canEditRecipe = (ownerId: string, userId: string, permission?: SharePermission) => {
  if (ownerId === userId) {
    return true;
  }

  return permission === SharePermission.EDITOR;
};

export const statusFromInput = (status: string) => {
  switch (status.toLowerCase()) {
    case "favorite":
      return "FAVORITE";
    case "to try":
    case "to_try":
      return "TO_TRY";
    case "made before":
    case "made_before":
      return "MADE_BEFORE";
    default:
      return undefined;
  }
};

