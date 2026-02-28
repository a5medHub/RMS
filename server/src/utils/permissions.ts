import { UserRole } from "@prisma/client";

export const canViewRecipe = (isAuthenticated: boolean) => isAuthenticated;

export const isAdmin = (role: UserRole) => role === UserRole.ADMIN;

export const canEditRecipe = (payload: {
  ownerId: string;
  userId: string;
  userRole: UserRole;
  isSystem: boolean;
}) => {
  if (isAdmin(payload.userRole)) {
    return true;
  }

  if (payload.isSystem) {
    return false;
  }

  return payload.ownerId === payload.userId;
};

export const canDeleteRecipe = canEditRecipe;

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

