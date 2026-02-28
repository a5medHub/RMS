import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { aiApi, authApi, recipeApi } from "../api";
import { RecipeForm } from "../components/RecipeForm";
import { ReviewSection } from "../components/ReviewSection";
import type { Recipe, RecipeStatus } from "../types";

const normalizeStep = (value: string) => value.replace(/^\d+[.)-]?\s*/, "").trim();

const parseInstructionSteps = (instructions: string) => {
  const chunks = instructions
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((step) => normalizeStep(step))
    .filter((step) => step.length > 0);

  return Array.from(new Set(chunks));
};

const statusOptions: Array<{ value: RecipeStatus; label: string }> = [
  { value: "FAVORITE", label: "Favorite" },
  { value: "TO_TRY", label: "To try" },
  { value: "MADE_BEFORE", label: "Made before" },
];

const toOrderedStatuses = (statuses: RecipeStatus[]) =>
  statusOptions
    .map((option) => option.value)
    .filter((status) => statuses.includes(status));

const withUpdatedStatuses = (recipe: Recipe, statuses: RecipeStatus[], updatedAt?: string): Recipe => ({
  ...recipe,
  myStatuses: statuses,
  statuses,
  updatedAt: updatedAt ?? recipe.updatedAt,
});

type StatusMutationContext = {
  previousRecipe?: Recipe;
  previousRecipeLists: Array<{ queryKey: readonly unknown[]; data: Recipe[] | undefined }>;
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
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusPerf, setStatusPerf] = useState<{ clientDurationMs: number; serverDurationMs?: number } | null>(null);

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

  const statusesMutation = useMutation<
    Awaited<ReturnType<typeof recipeApi.updateStatuses>>,
    Error,
    RecipeStatus[],
    StatusMutationContext
  >({
    mutationFn: async (statuses: RecipeStatus[]) => {
      if (!recipe) {
        throw new Error("Recipe not found.");
      }

      const result = await recipeApi.updateStatuses(recipe.id, statuses);
      setStatusPerf({
        clientDurationMs: result.clientDurationMs,
        serverDurationMs: result.serverDurationMs,
      });

      return result;
    },
    onMutate: async (nextStatuses) => {
      setStatusError(null);
      await queryClient.cancelQueries({ queryKey: ["recipe", recipeId] });
      await queryClient.cancelQueries({ queryKey: ["recipes"] });

      const previousRecipe = queryClient.getQueryData<Recipe>(["recipe", recipeId]);
      const previousRecipeLists = queryClient
        .getQueriesData<Recipe[]>({ queryKey: ["recipes"] })
        .map(([queryKey, data]) => ({ queryKey, data }));

      if (previousRecipe) {
        queryClient.setQueryData<Recipe>(["recipe", recipeId], withUpdatedStatuses(previousRecipe, nextStatuses));
      }

      for (const listEntry of previousRecipeLists) {
        if (!listEntry.data) {
          continue;
        }

        queryClient.setQueryData<Recipe[]>(
          listEntry.queryKey,
          listEntry.data.map((item) =>
            item.id === recipeId ? withUpdatedStatuses(item, nextStatuses) : item,
          ),
        );
      }

      return {
        previousRecipe,
        previousRecipeLists,
      };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<Recipe>(["recipe", recipeId], (current) => {
        if (!current) {
          return current;
        }
        return withUpdatedStatuses(current, result.statuses, result.updatedAt);
      });

      const cachedLists = queryClient.getQueriesData<Recipe[]>({ queryKey: ["recipes"] });
      for (const [queryKey, current] of cachedLists) {
        if (!current) {
          continue;
        }
        queryClient.setQueryData<Recipe[]>(
          queryKey,
          current.map((item) =>
            item.id === result.id ? withUpdatedStatuses(item, result.statuses, result.updatedAt) : item,
          ),
        );
      }
    },
    onError: (error, _variables, context) => {
      setStatusError(error.message);
      setStatusPerf(null);

      if (context?.previousRecipe) {
        queryClient.setQueryData<Recipe>(["recipe", recipeId], context.previousRecipe);
      }

      if (context?.previousRecipeLists) {
        for (const listEntry of context.previousRecipeLists) {
          queryClient.setQueryData(listEntry.queryKey, listEntry.data);
        }
      }
    },
  });

  const recipe = recipeQuery.data;
  const currentUser = meQuery.data?.user;
  const canEditRecipe = Boolean(
    recipe &&
      currentUser &&
      (currentUser.role === "ADMIN" || (recipe.ownerId === currentUser.id && !recipe.isSystem)),
  );
  const canTagStatus = Boolean(currentUser && recipe);

  const steps = useMemo(() => (recipe ? parseInstructionSteps(recipe.instructions) : []), [recipe]);
  const timing = useMemo(() => (recipe ? getTimeBreakdown(recipe, steps) : null), [recipe, steps]);
  const displayDifficulty = recipe?.difficulty ?? "MEDIUM (estimated)";

  const toggleStatus = (status: RecipeStatus) => {
    if (!recipe || !canTagStatus || statusesMutation.isPending) {
      return;
    }

    const nextStatuses = recipe.myStatuses.includes(status)
      ? recipe.myStatuses.filter((item) => item !== status)
      : [...recipe.myStatuses, status];

    statusesMutation.mutate(toOrderedStatuses(nextStatuses));
  };

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
            {canEditRecipe ? (
              <button onClick={() => setEditingRecipe(recipe)}>Edit recipe</button>
            ) : null}
            {canEditRecipe ? (
              <button className="ghost" onClick={() => deleteRecipeMutation.mutate(recipe.id)}>Delete recipe</button>
            ) : null}
          </div>
        </div>

        {recipe.imageUrl ? <img className="detail-image" src={recipe.imageUrl} alt={recipe.name} /> : null}

        <div className="detail-meta">
          <h1>{recipe.name}</h1>
          <div className="detail-status-row" aria-label="Recipe statuses">
            {statusOptions.map((option) => {
              const active = recipe.myStatuses.includes(option.value);

              if (canTagStatus) {
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`chip status-chip ${active ? "active" : ""}`}
                    disabled={statusesMutation.isPending}
                    onClick={() => toggleStatus(option.value)}
                    aria-pressed={active}
                    aria-label={`Toggle ${option.label}`}
                  >
                    {option.label}
                  </button>
                );
              }

              if (!active) {
                return null;
              }

              return (
                <span key={option.value} className="chip status-chip active">
                  {option.label}
                </span>
              );
            })}
            {!canTagStatus && recipe.myStatuses.length === 0 ? <span className="chip">No status</span> : null}
          </div>
          {statusesMutation.isPending ? <p className="meta-line">Saving statuses...</p> : null}
          {statusError ? <p className="error-line">{statusError}</p> : null}
          {statusPerf ? (
            <p className="meta-line">
              Status saved in {statusPerf.clientDurationMs} ms
              {typeof statusPerf.serverDurationMs === "number" ? ` (server ${statusPerf.serverDurationMs} ms)` : ""}
            </p>
          ) : null}
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
