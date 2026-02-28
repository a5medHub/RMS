CREATE TYPE "NotificationType" AS ENUM ('RECIPE_SHARED');

CREATE TABLE "RecipeUserStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "statuses" "RecipeStatus"[] DEFAULT ARRAY[]::"RecipeStatus"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeUserStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeUserStatus_userId_recipeId_key" ON "RecipeUserStatus"("userId", "recipeId");
CREATE INDEX "RecipeUserStatus_userId_idx" ON "RecipeUserStatus"("userId");
CREATE INDEX "RecipeUserStatus_recipeId_idx" ON "RecipeUserStatus"("recipeId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

ALTER TABLE "RecipeUserStatus" ADD CONSTRAINT "RecipeUserStatus_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecipeUserStatus" ADD CONSTRAINT "RecipeUserStatus_recipeId_fkey"
FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "RecipeUserStatus" ("id", "userId", "recipeId", "statuses", "createdAt", "updatedAt")
SELECT
  CONCAT('rus_', SUBSTRING(MD5("ownerId" || ':' || "id"), 1, 24)),
  "ownerId",
  "id",
  "statuses",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Recipe"
WHERE COALESCE(array_length("statuses", 1), 0) > 0
ON CONFLICT ("userId", "recipeId")
DO UPDATE SET
  "statuses" = EXCLUDED."statuses",
  "updatedAt" = CURRENT_TIMESTAMP;
