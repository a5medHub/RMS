import "dotenv/config";
import { prisma } from "./config/db.js";
import { backfillRecipeMetadata, parseBackfillLimit } from "./services/metadata-completion.js";

const main = async () => {
  const limit = parseBackfillLimit(process.argv[2], 500);
  const result = await backfillRecipeMetadata(limit);

  console.log(`Candidates scanned: ${result.scanned}`);
  console.log(`Metadata updated: ${result.updated}`);
  console.log(`Metadata failed: ${result.failed}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });