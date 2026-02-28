import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { aiApi, authApi, recipeApi } from "../api";
import { RecipeForm } from "../components/RecipeForm";
import { ReviewSection } from "../components/ReviewSection";
import type { Recipe } from "../types";

const normalizeStep = (value: string) => value.replace(/^\d+[.)-]?\s*/, "").trim();

const parseInstructionSteps = (instructions: string) => {
  const chunks = instructions
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((step) => normalizeStep(step))
    .filter((step) => step.length > 0);

  return Array.from(new Set(chunks));
};

const getTimeBreakdown = (recipe: Recipe, steps: string[]) => {
  const inferredPrep = Math.max(5, Math.round(Math.max(1, recipe.ingredients.length) * 2));
  const inferredCook = Math.max(5, Math.round(Math.max(1, steps.length) * 4));

  const prep = recipe.prepTimeMinutes && recipe.prepTimeMinutes > 0 ? recipe.prepTimeMinutes : inferredPrep;
  const cook = recipe.cookTimeMinutes && recipe.cookTimeMinutes > 0 ? recipe.cookTimeMinutes : inferredCook;
  const total = prep + cook;

  const perStep = steps.length > 0 ? Math.max(1, Math.round((total || 20) / steps.length)) : 0;
  let elapsed = 0;

  const timeline = steps.map((step) => {
    elapsed += perStep;
    return {
      step,
      estimateMinutes: perStep,
      elapsedMinutes: elapsed,
    };
  });

  return {
    prep,
    cook,
    total,
    timeline,
  };
};

export const RecipeDetailsPage = () => {
  const { recipeId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: authApi.me });
  const recipeQuery = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => recipeApi.getById(recipeId),
    enabled: Boolean(recipeId),
  });

  useEffect(() => {
    if (meQuery.data && !meQuery.data.authenticated) {
      navigate("/login", { replace: true });
    }
  }, [meQuery.data, navigate]);

  const saveRecipeMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!editingRecipe) {
        return;
      }

      return recipeApi.update(editingRecipe.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setEditingRecipe(null);
    },
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: (id: string) => recipeApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate("/app", { replace: true });
    },
  });

  const recipe = recipeQuery.data;
  const currentUser = meQuery.data?.user;
  const canManage = Boolean(
    recipe &&
      currentUser &&
      (currentUser.role === "ADMIN" || (recipe.ownerId === currentUser.id && !recipe.isSystem)),
  );

  const steps = useMemo(() => (recipe ? parseInstructionSteps(recipe.instructions) : []), [recipe]);
  const timing = useMemo(() => (recipe ? getTimeBreakdown(recipe, steps) : null), [recipe, steps]);
  const displayDifficulty = recipe?.difficulty ?? "MEDIUM (estimated)";

  if (recipeQuery.isLoading || meQuery.isLoading) {
    return <p className="center-text">Loading recipe...</p>;
  }

  if (recipeQuery.isError || !recipe) {
    return (
      <div className="app-shell">
        <section className="panel">
          <p className="meta-line">{(recipeQuery.error as Error)?.message ?? "Recipe not found."}</p>
          <Link to="/app" className="secondary-link">
            Back to recipes
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <section className="panel detail-page">
        <div className="detail-header">
          <button className="ghost" onClick={() => navigate("/app")}>Back to recipes</button>
          <div className="card-actions">
            {canManage ? (
              <button onClick={() => setEditingRecipe(recipe)}>Edit recipe</button>
            ) : null}
            {canManage ? (
              <button className="ghost" onClick={() => deleteRecipeMutation.mutate(recipe.id)}>Delete recipe</button>
            ) : null}
          </div>
        </div>

        {recipe.imageUrl ? <img className="detail-image" src={recipe.imageUrl} alt={recipe.name} /> : null}

        <div className="detail-meta">
          <h1>{recipe.name}</h1>
          <p className="meta-line">
            {recipe.cuisineType || "Cuisine n/a"} - Difficulty: {displayDifficulty}
          </p>
          <p className="meta-line">Added by {recipe.owner.name}</p>
          {recipe.imageSource ? <p className="meta-line">Image source: {recipe.imageSource}</p> : null}
        </div>

        <div className="detail-grid">
          <article>
            <h2>Ingredients</h2>
            <ul>
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient.id ?? ingredient.name}>
                  {ingredient.quantity ? `${ingredient.quantity} ` : ""}
                  {ingredient.unit ? `${ingredient.unit} ` : ""}
                  {ingredient.name}
                </li>
              ))}
            </ul>
          </article>

          <article>
            <h2>Time breakdown</h2>
            <p>Prep: {timing?.prep ?? 0} min</p>
            <p>Cook: {timing?.cook ?? 0} min</p>
            <p>Total: {timing?.total ?? 0} min</p>
          </article>
        </div>

        <article>
          <h2>Step-by-step instructions</h2>
          <ol className="step-list">
            {steps.map((step, index) => (
              <li key={`${step}-${index}`}>
                <p>{step}</p>
                <small>Estimated {timing?.timeline[index]?.estimateMinutes ?? 0} min</small>
              </li>
            ))}
          </ol>
        </article>

        <article>
          <h2>Cooking timeline</h2>
          <ol className="timeline-list">
            {timing?.timeline.map((entry, index) => (
              <li key={`${entry.step}-${index}`}>
                <span>+{entry.elapsedMinutes} min</span>
                <p>{entry.step}</p>
              </li>
            ))}
          </ol>
        </article>

        <ReviewSection
          recipeId={recipe.id}
          reviews={recipe.reviews}
          currentUserId={currentUser?.id}
          maxVisible={100}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["recipe", recipe.id] });
            await queryClient.invalidateQueries({ queryKey: ["recipes"] });
          }}
        />
      </section>

      {editingRecipe ? (
        <RecipeForm
          initial={editingRecipe}
          onCancel={() => setEditingRecipe(null)}
          onSubmit={async (payload) => {
            await saveRecipeMutation.mutateAsync(payload);
          }}
          onAIMetadata={aiApi.suggestMetadata}
        />
      ) : null}
    </div>
  );
};
