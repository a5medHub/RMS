import { prisma } from "./config/db.js";

const main = async () => {
  const user = await prisma.user.upsert({
    where: { email: "demo@rms.local" },
    update: {},
    create: {
      email: "demo@rms.local",
      name: "Demo User",
    },
  });

  await prisma.recipe.create({
    data: {
      ownerId: user.id,
      name: "Garlic Tomato Pasta",
      instructions: "Boil pasta. Saute garlic in olive oil. Add tomato and combine.",
      cuisineType: "Italian",
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      servings: 2,
      difficulty: "EASY",
      statuses: ["TO_TRY"],
      tags: ["weeknight", "vegetarian"],
      ingredients: {
        create: [
          { name: "pasta", quantity: "200", unit: "g" },
          { name: "garlic", quantity: "2", unit: "cloves" },
          { name: "tomato", quantity: "3", unit: "pcs" },
        ],
      },
    },
  });

  await prisma.pantryItem.createMany({
    data: [
      { userId: user.id, name: "pasta", quantity: "500", unit: "g" },
      { userId: user.id, name: "garlic", quantity: "1", unit: "head" },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete.");
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

