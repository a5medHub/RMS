import "dotenv/config";
import { prisma } from "./config/db.js";
import { backfillRecipeImages, parseBackfillLimit } from "./services/image-backfill.js";

const main = async () => {
  const limit = parseBackfillLimit(process.argv[2], 500);
  const result = await backfillRecipeImages(limit);

  console.log(`Candidates scanned: ${result.scanned}`);
  console.log(`Images updated: ${result.updated}`);
  console.log(`Images failed: ${result.failed}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });