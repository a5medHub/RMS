import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { aiApi, authApi, notificationApi, pantryApi, recipeApi } from "../api";
import { InstallPrompt } from "../components/InstallPrompt";
import { RecipeForm } from "../components/RecipeForm";
import type { Notification, PantryItem, Recipe, SharePermission } from "../types";

type Tab = "recipes" | "pantry" | "assistant";

const shortSnippet = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) {
    return normalized;
  }

  return `${normalized.slice(0, 140)}...`;
};

const reviewSummary = (recipe: Recipe) => {
  if (recipe.reviews.length === 0) {
    return { count: 0, average: "-" };
  }

  const average = recipe.reviews.reduce((sum, review) => sum + review.rating, 0) / recipe.reviews.length;
  return { count: recipe.reviews.length, average: average.toFixed(1) };
};

const getRecipeIdFromNotification = (notification: Notification) => {
  const data = notification.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const recipeId = data.recipeId;
  return typeof recipeId === "string" ? recipeId : null;
};

export const DashboardPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("recipes");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [shareTargetRecipe, setShareTargetRecipe] = useState<Recipe | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<SharePermission>("VIEWER");
  const [shareError, setShareError] = useState<string | null>(null);

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
    queryKey: ["recipes", search, ingredientSearch, cuisineFilter, maxPrep, statusFilter, difficultyFilter, scope],
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

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(40),
    enabled: Boolean(meQuery.data?.authenticated && showNotifications),
  });

  const unreadCountQuery = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: notificationApi.unreadCount,
    enabled: Boolean(meQuery.data?.authenticated),
    refetchInterval: 30000,
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

  const backfillImagesMutation = useMutation({
    mutationFn: () => recipeApi.backfillImages(120),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const backfillMetadataMutation = useMutation({
    mutationFn: () => recipeApi.backfillMetadata(300),
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

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: string) => notificationApi.markRead(notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  const markAllNotificationsReadMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  const shareRecipeMutation = useMutation({
    mutationFn: (payload: { recipeId: string; email: string; permission: SharePermission }) =>
      recipeApi.share(payload.recipeId, payload.email, payload.permission),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setShareError(null);
      setShareTargetRecipe(null);
      setShareEmail("");
      setSharePermission("VIEWER");
    },
    onError: (error: Error) => {
      setShareError(error.message);
    },
  });

  const recipeCards = useMemo(() => recipesQuery.data ?? [], [recipesQuery.data]);
  const currentUser = meQuery.data?.user;
  const isAdmin = currentUser?.role === "ADMIN";

  const canManageRecipe = (recipe: Recipe) => {
    if (!currentUser) {
      return false;
    }

    if (currentUser.role === "ADMIN") {
      return true;
    }

    return recipe.ownerId === currentUser.id && !recipe.isSystem;
  };

  if (meQuery.isLoading) {
    return <p className="center-text">Loading account...</p>;
  }

  return (
    <div className="app-shell">
      <InstallPrompt />
      <header className="topbar">
        <div>
          <h1>RMS Kitchen</h1>
          <p>
            Signed in as {currentUser?.name} ({currentUser?.role})
          </p>
        </div>

        <nav className="tabs" aria-label="Main sections">
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>Recipes</button>
          <button className={tab === "pantry" ? "active" : ""} onClick={() => setTab("pantry")}>My Pantry</button>
          <button className={tab === "assistant" ? "active" : ""} onClick={() => setTab("assistant")}>AI Assistant</button>
        </nav>

        <div className="topbar-actions">
          <button
            className="ghost notification-trigger"
            type="button"
            onClick={() => setShowNotifications((value) => !value)}
            aria-expanded={showNotifications}
            aria-controls="notifications-panel"
          >
            Inbox
            {unreadCountQuery.data && unreadCountQuery.data.unread > 0 ? (
              <span className="notification-badge">{unreadCountQuery.data.unread}</span>
            ) : null}
          </button>
          <button className="ghost" onClick={() => logoutMutation.mutate()}>Logout</button>
        </div>
      </header>

      {showNotifications ? (
        <section id="notifications-panel" className="panel notifications-panel">
          <div className="panel-header">
            <h2>Notifications</h2>
            <div className="card-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => markAllNotificationsReadMutation.mutate()}
                disabled={markAllNotificationsReadMutation.isPending}
              >
                {markAllNotificationsReadMutation.isPending ? "Marking..." : "Mark all read"}
              </button>
              <button type="button" className="ghost" onClick={() => setShowNotifications(false)}>Close</button>
            </div>
          </div>

          {notificationsQuery.isLoading ? <p>Loading notifications...</p> : null}
          {notificationsQuery.isError ? <p className="error-line">{(notificationsQuery.error as Error).message}</p> : null}
          {!notificationsQuery.isLoading && (notificationsQuery.data ?? []).length === 0 ? (
            <p className="meta-line">No notifications yet.</p>
          ) : null}

          <div className="notification-list">
            {(notificationsQuery.data ?? []).map((notification) => {
              const recipeId = getRecipeIdFromNotification(notification);
              return (
                <article
                  key={notification.id}
                  className={`notification-item ${notification.readAt ? "read" : "unread"}`}
                >
                  <div>
                    <h3>{notification.title}</h3>
                    <p>{notification.message}</p>
                    <small>{new Date(notification.createdAt).toLocaleString()}</small>
                  </div>
                  <div className="card-actions">
                    {recipeId ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          if (!notification.readAt) {
                            await markNotificationReadMutation.mutateAsync(notification.id);
                          }
                          setShowNotifications(false);
                          navigate(`/app/recipes/${recipeId}`);
                        }}
                      >
                        Open recipe
                      </button>
                    ) : null}
                    {!notification.readAt ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={markNotificationReadMutation.isPending}
                        onClick={() => markNotificationReadMutation.mutate(notification.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "recipes" ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Recipes</h2>
            <div className="card-actions">
              {isAdmin ? (
                <>
                  <button
                    className="secondary"
                    onClick={() => importRecipesMutation.mutate()}
                    disabled={importRecipesMutation.isPending}
                  >
                    {importRecipesMutation.isPending ? "Importing..." : "Import 100 system recipes"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => backfillImagesMutation.mutate()}
                    disabled={backfillImagesMutation.isPending}
                  >
                    {backfillImagesMutation.isPending ? "Backfilling..." : "Backfill broken images"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => backfillMetadataMutation.mutate()}
                    disabled={backfillMetadataMutation.isPending}
                  >
                    {backfillMetadataMutation.isPending ? "Backfilling..." : "Backfill metadata"}
                  </button>
                </>
              ) : null}
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
            <select value={scope} onChange={(event) => setScope(event.target.value as "all" | "mine" | "shared") }>
              <option value="all">All recipes</option>
              <option value="mine">My recipes</option>
              <option value="shared">Shared with me</option>
            </select>
          </div>

          {recipesQuery.isLoading ? <p>Loading recipes...</p> : null}
          {recipesQuery.isError ? <p className="meta-line">{(recipesQuery.error as Error).message}</p> : null}
          {!recipesQuery.isLoading && recipeCards.length === 0 ? <p>No recipes found for current filters.</p> : null}

          <div className="recipe-grid">
            {recipeCards.map((recipe) => {
              const summary = reviewSummary(recipe);
              const canManage = canManageRecipe(recipe);
              const canShare = Boolean(currentUser && (currentUser.role === "ADMIN" || recipe.ownerId === currentUser.id));

              return (
                <article
                  className="recipe-card"
                  key={recipe.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/app/recipes/${recipe.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/app/recipes/${recipe.id}`);
                    }
                  }}
                  aria-label={`Open ${recipe.name} details`}
                >
                  {recipe.imageUrl ? <img src={recipe.imageUrl} alt={recipe.name} loading="lazy" /> : null}
                  <div className="recipe-body">
                    <h3>{recipe.name}</h3>
                    <p className="meta-line">
                      {recipe.cuisineType || "Cuisine n/a"} - Prep {recipe.prepTimeMinutes ?? "?"}m - Cook {recipe.cookTimeMinutes ?? "?"}m
                    </p>
                    <p className="truncate">{shortSnippet(recipe.instructions)}</p>
                    <p className="meta-line">Added by {recipe.owner.name}{recipe.isSystem ? " - System recipe" : ""}</p>
                    <p className="meta-line">Reviews ({summary.count}) - Avg: {summary.average}</p>
                    <div className="chip-row">
                      {recipe.myStatuses.map((status) => (
                        <span key={status} className="chip active">{status.replace("_", " ")}</span>
                      ))}
                    </div>

                    <div className="card-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <button className="secondary" onClick={() => navigate(`/app/recipes/${recipe.id}`)}>Open details</button>
                      {canManage ? (
                        <button
                          onClick={() => {
                            setEditingRecipe(recipe);
                            setShowRecipeForm(true);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      {canManage ? (
                        <button className="ghost" onClick={() => deleteRecipeMutation.mutate(recipe.id)}>Delete</button>
                      ) : null}
                      {canShare ? (
                        <button
                          className="ghost"
                          onClick={() => {
                            setShareError(null);
                            setShareTargetRecipe(recipe);
                            setShareEmail("");
                            setSharePermission("VIEWER");
                          }}
                        >
                          Share
                        </button>
                      ) : null}
                    </div>
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
                        {item.expiryDate ? ` - expires ${new Date(item.expiryDate).toLocaleDateString()}` : ""}
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
                      <button className="ghost" onClick={() => deletePantryMutation.mutate(item.id)}>Remove</button>
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
                {cookNowMutation.data.canCookNow.length > 0 ? (
                  <ul>
                    {cookNowMutation.data.canCookNow.map((item) => (
                      <li key={item.recipeId}>{item.recipeName}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta-line">No recipes are fully ready with current pantry.</p>
                )}
              </article>
              <article>
                <h3>Can almost cook</h3>
                {cookNowMutation.data.canAlmostCook.length > 0 ? (
                  <ul>
                    {cookNowMutation.data.canAlmostCook.map((item) => (
                      <li key={item.recipeId}>
                        {item.recipeName}: missing {item.missingIngredients.join(", ")}
                        {item.substitutions.length ? ` (subs: ${item.substitutions.join(", ")})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta-line">No close matches. Try adding pantry items or relax filters.</p>
                )}
              </article>
              <article>
                <h3>Shopping list</h3>
                {cookNowMutation.data.shoppingList.length > 0 ? (
                  <ul>
                    {cookNowMutation.data.shoppingList.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta-line">No shopping suggestions yet.</p>
                )}
              </article>
              <article>
                <h3>AI summary</h3>
                {cookNowMutation.data.usedRelaxedFilters ? (
                  <p className="meta-line"><strong>Relaxed filters:</strong> enabled to find more matches.</p>
                ) : null}
                {cookNowMutation.data.reason ? <p className="meta-line">{cookNowMutation.data.reason}</p> : null}
                {cookNowMutation.data.guidance ? <p className="meta-line">{cookNowMutation.data.guidance}</p> : null}
                <p>{cookNowMutation.data.aiNarrative?.summary ?? "No AI narrative available, using fallback logic."}</p>
                {cookNowMutation.data.aiNarrative?.provider ? (
                  <p className="meta-line">Provider: {cookNowMutation.data.aiNarrative.provider}</p>
                ) : null}
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

      {shareTargetRecipe ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              setShareError(null);
              shareRecipeMutation.mutate({
                recipeId: shareTargetRecipe.id,
                email: shareEmail.trim(),
                permission: sharePermission,
              });
            }}
          >
            <header>
              <h3>Share recipe</h3>
              <p>
                Recipe: <strong>{shareTargetRecipe.name}</strong>
              </p>
            </header>

            <label>
              User email
              <input
                type="email"
                placeholder="friend@example.com"
                value={shareEmail}
                onChange={(event) => setShareEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Permission
              <select
                value={sharePermission}
                onChange={(event) => setSharePermission(event.target.value as SharePermission)}
              >
                <option value="VIEWER">Viewer (read only)</option>
                <option value="EDITOR">Editor (can edit)</option>
              </select>
            </label>

            {shareError ? <p className="error-line">{shareError}</p> : null}

            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setShareTargetRecipe(null);
                  setShareEmail("");
                  setSharePermission("VIEWER");
                  setShareError(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={shareRecipeMutation.isPending || !shareEmail.trim()}>
                {shareRecipeMutation.isPending ? "Sharing..." : "Share recipe"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
