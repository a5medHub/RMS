import "dotenv/config";
import { hash } from "bcryptjs";
import { RecipeStatus, UserRole } from "@prisma/client";
import { prisma } from "./config/db.js";
import { completeRecipeMetadata } from "./services/metadata-completion.js";
import { fetchTheMealDbRecipes } from "./services/recipe-source.js";

const ADMIN_EMAIL = "ayassine.auce@gmail.com";
const ADMIN_PASSWORD = "password@123";

const normalize = (value: string) => value.trim().toLowerCase();

const parseCount = (value?: string) => {
  const parsed = Number(value ?? "100");
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.max(1, Math.min(300, Math.floor(parsed)));
};

const ensureAdmin = async () => {
  const passwordHash = await hash(ADMIN_PASSWORD, 12);

  return prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: UserRole.ADMIN,
      passwordHash,
      name: "Yassine Admin",
    },
    create: {
      email: ADMIN_EMAIL,
      name: "Yassine Admin",
      role: UserRole.ADMIN,
      passwordHash,
    },
  });
};

const main = async () => {
  const requestedCount = parseCount(process.argv[2]);
  const admin = await ensureAdmin();

  const existingRecipes = await prisma.recipe.findMany({
    where: { isSystem: true },
    select: { name: true },
  });

  const existingNames = new Set(existingRecipes.map((recipe) => normalize(recipe.name)));
  const existingCount = existingRecipes.length;

  if (existingCount >= requestedCount) {
    console.log(`System recipe pool already has ${existingCount} recipes (>= ${requestedCount}).`);
    return;
  }

  const needed = requestedCount - existingCount;
  const fetched = await fetchTheMealDbRecipes(Math.max(requestedCount + 120, 220));

  let created = 0;
  for (const item of fetched) {
    if (created >= needed) {
      break;
    }

    const key = normalize(item.name);
    if (existingNames.has(key)) {
      continue;
    }

    const completedMetadata = await completeRecipeMetadata({
      name: item.name,
      instructions: item.instructions,
      ingredients: item.ingredients,
      cuisineType: item.cuisineType,
      tags: item.tags,
    }, { force: true });

    await prisma.recipe.create({
      data: {
        ownerId: admin.id,
        isSystem: true,
        name: item.name,
        instructions: item.instructions,
        cuisineType: completedMetadata.cuisineType,
        prepTimeMinutes: completedMetadata.prepTimeMinutes,
        cookTimeMinutes: completedMetadata.cookTimeMinutes,
        servings: completedMetadata.servings,
        difficulty: completedMetadata.difficulty,
        tags: completedMetadata.tags,
        aiSuggestedMetadata: completedMetadata.aiSuggestedMetadata,
        isAiMetadataConfirmed: completedMetadata.isAiMetadataConfirmed,
        imageUrl: item.imageUrl,
        imageSource: item.imageUrl ? "themealdb" : null,
        imageQuery: item.imageUrl ? item.name : null,
        imageGeneratedAt: item.imageUrl ? new Date() : null,
        recipeUserStatuses: {
          create: {
            userId: admin.id,
            statuses: [RecipeStatus.TO_TRY],
          },
        },
        ingredients: {
          create: item.ingredients.map((ingredient) => ({
            name: ingredient.name,
            quantity: ingredient.quantity ?? null,
            unit: ingredient.unit ?? null,
          })),
        },
      },
    });

    existingNames.add(key);
    created += 1;
  }

  const finalCount = existingCount + created;
  console.log(`System recipes requested: ${requestedCount}`);
  console.log(`Created this run: ${created}`);
  console.log(`Final system recipe count: ${finalCount}`);

  if (finalCount < requestedCount) {
    console.log("Warning: API returned fewer unique recipes than requested.");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
