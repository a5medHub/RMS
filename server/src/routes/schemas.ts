import { Difficulty, RecipeStatus, SharePermission } from "@prisma/client";
import { z } from "zod";

export const ingredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional(),
  unit: z.string().optional(),
});

export const recipeBaseSchema = z.object({
  name: z.string().min(2).max(120),
  instructions: z.string().min(10),
  cuisineType: z.string().max(60).optional().nullable(),
  prepTimeMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  cookTimeMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  servings: z.number().int().min(1).max(50).optional().nullable(),
  difficulty: z.nativeEnum(Difficulty).optional().nullable(),
  statuses: z.array(z.nativeEnum(RecipeStatus)).default([]),
  tags: z.array(z.string().min(1).max(30)).default([]),
  ingredients: z.array(ingredientSchema).min(1),
  aiSuggestedMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
  isAiMetadataConfirmed: z.boolean().optional(),
  nutrition: z.record(z.string(), z.unknown()).optional().nullable(),
  allergens: z.array(z.string()).default([]),
});

export const createRecipeSchema = recipeBaseSchema;
export const updateRecipeSchema = recipeBaseSchema.partial();

export const shareRecipeSchema = z.object({
  email: z.string().email(),
  permission: z.nativeEnum(SharePermission).default(SharePermission.VIEWER),
});

export const pantrySchema = z.object({
  name: z.string().min(1).max(100),
  quantity: z.string().max(50).optional().nullable(),
  unit: z.string().max(30).optional().nullable(),
  expiryDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable(),
});

export const aiCookFiltersSchema = z.object({
  cuisineType: z.string().optional(),
  maxPrepTimeMinutes: z.number().int().positive().optional(),
  difficulty: z.nativeEnum(Difficulty).optional(),
});

export const metadataDraftSchema = z.object({
  name: z.string().min(2),
  ingredients: z.array(ingredientSchema).min(1),
  instructions: z.string().min(10),
});

export const imageGenerationSchema = z.object({
  stylePrompt: z.string().max(200).optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(2).max(1000),
});

export const importRecipesSchema = z.object({
  count: z.coerce.number().int().min(1).max(200).default(100),
});

export const backfillLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(3000).default(100),
});

export const recipeStatusesSchema = z.object({
  statuses: z.array(z.nativeEnum(RecipeStatus)).default([]),
});

