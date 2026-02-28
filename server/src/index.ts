import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";

const start = async () => {
  await prisma.$connect();

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

