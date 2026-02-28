import { UserRole } from "@prisma/client";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recipeFindUniqueMock = vi.fn();
const recipeShareUpsertMock = vi.fn();
const userFindUniqueMock = vi.fn();
const notificationCreateMock = vi.fn();
const notificationFindManyMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const notificationCountMock = vi.fn();

vi.mock("../src/config/db.js", () => ({
  prisma: {
    recipe: {
      findUnique: recipeFindUniqueMock,
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    recipeUserStatus: {
      upsert: vi.fn(),
    },
    recipeIngredient: {
      deleteMany: vi.fn(),
    },
    recipeShare: {
      upsert: recipeShareUpsertMock,
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    recipeReview: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: userFindUniqueMock,
    },
    notification: {
      create: notificationCreateMock,
      findMany: notificationFindManyMock,
      updateMany: notificationUpdateManyMock,
      count: notificationCountMock,
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

vi.mock("../src/services/share-email.js", () => ({
  sendShareNotificationEmail: vi.fn(async () => ({ sent: false, reason: "smtp_not_configured" })),
}));

const buildApp = async () => {
  const { recipeRouter } = await import("../src/routes/recipes.js");
  const { notificationRouter } = await import("../src/routes/notifications.js");
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
  app.use("/api/notifications", notificationRouter);
  app.use(errorHandler);
  return app;
};

describe("notifications and share flow", () => {
  beforeEach(() => {
    recipeFindUniqueMock.mockReset();
    recipeShareUpsertMock.mockReset();
    userFindUniqueMock.mockReset();
    notificationCreateMock.mockReset();
    notificationFindManyMock.mockReset();
    notificationUpdateManyMock.mockReset();
    notificationCountMock.mockReset();
  });

  it("creates in-app notification when recipe is shared", async () => {
    recipeFindUniqueMock.mockResolvedValue({ id: "r1", ownerId: "owner1", name: "Pasta" });
    userFindUniqueMock.mockResolvedValue({ id: "u2", email: "u2@example.com", name: "Ahmad" });
    recipeShareUpsertMock.mockResolvedValue({ id: "s1", recipeId: "r1", userId: "u2", permission: "VIEWER" });
    notificationCreateMock.mockResolvedValue({ id: "n1" });

    const app = await buildApp();

    const response = await request(app)
      .post("/api/recipes/r1/share")
      .set("x-user-id", "owner1")
      .send({ email: "u2@example.com", permission: "VIEWER" });

    expect(response.status).toBe(200);
    expect(recipeShareUpsertMock).toHaveBeenCalledTimes(1);
    expect(notificationCreateMock).toHaveBeenCalledTimes(1);

    const notificationArg = notificationCreateMock.mock.calls[0]?.[0] as {
      data: { userId: string; type: string; data: { recipeId: string; permission: string } };
    };
    expect(notificationArg.data.userId).toBe("u2");
    expect(notificationArg.data.type).toBe("RECIPE_SHARED");
    expect(notificationArg.data.data.recipeId).toBe("r1");
    expect(notificationArg.data.data.permission).toBe("VIEWER");
  });

  it("recipient can list notifications and mark one as read", async () => {
    notificationFindManyMock.mockResolvedValue([
      {
        id: "n1",
        userId: "u2",
        type: "RECIPE_SHARED",
        title: "Recipe shared with you",
        message: "User owner1 shared a recipe.",
        data: { recipeId: "r1" },
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    notificationUpdateManyMock.mockResolvedValue({ count: 1 });

    const app = await buildApp();

    const listResponse = await request(app)
      .get("/api/notifications")
      .set("x-user-id", "u2");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);

    const markReadResponse = await request(app)
      .patch("/api/notifications/n1/read")
      .set("x-user-id", "u2");
    expect(markReadResponse.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it("user cannot mark another user's notification as read", async () => {
    notificationUpdateManyMock.mockResolvedValue({ count: 0 });

    const app = await buildApp();

    const response = await request(app)
      .patch("/api/notifications/n1/read")
      .set("x-user-id", "intruder");

    expect(response.status).toBe(404);
  });
});

