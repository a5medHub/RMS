import { UserRole } from "@prisma/client";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recipeFindUniqueMock = vi.fn();
const recipeUserStatusUpsertMock = vi.fn();
const recipeFindManyMock = vi.fn();
const recipeFindFirstMock = vi.fn();
const recipeCreateMock = vi.fn();
const recipeDeleteMock = vi.fn();

vi.mock("../src/config/db.js", () => ({
  prisma: {
    recipe: {
      findUnique: recipeFindUniqueMock,
      update: vi.fn(),
      findMany: recipeFindManyMock,
      findFirst: recipeFindFirstMock,
      create: recipeCreateMock,
      delete: recipeDeleteMock,
    },
    recipeUserStatus: {
      upsert: recipeUserStatusUpsertMock,
    },
    recipeIngredient: {
      deleteMany: vi.fn(),
    },
    recipeShare: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    recipeReview: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../src/services/ai-provider.js", () => ({
  generateDishImage: vi.fn(),
  isRenderableImageUrl: vi.fn(() => true),
}));

vi.mock("../src/services/image-backfill.js", () => ({
  backfillRecipeImages: vi.fn(),
}));

vi.mock("../src/services/metadata-completion.js", () => ({
  backfillRecipeMetadata: vi.fn(),
  completeRecipeMetadata: vi.fn(async () => ({
    cuisineType: "International",
    prepTimeMinutes: 10,
    cookTimeMinutes: 10,
    servings: 2,
    difficulty: "EASY",
    tags: [],
    aiSuggestedMetadata: undefined,
    isAiMetadataConfirmed: false,
  })),
}));

vi.mock("../src/services/recipe-source.js", () => ({
  fetchTheMealDbRecipes: vi.fn(async () => []),
}));

vi.mock("../src/services/recipe-access.js", () => ({
  recipeIncludeForUser: vi.fn(() => ({})),
  toRecipeForUser: vi.fn((recipe) => recipe),
  toRecipesForUser: vi.fn((recipes) => recipes),
  getRecipeForUser: vi.fn(),
}));

const buildApp = async () => {
  const { recipeRouter } = await import("../src/routes/recipes.js");
  const { errorHandler } = await import("../src/middleware/error.js");
  const app = express();

  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-user-id") ?? "u1";
    const userRoleHeader = req.header("x-user-role") ?? "USER";
    const userRole = userRoleHeader === "ADMIN" ? UserRole.ADMIN : UserRole.USER;

    const mutableReq = req as express.Request & {
      user?: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        avatarUrl: string | null;
        googleId: string | null;
        passwordHash: string | null;
        createdAt: Date;
        updatedAt: Date;
      };
      isAuthenticated?: () => boolean;
    };

    mutableReq.user = {
      id: userId,
      email: `${userId}@example.com`,
      name: `User ${userId}`,
      role: userRole,
      avatarUrl: null,
      googleId: null,
      passwordHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mutableReq.isAuthenticated = () => true;

    next();
  });

  app.use("/api/recipes", recipeRouter);
  app.use(errorHandler);
  return app;
};

describe("recipe status routes", () => {
  beforeEach(() => {
    recipeFindUniqueMock.mockReset();
    recipeUserStatusUpsertMock.mockReset();
    recipeFindManyMock.mockReset();
    recipeFindFirstMock.mockReset();
    recipeCreateMock.mockReset();
    recipeDeleteMock.mockReset();
    recipeFindManyMock.mockResolvedValue([]);
  });

  it("rejects invalid status payload", async () => {
    const app = await buildApp();

    const response = await request(app)
      .patch("/api/recipes/r1/statuses")
      .send({ statuses: ["INVALID_STATUS"] });

    expect(response.status).toBe(400);
    expect(recipeFindUniqueMock).not.toHaveBeenCalled();
  });

  it("allows user to update own recipe statuses", async () => {
    recipeFindUniqueMock.mockResolvedValue({ id: "r1" });
    recipeUserStatusUpsertMock.mockResolvedValue({
      statuses: ["FAVORITE"],
      updatedAt: new Date(),
    });

    const app = await buildApp();

    const response = await request(app)
      .patch("/api/recipes/r1/statuses")
      .set("x-user-id", "u1")
      .set("x-user-role", "USER")
      .send({ statuses: ["FAVORITE"] });

    expect(response.status).toBe(200);
    expect(response.headers["x-handler-ms"]).toBeDefined();
    expect(recipeUserStatusUpsertMock).toHaveBeenCalledTimes(1);
    const upsertArg = recipeUserStatusUpsertMock.mock.calls[0]?.[0] as {
      update: { statuses: string[] };
      create: { statuses: string[] };
    };
    expect(upsertArg.update.statuses).toEqual(["FAVORITE"]);
    expect(upsertArg.create.statuses).toEqual(["FAVORITE"]);
  });

  it("allows user to update statuses on non-owned recipe", async () => {
    recipeFindUniqueMock.mockResolvedValue({ id: "r1" });
    recipeUserStatusUpsertMock.mockResolvedValue({
      statuses: ["TO_TRY"],
      updatedAt: new Date(),
    });

    const app = await buildApp();

    const response = await request(app)
      .patch("/api/recipes/r1/statuses")
      .set("x-user-id", "viewer")
      .set("x-user-role", "USER")
      .send({ statuses: ["TO_TRY"] });

    expect(response.status).toBe(200);
    expect(recipeUserStatusUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for missing recipe", async () => {
    recipeFindUniqueMock.mockResolvedValue(null);

    const app = await buildApp();

    const response = await request(app)
      .patch("/api/recipes/missing/statuses")
      .send({ statuses: ["TO_TRY"] });

    expect(response.status).toBe(404);
    expect(recipeUserStatusUpsertMock).not.toHaveBeenCalled();
  });

  it("allows admin to update statuses as own preference", async () => {
    recipeFindUniqueMock.mockResolvedValue({ id: "r1" });
    recipeUserStatusUpsertMock.mockResolvedValue({
      statuses: ["MADE_BEFORE"],
      updatedAt: new Date(),
    });

    const app = await buildApp();

    const response = await request(app)
      .patch("/api/recipes/r1/statuses")
      .set("x-user-id", "admin")
      .set("x-user-role", "ADMIN")
      .send({ statuses: ["MADE_BEFORE"] });

    expect(response.status).toBe(200);
    expect(recipeUserStatusUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("applies status filter in list query for current user", async () => {
    const app = await buildApp();

    const response = await request(app)
      .get("/api/recipes?status=FAVORITE")
      .set("x-user-id", "u1");

    expect(response.status).toBe(200);
    expect(recipeFindManyMock).toHaveBeenCalledTimes(1);

    const queryArg = recipeFindManyMock.mock.calls[0]?.[0] as { where: { AND?: Array<Record<string, unknown>> } };
    expect(queryArg.where.AND).toContainEqual({
      recipeUserStatuses: {
        some: {
          userId: "u1",
          statuses: { has: "FAVORITE" },
        },
      },
    });
  });

  it("rejects invalid status filter value", async () => {
    const app = await buildApp();

    const response = await request(app).get("/api/recipes?status=INVALID");

    expect(response.status).toBe(400);
    expect(recipeFindManyMock).not.toHaveBeenCalled();
  });
});
