import { describe, expect, it } from "vitest";
import { evaluateCookNow } from "../src/services/cook-now.js";

describe("cook-now evaluation", () => {
  it("returns explicit reason when pantry is empty", () => {
    const result = evaluateCookNow({
      pantry: [],
      strictRecipes: [
        {
          id: "1",
          name: "Egg toast",
          ingredients: [{ name: "egg" }, { name: "bread" }],
        },
      ],
      relaxedRecipes: [],
      filters: {},
    });

    expect(result.reason).toContain("pantry is empty");
    expect(result.guidance).toContain("Add ingredients");
    expect(result.canCookNow).toHaveLength(0);
  });

  it("uses relaxed pass when strict filters produce no matches", () => {
    const result = evaluateCookNow({
      pantry: [{ name: "egg" }, { name: "bread" }],
      strictRecipes: [
        {
          id: "2",
          name: "French stew",
          ingredients: [
            { name: "beef" },
            { name: "potato" },
            { name: "celery" },
            { name: "carrot" },
            { name: "mushroom" },
            { name: "thyme" },
          ],
        },
      ],
      relaxedRecipes: [
        {
          id: "1",
          name: "Egg toast",
          ingredients: [{ name: "egg" }, { name: "bread" }],
        },
      ],
      filters: { cuisineType: "french", maxPrepTimeMinutes: 15 },
    });

    expect(result.usedRelaxedFilters).toBe(true);
    expect(result.canCookNow).toHaveLength(1);
    expect(result.canCookNow[0]?.recipeName).toBe("Egg toast");
  });
});
