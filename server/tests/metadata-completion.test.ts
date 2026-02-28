import { Difficulty } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMetadataSuggestionMock = vi.fn();

vi.mock("../src/services/ai-provider.js", () => ({
  generateMetadataSuggestion: generateMetadataSuggestionMock,
}));

describe("metadata completion", () => {
  beforeEach(() => {
    generateMetadataSuggestionMock.mockReset();
    generateMetadataSuggestionMock.mockResolvedValue({
      cuisineType: "Italian",
      prepTimeMinutes: 0,
      cookTimeMinutes: 0,
      servings: 0,
      difficulty: "EASY",
      tags: ["quick"],
      source: "ai",
      provider: "deepseek",
    });
  });

  it("fills missing metadata with non-zero safe defaults", async () => {
    const { completeRecipeMetadata } = await import("../src/services/metadata-completion.js");

    const result = await completeRecipeMetadata({
      name: "Tomato pasta",
      instructions: "Boil pasta. Add sauce.",
      ingredients: [{ name: "pasta" }, { name: "tomato" }],
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      servings: null,
      difficulty: null,
      tags: [],
    });

    expect(result.prepTimeMinutes).toBeGreaterThanOrEqual(5);
    expect(result.cookTimeMinutes).toBeGreaterThanOrEqual(5);
    expect(result.servings).toBeGreaterThanOrEqual(1);
    expect(result.difficulty).toBe(Difficulty.EASY);
    expect(result.aiSuggestedMetadata).toBeTruthy();
  });

  it("completes metadata in force mode for imported recipes", async () => {
    const { completeRecipeMetadata } = await import("../src/services/metadata-completion.js");

    const result = await completeRecipeMetadata({
      name: "Imported dish",
      instructions: "Cook and serve.",
      ingredients: [{ name: "egg" }],
      cuisineType: null,
      tags: [],
    }, { force: true });

    expect(result.difficulty).toBeDefined();
    expect(result.prepTimeMinutes).toBeGreaterThan(0);
    expect(result.cookTimeMinutes).toBeGreaterThan(0);
    expect(result.servings).toBeGreaterThan(0);
    expect(result.isAiMetadataConfirmed).toBe(false);
  });
});