import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { aiApi, authApi, pantryApi, recipeApi } from "../api";
import { InstallPrompt } from "../components/InstallPrompt";
import { RecipeForm } from "../components/RecipeForm";
import { ReviewSection } from "../components/ReviewSection";
import type { PantryItem, Recipe, SharePermission } from "../types";

type Tab = "recipes" | "pantry" | "assistant";

export const DashboardPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("recipes");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [search, setSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("");
  const [maxPrep, setMaxPrep] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [scope, setScope] = useState<"all" | "mine" | "shared">("all");

  const [pantryDraft, setPantryDraft] = useState({ name: "", quantity: "", unit: "", expiryDate: "" });
  const [editingPantryId, setEditingPantryId] = useState<string | null>(null);
  const [assistantFilters, setAssistantFilters] = useState({
    cuisineType: "",
    maxPrepTimeMinutes: "",
    difficulty: "",
  });

  const meQuery = useQuery({ queryKey: ["me"], queryFn: authApi.me });

  useEffect(() => {
    if (meQuery.data && !meQuery.data.authenticated) {
      navigate("/login", { replace: true });
    }
  }, [meQuery.data, navigate]);

  const recipesQuery = useQuery({
    queryKey: [
      "recipes",
      search,
      ingredientSearch,
      cuisineFilter,
      maxPrep,
      statusFilter,
      difficultyFilter,
      scope,
    ],
    queryFn: () =>
      recipeApi.list({
        query: search,
        ingredient: ingredientSearch,
        cuisineType: cuisineFilter,
        maxPrepTimeMinutes: maxPrep || undefined,
        status: statusFilter || undefined,
        difficulty: difficultyFilter || undefined,
        scope,
      }),
    enabled: Boolean(meQuery.data?.authenticated),
  });

  const pantryQuery = useQuery({
    queryKey: ["pantry"],
    queryFn: pantryApi.list,
    enabled: Boolean(meQuery.data?.authenticated),
  });

  const cookNowMutation = useMutation({
    mutationFn: () =>
      aiApi.cookNow({
        cuisineType: assistantFilters.cuisineType || undefined,
        maxPrepTimeMinutes: assistantFilters.maxPrepTimeMinutes
          ? Number(assistantFilters.maxPrepTimeMinutes)
          : undefined,
        difficulty: assistantFilters.difficulty || undefined,
      }),
  });

  const saveRecipeMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingRecipe) {
        return recipeApi.update(editingRecipe.id, payload);
      }

      return recipeApi.create(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setShowRecipeForm(false);
      setEditingRecipe(null);
    },
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: (id: string) => recipeApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const importRecipesMutation = useMutation({
    mutationFn: () => recipeApi.importFree(100),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const createPantryMutation = useMutation({
    mutationFn: (payload: Partial<PantryItem>) => pantryApi.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pantry"] });
      setPantryDraft({ name: "", quantity: "", unit: "", expiryDate: "" });
    },
  });

  const updatePantryMutation = useMutation({
    mutationFn: (payload: { id: string; values: Partial<PantryItem> }) => pantryApi.update(payload.id, payload.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pantry"] });
      setEditingPantryId(null);
      setPantryDraft({ name: "", quantity: "", unit: "", expiryDate: "" });
    },
  });

  const deletePantryMutation = useMutation({
    mutationFn: (id: string) => pantryApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pantry"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/login", { replace: true });
    },
  });

  const recipeCards = useMemo(() => recipesQuery.data ?? [], [recipesQuery.data]);

  if (meQuery.isLoading) {
    return <p className="center-text">Loading account...</p>;
  }

  return (
    <div className="app-shell">
      <InstallPrompt />
      <header className="topbar">
        <div>
          <h1>RMS Kitchen</h1>
          <p>{meQuery.data?.user?.name}</p>
        </div>
        <nav className="tabs" aria-label="Main sections">
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>
            Recipes
          </button>
          <button className={tab === "pantry" ? "active" : ""} onClick={() => setTab("pantry")}>
            My Pantry
          </button>
          <button className={tab === "assistant" ? "active" : ""} onClick={() => setTab("assistant")}>
            AI Assistant
          </button>
        </nav>
        <button className="ghost" onClick={() => logoutMutation.mutate()}>
          Logout
        </button>
      </header>

      {tab === "recipes" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Recipes</h2>
            <div className="card-actions">
              <button
                className="secondary"
                onClick={() => importRecipesMutation.mutate()}
                disabled={importRecipesMutation.isPending}
              >
                {importRecipesMutation.isPending ? "Importing..." : "Import 100 free recipes"}
              </button>
              <button
                onClick={() => {
                  setEditingRecipe(null);
                  setShowRecipeForm(true);
                }}
              >
                New recipe
              </button>
            </div>
          </div>

          <div className="filters-grid">
            <input placeholder="Search name" value={search} onChange={(event) => setSearch(event.target.value)} />
            <input
              placeholder="Ingredient"
              value={ingredientSearch}
              onChange={(event) => setIngredientSearch(event.target.value)}
            />
            <input placeholder="Cuisine" value={cuisineFilter} onChange={(event) => setCuisineFilter(event.target.value)} />
            <input
              placeholder="Max prep min"
              value={maxPrep}
              onChange={(event) => setMaxPrep(event.target.value)}
              type="number"
              inputMode="numeric"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Any status</option>
              <option value="FAVORITE">Favorite</option>
              <option value="TO_TRY">To try</option>
              <option value="MADE_BEFORE">Made before</option>
            </select>
            <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}>
              <option value="">Any difficulty</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
            <select value={scope} onChange={(event) => setScope(event.target.value as "all" | "mine" | "shared")}>
              <option value="all">All accessible</option>
              <option value="mine">Mine</option>
              <option value="shared">Shared with me</option>
            </select>
          </div>

          {recipesQuery.isLoading ? <p>Loading recipes...</p> : null}
          {!recipesQuery.isLoading && recipeCards.length === 0 ? <p>No recipes found for current filters.</p> : null}

          <div className="recipe-grid">
            {recipeCards.map((recipe) => {
              const canEdit =
                recipe.ownerId === meQuery.data?.user?.id ||
                recipe.shares.some(
                  (share) => share.userId === meQuery.data?.user?.id && share.permission === "EDITOR",
                );
              return (
                <article className="recipe-card" key={recipe.id}>
                  {recipe.imageUrl ? <img src={recipe.imageUrl} alt={recipe.name} loading="lazy" /> : null}
                  <div className="recipe-body">
                    <h3>{recipe.name}</h3>
                    <p className="meta-line">
                      {recipe.cuisineType || "Cuisine n/a"} · Prep {recipe.prepTimeMinutes ?? "?"}m ·{" "}
                      {recipe.difficulty || "N/A"}
                    </p>
                    <p className="truncate">{recipe.instructions}</p>
                    <p>
                      <strong>Ingredients:</strong> {recipe.ingredients.map((item) => item.name).join(", ")}
                    </p>
                    <div className="chip-row">
                      {recipe.statuses.map((status) => (
                        <span key={status} className="chip active">
                          {status.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                    <div className="card-actions">
                      {canEdit ? (
                        <button
                          onClick={() => {
                            setEditingRecipe(recipe);
                            setShowRecipeForm(true);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      {recipe.ownerId === meQuery.data?.user?.id ? (
                        <button className="ghost" onClick={() => deleteRecipeMutation.mutate(recipe.id)}>
                          Delete
                        </button>
                      ) : null}
                      <button
                        className="secondary"
                        onClick={async () => {
                          await recipeApi.generateImage(recipe.id, "restaurant quality plating");
                          await queryClient.invalidateQueries({ queryKey: ["recipes"] });
                        }}
                      >
                        Generate image
                      </button>
                      {recipe.ownerId === meQuery.data?.user?.id ? (
                        <button
                          className="ghost"
                          onClick={async () => {
                            const email = prompt("Share with email");
                            if (!email) return;
                            const permission = (prompt("Permission: VIEWER or EDITOR", "VIEWER") ??
                              "VIEWER") as SharePermission;
                            await recipeApi.share(recipe.id, email, permission);
                            await queryClient.invalidateQueries({ queryKey: ["recipes"] });
                          }}
                        >
                          Share
                        </button>
                      ) : null}
                    </div>
                    <ReviewSection
                      recipeId={recipe.id}
                      reviews={recipe.reviews}
                      currentUserId={meQuery.data?.user?.id}
                      onSaved={async () => {
                        await queryClient.invalidateQueries({ queryKey: ["recipes"] });
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "pantry" ? (
        <section className="panel">
          <h2>My Pantry</h2>
          <form
            className="pantry-form"
            onSubmit={(event) => {
              event.preventDefault();
              createPantryMutation.mutate({
                name: pantryDraft.name,
                quantity: pantryDraft.quantity,
                unit: pantryDraft.unit,
                expiryDate: pantryDraft.expiryDate ? new Date(pantryDraft.expiryDate).toISOString() : undefined,
              });
            }}
          >
            <input
              placeholder="Ingredient name"
              value={pantryDraft.name}
              onChange={(event) => setPantryDraft((previous) => ({ ...previous, name: event.target.value }))}
              required
            />
            <input
              placeholder="Quantity"
              value={pantryDraft.quantity}
              onChange={(event) => setPantryDraft((previous) => ({ ...previous, quantity: event.target.value }))}
            />
            <input
              placeholder="Unit"
              value={pantryDraft.unit}
              onChange={(event) => setPantryDraft((previous) => ({ ...previous, unit: event.target.value }))}
            />
            <input
              type="date"
              value={pantryDraft.expiryDate}
              onChange={(event) => setPantryDraft((previous) => ({ ...previous, expiryDate: event.target.value }))}
            />
            <button type="submit">Add item</button>
          </form>

          <div className="pantry-list">
            {(pantryQuery.data ?? []).map((item) => (
              <div key={item.id} className="pantry-row">
                {editingPantryId === item.id ? (
                  <>
                    <div className="filters-grid">
                      <input
                        placeholder="Ingredient name"
                        value={pantryDraft.name}
                        onChange={(event) => setPantryDraft((previous) => ({ ...previous, name: event.target.value }))}
                      />
                      <input
                        placeholder="Quantity"
                        value={pantryDraft.quantity}
                        onChange={(event) => setPantryDraft((previous) => ({ ...previous, quantity: event.target.value }))}
                      />
                      <input
                        placeholder="Unit"
                        value={pantryDraft.unit}
                        onChange={(event) => setPantryDraft((previous) => ({ ...previous, unit: event.target.value }))}
                      />
                      <input
                        type="date"
                        value={pantryDraft.expiryDate}
                        onChange={(event) => setPantryDraft((previous) => ({ ...previous, expiryDate: event.target.value }))}
                      />
                    </div>
                    <div className="card-actions">
                      <button
                        onClick={() =>
                          updatePantryMutation.mutate({
                            id: item.id,
                            values: {
                              name: pantryDraft.name,
                              quantity: pantryDraft.quantity,
                              unit: pantryDraft.unit,
                              expiryDate: pantryDraft.expiryDate
                                ? new Date(pantryDraft.expiryDate).toISOString()
                                : undefined,
                            },
                          })
                        }
                      >
                        Save
                      </button>
                      <button
                        className="ghost"
                        onClick={() => {
                          setEditingPantryId(null);
                          setPantryDraft({ name: "", quantity: "", unit: "", expiryDate: "" });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {[item.quantity, item.unit].filter(Boolean).join(" ") || "No quantity"}
                        {item.expiryDate ? ` · expires ${new Date(item.expiryDate).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="card-actions">
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditingPantryId(item.id);
                          setPantryDraft({
                            name: item.name,
                            quantity: item.quantity ?? "",
                            unit: item.unit ?? "",
                            expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "",
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button className="ghost" onClick={() => deletePantryMutation.mutate(item.id)}>
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "assistant" ? (
        <section className="panel">
          <h2>What can I cook now?</h2>
          <div className="filters-grid">
            <input
              placeholder="Cuisine filter"
              value={assistantFilters.cuisineType}
              onChange={(event) => setAssistantFilters((previous) => ({ ...previous, cuisineType: event.target.value }))}
            />
            <input
              placeholder="Max prep"
              value={assistantFilters.maxPrepTimeMinutes}
              type="number"
              inputMode="numeric"
              onChange={(event) =>
                setAssistantFilters((previous) => ({ ...previous, maxPrepTimeMinutes: event.target.value }))
              }
            />
            <select
              value={assistantFilters.difficulty}
              onChange={(event) => setAssistantFilters((previous) => ({ ...previous, difficulty: event.target.value }))}
            >
              <option value="">Any difficulty</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
            <button onClick={() => cookNowMutation.mutate()}>
              {cookNowMutation.isPending ? "Analyzing..." : "Run AI assistant"}
            </button>
          </div>

          {cookNowMutation.data ? (
            <div className="assistant-grid">
              <article>
                <h3>Can cook now</h3>
                <ul>
                  {cookNowMutation.data.canCookNow.map((item) => (
                    <li key={item.recipeId}>{item.recipeName}</li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>Can almost cook</h3>
                <ul>
                  {cookNowMutation.data.canAlmostCook.map((item) => (
                    <li key={item.recipeId}>
                      {item.recipeName}: missing {item.missingIngredients.join(", ")}
                      {item.substitutions.length ? ` (subs: ${item.substitutions.join(", ")})` : ""}
                    </li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>Shopping list</h3>
                <ul>
                  {cookNowMutation.data.shoppingList.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>AI summary</h3>
                <p>{cookNowMutation.data.aiNarrative?.summary ?? "No AI narrative available, using fallback logic."}</p>
              </article>
            </div>
          ) : (
            <p>Run the assistant to get recipe matches from pantry ingredients.</p>
          )}
        </section>
      ) : null}

      {showRecipeForm ? (
        <RecipeForm
          initial={editingRecipe}
          onCancel={() => {
            setShowRecipeForm(false);
            setEditingRecipe(null);
          }}
          onSubmit={async (payload) => {
            await saveRecipeMutation.mutateAsync(payload);
          }}
          onAIMetadata={aiApi.suggestMetadata}
        />
      ) : null}
    </div>
  );
};
