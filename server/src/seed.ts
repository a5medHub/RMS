import { hash } from "bcryptjs";
import { RecipeStatus, UserRole } from "@prisma/client";
import { prisma } from "./config/db.js";

const ADMIN_EMAIL = "ayassine.auce@gmail.com";
const ADMIN_PASSWORD = "password@123";

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

const ensureDemoUser = async () => {
  return prisma.user.upsert({
    where: { email: "demo@rms.local" },
    update: {
      role: UserRole.USER,
    },
    create: {
      email: "demo@rms.local",
      name: "Demo User",
      role: UserRole.USER,
    },
  });
};

const ensureSampleSystemRecipe = async (adminId: string) => {
  const existing = await prisma.recipe.findFirst({
    where: {
      name: {
        equals: "Garlic Tomato Pasta",
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.recipe.create({
    data: {
      ownerId: adminId,
      isSystem: true,
      name: "Garlic Tomato Pasta",
      instructions:
        "1. Boil pasta in salted water. 2. Saute garlic in olive oil for 2 minutes. 3. Add tomato and simmer 10 minutes. 4. Toss pasta and finish with basil.",
      cuisineType: "Italian",
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      servings: 2,
      difficulty: "EASY",
      tags: ["weeknight", "vegetarian"],
      recipeUserStatuses: {
        create: {
          userId: adminId,
          statuses: [RecipeStatus.TO_TRY],
        },
      },
      ingredients: {
        create: [
          { name: "Pasta", quantity: "200", unit: "g" },
          { name: "Garlic", quantity: "2", unit: "cloves" },
          { name: "Tomato", quantity: "3", unit: "pcs" },
          { name: "Olive Oil", quantity: "2", unit: "tbsp" },
        ],
      },
    },
  });
};

const ensurePantrySamples = async (userId: string) => {
  const entries = [
    { userId, name: "Pasta", quantity: "500", unit: "g" },
    { userId, name: "Garlic", quantity: "1", unit: "head" },
  ];

  for (const entry of entries) {
    const exists = await prisma.pantryItem.findFirst({
      where: {
        userId,
        name: {
          equals: entry.name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (!exists) {
      await prisma.pantryItem.create({ data: entry });
    }
  }
};

const main = async () => {
  const admin = await ensureAdmin();
  const demo = await ensureDemoUser();

  await ensureSampleSystemRecipe(admin.id);
  await ensurePantrySamples(demo.id);

  console.log("Seed complete.");
  console.log(`Admin: ${ADMIN_EMAIL}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
