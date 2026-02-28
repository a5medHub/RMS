import type {
  CookResult,
  MetadataSuggestion,
  Notification,
  PantryItem,
  Recipe,
  RecipeReview,
  SharePermission,
  User,
} from "../types";
import type { RecipeStatus } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
    throw new Error(error.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

type RecipeStatusesUpdateResult = {
  id: string;
  statuses: RecipeStatus[];
  updatedAt: string;
  clientDurationMs: number;
  serverDurationMs?: number;
};

type RecipeStatusesUpdatePayload = Pick<RecipeStatusesUpdateResult, "id" | "statuses" | "updatedAt">;

export const authApi = {
  me: () => apiFetch<{ authenticated: boolean; user: User | null }>("/api/auth/me"),
  signup: (payload: { name: string; email: string; password: string }) =>
    apiFetch<{ authenticated: boolean; user: User | null }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<{ authenticated: boolean; user: User | null }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () => apiFetch<{ message: string }>("/api/auth/logout", { method: "POST" }),
  startGoogle: () => {
    window.location.href = `${API_URL}/api/auth/google`;
  },
  devLogin: (email?: string) =>
    apiFetch<{ authenticated: boolean; user: User | null }>("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};

export const recipeApi = {
  list: (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });

    return apiFetch<Recipe[]>(`/api/recipes?${search.toString()}`);
  },
  getById: (id: string) => apiFetch<Recipe>(`/api/recipes/${id}`),
  create: (payload: Record<string, unknown>) =>
    apiFetch<Recipe>("/api/recipes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Recipe>(`/api/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  updateStatuses: async (id: string, statuses: RecipeStatus[]) => {
    const startedAt = globalThis.performance?.now() ?? Date.now();
    const response = await fetch(`${API_URL}/api/recipes/${id}/statuses`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ statuses }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
      throw new Error(error.message ?? "Request failed");
    }

    const payload = (await response.json()) as RecipeStatusesUpdatePayload;
    const serverDurationHeader = response.headers.get("x-handler-ms");
    const serverDurationMs = serverDurationHeader ? Number(serverDurationHeader) : undefined;
    const finishedAt = globalThis.performance?.now() ?? Date.now();

    return {
      ...payload,
      clientDurationMs: Number((finishedAt - startedAt).toFixed(2)),
      serverDurationMs: Number.isFinite(serverDurationMs) ? serverDurationMs : undefined,
    };
  },
  delete: (id: string) =>
    apiFetch<void>(`/api/recipes/${id}`, {
      method: "DELETE",
    }),
  share: (id: string, email: string, permission: SharePermission) =>
    apiFetch(`/api/recipes/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ email, permission }),
    }),
  addReview: (id: string, payload: { rating: number; comment: string }) =>
    apiFetch<RecipeReview>(`/api/recipes/${id}/reviews`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  importFree: (count = 100) =>
    apiFetch<{ created: number; skipped: number; fetched: number; requested: number }>(
      `/api/recipes/import/free?count=${count}`,
      {
        method: "POST",
      },
    ),
  backfillImages: (limit = 100) =>
    apiFetch<{ scanned: number; updated: number; failed: number; message: string }>("/api/recipes/images/backfill", {
      method: "POST",
      body: JSON.stringify({ limit }),
    }),
  backfillMetadata: (limit = 100) =>
    apiFetch<{ scanned: number; updated: number; failed: number; message: string }>("/api/recipes/metadata/backfill", {
      method: "POST",
      body: JSON.stringify({ limit }),
    }),
};

export const pantryApi = {
  list: () => apiFetch<PantryItem[]>("/api/pantry"),
  create: (payload: Partial<PantryItem>) =>
    apiFetch<PantryItem>("/api/pantry", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<PantryItem>) =>
    apiFetch<PantryItem>(`/api/pantry/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/api/pantry/${id}`, {
      method: "DELETE",
    }),
};

export const aiApi = {
  cookNow: (payload: { cuisineType?: string; maxPrepTimeMinutes?: number; difficulty?: string }) =>
    apiFetch<CookResult>("/api/ai/cook-now", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  suggestMetadata: (payload: { name: string; ingredients: Array<{ name: string }>; instructions: string }) =>
    apiFetch<MetadataSuggestion>("/api/ai/metadata", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const notificationApi = {
  list: (limit = 30) => apiFetch<Notification[]>(`/api/notifications?limit=${limit}`),
  unreadCount: () => apiFetch<{ unread: number }>("/api/notifications/unread-count"),
  markRead: (id: string) =>
    apiFetch<{ id: string; readAt: string }>(`/api/notifications/${id}/read`, {
      method: "PATCH",
    }),
  markAllRead: () =>
    apiFetch<{ message: string; updated: number }>("/api/notifications/read-all", {
      method: "PATCH",
    }),
};
