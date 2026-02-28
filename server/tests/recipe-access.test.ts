import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();

vi.mock("../src/config/db.js", () => ({
  prisma: {
    recipe: {
      findFirst: findFirstMock,
    },
  },
}));

describe("recipe access visibility", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    findFirstMock.mockResolvedValue(null);
  });

  it("fetches recipe by id without owner/share restriction", async () => {
    const { getRecipeForUser } = await import("../src/services/recipe-access.js");

    await getRecipeForUser("recipe-123");

    expect(findFirstMock).toHaveBeenCalledTimes(1);
    const call = findFirstMock.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
    expect(call.where).toEqual({ id: "recipe-123" });
  });
});