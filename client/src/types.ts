export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type RecipeStatus = "FAVORITE" | "TO_TRY" | "MADE_BEFORE";
export type SharePermission = "VIEWER" | "EDITOR";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

export type Ingredient = {
  id?: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
};

export type RecipeShare = {
  id: string;
  userId: string;
  permission: SharePermission;
  user: Pick<User, "id" | "name" | "email">;
};

export type RecipeReview = {
  id: string;
  recipeId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: Pick<User, "id" | "name" | "email">;
};

export type Recipe = {
  id: string;
  ownerId: string;
  owner: Pick<User, "id" | "name" | "email">;
  name: string;
  instructions: string;
  cuisineType?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  servings?: number | null;
  difficulty?: Difficulty | null;
  statuses: RecipeStatus[];
  tags: string[];
  ingredients: Ingredient[];
  shares: RecipeShare[];
  reviews: RecipeReview[];
  aiSuggestedMetadata?: Record<string, unknown> | null;
  isAiMetadataConfirmed: boolean;
  imageUrl?: string | null;
  updatedAt: string;
};

export type PantryItem = {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  expiryDate?: string | null;
};

export type CookResult = {
  canCookNow: Array<{
    recipeId: string;
    recipeName: string;
    missingIngredients: string[];
    substitutions: string[];
  }>;
  canAlmostCook: Array<{
    recipeId: string;
    recipeName: string;
    missingIngredients: string[];
    substitutions: string[];
  }>;
  shoppingList: string[];
  source: "ai" | "fallback";
  aiNarrative?: {
    summary: string;
    tips: string[];
  } | null;
};

export type MetadataSuggestion = {
  cuisineType: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  difficulty: Difficulty;
  tags: string[];
  nutrition?: Record<string, string>;
  allergens?: string[];
  source: "ai" | "fallback";
};


