import { useMemo, useState } from "react";
import type { Difficulty, Ingredient, Recipe, RecipeStatus } from "../types";

type Props = {
  initial?: Recipe | null;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onAIMetadata: (draft: { name: string; ingredients: Array<{ name: string }>; instructions: string }) => Promise<{
    cuisineType: string;
    prepTimeMinutes: number;
    cookTimeMinutes: number;
    servings: number;
    difficulty: Difficulty;
    tags: string[];
    source: "ai" | "fallback";
  }>;
};

const statusOptions: RecipeStatus[] = ["FAVORITE", "TO_TRY", "MADE_BEFORE"];

const emptyIngredient = (): Ingredient => ({ name: "", quantity: "", unit: "" });

export const RecipeForm = ({ initial, onCancel, onSubmit, onAIMetadata }: Props) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [cuisineType, setCuisineType] = useState(initial?.cuisineType ?? "");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(initial?.prepTimeMinutes?.toString() ?? "");
  const [cookTimeMinutes, setCookTimeMinutes] = useState(initial?.cookTimeMinutes?.toString() ?? "");
  const [servings, setServings] = useState(initial?.servings?.toString() ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty | "">(initial?.difficulty ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [statuses, setStatuses] = useState<RecipeStatus[]>(initial?.statuses ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial?.ingredients.length ? initial.ingredients : [emptyIngredient()],
  );
  const [busy, setBusy] = useState(false);
  const [metaSource, setMetaSource] = useState<"ai" | "fallback" | null>(null);

  const ingredientDraft = useMemo(
    () => ingredients.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim() })),
    [ingredients],
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form
        className="modal-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          await onSubmit({
            name,
            instructions,
            cuisineType: cuisineType || null,
            prepTimeMinutes: prepTimeMinutes ? Number(prepTimeMinutes) : null,
            cookTimeMinutes: cookTimeMinutes ? Number(cookTimeMinutes) : null,
            servings: servings ? Number(servings) : null,
            difficulty: difficulty || null,
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            statuses,
            ingredients: ingredients.filter((item) => item.name.trim()),
            isAiMetadataConfirmed: Boolean(metaSource),
          });
          setBusy(false);
        }}
      >
        <header>
          <h3>{initial ? "Edit Recipe" : "New Recipe"}</h3>
          <p>Fill basics manually or use AI metadata assist.</p>
        </header>

        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label>
          Instructions
          <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} required rows={6} />
        </label>

        <div className="grid-2">
          <label>
            Cuisine
            <input value={cuisineType} onChange={(event) => setCuisineType(event.target.value)} />
          </label>
          <label>
            Difficulty
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty | "") }>
              <option value="">Select</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </label>
          <label>
            Prep (min)
            <input type="number" inputMode="numeric" value={prepTimeMinutes} onChange={(event) => setPrepTimeMinutes(event.target.value)} />
          </label>
          <label>
            Cook (min)
            <input type="number" inputMode="numeric" value={cookTimeMinutes} onChange={(event) => setCookTimeMinutes(event.target.value)} />
          </label>
          <label>
            Servings
            <input type="number" inputMode="numeric" value={servings} onChange={(event) => setServings(event.target.value)} />
          </label>
          <label>
            Tags (comma-separated)
            <input value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
        </div>

        <fieldset>
          <legend>Status tags</legend>
          <div className="chip-row">
            {statusOptions.map((status) => {
              const active = statuses.includes(status);
              return (
                <button
                  type="button"
                  key={status}
                  className={`chip ${active ? "active" : ""}`}
                  onClick={() =>
                    setStatuses((previous) =>
                      previous.includes(status) ? previous.filter((item) => item !== status) : [...previous, status],
                    )
                  }
                >
                  {status.replace("_", " ")}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend>Ingredients</legend>
          <div className="ingredient-list">
            {ingredients.map((ingredient, index) => (
              <div key={`${ingredient.name}-${index}`} className="ingredient-row">
                <input
                  placeholder="Ingredient"
                  value={ingredient.name}
                  onChange={(event) => {
                    const next = [...ingredients];
                    next[index].name = event.target.value;
                    setIngredients(next);
                  }}
                  required
                />
                <input
                  placeholder="Quantity"
                  value={ingredient.quantity ?? ""}
                  onChange={(event) => {
                    const next = [...ingredients];
                    next[index].quantity = event.target.value;
                    setIngredients(next);
                  }}
                />
                <input
                  placeholder="Unit"
                  value={ingredient.unit ?? ""}
                  onChange={(event) => {
                    const next = [...ingredients];
                    next[index].unit = event.target.value;
                    setIngredients(next);
                  }}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setIngredients((previous) => previous.filter((_, row) => row !== index))}
                  disabled={ingredients.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="ghost" onClick={() => setIngredients((previous) => [...previous, emptyIngredient()])}>
            Add ingredient
          </button>
        </fieldset>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={!name || ingredientDraft.length === 0 || !instructions}
            onClick={async () => {
              const result = await onAIMetadata({ name, ingredients: ingredientDraft, instructions });
              setCuisineType(result.cuisineType);
              setPrepTimeMinutes(String(result.prepTimeMinutes));
              setCookTimeMinutes(String(result.cookTimeMinutes));
              setServings(String(result.servings));
              setDifficulty(result.difficulty);
              setTags(result.tags.join(", "));
              setMetaSource(result.source);
            }}
          >
            Auto-fill metadata
          </button>
          {metaSource ? <small>Metadata source: {metaSource}</small> : null}
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save recipe"}
          </button>
        </div>
      </form>
    </div>
  );
};


