import { describe, expect, it } from "vitest";
import { fallbackCookNow, fallbackImageDataUri, fallbackMetadataSuggestion } from "../src/services/ai-fallback.js";

describe("ai fallback", () => {
  it("classifies can cook now and can almost cook", () => {
    const result = fallbackCookNow({
      pantry: [{ name: "egg" }, { name: "milk" }, { name: "flour" }],
      recipes: [
        {
          id: "1",
          name: "Pancakes",
          ingredients: [{ name: "egg" }, { name: "milk" }, { name: "flour" }],
        },
        {
          id: "2",
          name: "Scramble",
          ingredients: [{ name: "egg" }, { name: "butter" }],
        },
      ],
    });

    expect(result.canCookNow).toHaveLength(1);
    expect(result.canCookNow[0]?.recipeName).toBe("Pancakes");
    expect(result.canAlmostCook).toHaveLength(1);
    expect(result.shoppingList).toContain("butter");
  });

  it("suggests metadata heuristically", () => {
    const suggestion = fallbackMetadataSuggestion({
      name: "Quick Tomato Pasta",
      ingredients: [{ name: "pasta" }, { name: "tomato" }, { name: "basil" }],
      instructions: "Boil pasta then simmer with tomato sauce and basil.",
    });

    expect(suggestion.cuisineType).toBe("Italian");
    expect(suggestion.prepTimeMinutes).toBeGreaterThan(0);
    expect(suggestion.source).toBe("fallback");
  });

  it("returns a data URI image fallback", () => {
    const uri = fallbackImageDataUri("My Dish");
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });
});

