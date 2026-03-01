import { app } from "./app.js";
import { env } from "./config/env.js";
import { getDatabaseSummary, prisma, probeDatabaseReadiness } from "./config/db.js";

const start = async () => {
  const db = getDatabaseSummary();
  console.log(
    `[startup] env=${env.NODE_ENV} port=${env.PORT} client_url=${env.CLIENT_URL} server_url=${env.SERVER_URL}`,
  );
  console.log(
    `[startup] database=${db.protocol}://${db.host}:${db.port}/${db.database}`,
  );

  await prisma.$connect();
  const readiness = await probeDatabaseReadiness();
  if (!readiness.userTableExists) {
    throw new Error('Database schema is incomplete: table "public.User" does not exist. Run migrations.');
  }

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

