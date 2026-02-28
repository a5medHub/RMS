type MealDbMeal = {
  strMeal: string;
  strInstructions: string;
  strArea: string | null;
  strTags: string | null;
  strMealThumb: string | null;
  [key: string]: string | null;
};

const normalize = (value: string) => value.trim().toLowerCase();

const parseIngredients = (meal: MealDbMeal) => {
  const ingredients: Array<{ name: string; quantity?: string | null; unit?: string | null }> = [];

  for (let index = 1; index <= 20; index += 1) {
    const ingredientRaw = meal[`strIngredient${index}`];
    const measureRaw = meal[`strMeasure${index}`];

    const ingredient = ingredientRaw?.trim();
    if (!ingredient) {
      continue;
    }

    const measure = measureRaw?.trim() || "";
    const quantityMatch = measure.match(/^([0-9]+(?:[./][0-9]+)?)\s*(.*)$/);

    ingredients.push({
      name: ingredient,
      quantity: quantityMatch?.[1] ?? null,
      unit: quantityMatch?.[2] ? quantityMatch[2].trim() : measure || null,
    });
  }

  return ingredients;
};

export const fetchTheMealDbRecipes = async (count: number) => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const recipes: Array<{
    name: string;
    instructions: string;
    cuisineType: string | null;
    tags: string[];
    imageUrl: string | null;
    ingredients: Array<{ name: string; quantity?: string | null; unit?: string | null }>;
  }> = [];
  const seen = new Set<string>();

  for (const letter of letters) {
    if (recipes.length >= count) {
      break;
    }

    const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`);
    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as { meals: MealDbMeal[] | null };

    for (const meal of payload.meals ?? []) {
      const key = normalize(meal.strMeal);
      if (seen.has(key)) {
        continue;
      }

      const ingredients = parseIngredients(meal);
      if (!meal.strInstructions || ingredients.length === 0) {
        continue;
      }

      recipes.push({
        name: meal.strMeal.trim(),
        instructions: meal.strInstructions.trim(),
        cuisineType: meal.strArea?.trim() || null,
        tags: (meal.strTags ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 8),
        imageUrl: meal.strMealThumb?.trim() || null,
        ingredients,
      });

      seen.add(key);

      if (recipes.length >= count) {
        break;
      }
    }
  }

  return recipes.slice(0, count);
};
