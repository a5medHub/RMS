CREATE TABLE "RecipeReview" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeReview_recipeId_userId_key" ON "RecipeReview"("recipeId", "userId");
CREATE INDEX "RecipeReview_recipeId_idx" ON "RecipeReview"("recipeId");
CREATE INDEX "RecipeReview_userId_idx" ON "RecipeReview"("userId");

ALTER TABLE "RecipeReview" ADD CONSTRAINT "RecipeReview_recipeId_fkey"
FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecipeReview" ADD CONSTRAINT "RecipeReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
