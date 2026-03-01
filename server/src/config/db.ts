import { PrismaClient } from "@prisma/client";
import { URL } from "node:url";
import { env } from "./env.js";

export const prisma = new PrismaClient();

export const getDatabaseSummary = () => {
  try {
    const parsed = new URL(env.DATABASE_URL);
    return {
      protocol: parsed.protocol.replace(":", ""),
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace("/", "") || "(default)",
    };
  } catch {
    return {
      protocol: "unknown",
      host: "unknown",
      port: "unknown",
      database: "unknown",
    };
  }
};

export const probeDatabaseReadiness = async () => {
  await prisma.$queryRaw`SELECT 1`;

  const userTableProbe = await prisma.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('public."User"') as "exists"
  `;

  return {
    userTableExists: Boolean(userTableProbe[0]?.exists),
  };
};

