import type { MetadataSuggestion } from "./types.js";
import { env } from "../config/env.js";
import { fallbackImageDataUri, fallbackMetadataSuggestion } from "./ai-fallback.js";

type Message = { role: "system" | "user"; content: string };

type DishImagePayload = {
  name: string;
  cuisineType?: string | null;
  ingredients?: Array<{ name: string }>;
  stylePrompt?: string;
};

export type DishImageResult = {
  url: string;
  source: "openai" | "deepseek_external" | "external_fallback" | "fallback_svg";
  prompt: string;
  query?: string;
};

type ProviderResult<T> = {
  provider: "deepseek" | "openai";
  value: T;
};

const hasDeepSeekKey = () => Boolean(env.DEEPSEEK_API_KEY?.trim());
const hasOpenAIKey = () => Boolean(env.OPENAI_API_KEY?.trim());

export const TEXT_PROVIDER_ORDER = ["deepseek", "openai"] as const;
export const IMAGE_PROVIDER_ORDER = ["openai", "deepseek_external", "external_fallback", "fallback_svg"] as const;

const parseJson = <T>(raw: string | undefined): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const parseOpenAiOutputText = (responseBody: unknown): string | undefined => {
  const direct = (responseBody as { output_text?: string })?.output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const outputItems = (responseBody as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  })?.output;

  if (!Array.isArray(outputItems)) {
    return undefined;
  }

  for (const item of outputItems) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return undefined;
};

const deepSeekJsonRequest = async <T>(messages: Message[]): Promise<T | null> => {
  if (!hasDeepSeekKey()) {
    return null;
  }

  const response = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_TEXT_MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  return parseJson<T>(content);
};

const openAiJsonRequest = async <T>(messages: Message[]): Promise<T | null> => {
  if (!hasOpenAIKey()) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL,
      input: messages,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const outputText = parseOpenAiOutputText(json);
  return parseJson<T>(outputText);
};

export const resolveTextProvider = async <T>(payload: {
  deepSeek: () => Promise<T | null>;
  openAi: () => Promise<T | null>;
}): Promise<ProviderResult<T> | null> => {
  const deepSeekValue = await payload.deepSeek();
  if (deepSeekValue) {
    return { provider: "deepseek", value: deepSeekValue };
  }

  const openAiValue = await payload.openAi();
  if (openAiValue) {
    return { provider: "openai", value: openAiValue };
  }

  return null;
};

export const buildDishImagePrompt = (payload: DishImagePayload) => {
  const ingredients = (payload.ingredients ?? []).map((item) => item.name).slice(0, 10).join(", ");
  const cuisine = payload.cuisineType ? `${payload.cuisineType} cuisine` : "regional cuisine";

  return [
    `Professional food photography of ${payload.name}.`,
    `${cuisine}.`,
    ingredients ? `Primary ingredients: ${ingredients}.` : "",
    payload.stylePrompt ? `Style: ${payload.stylePrompt}.` : "",
    "Close-up plated dish, natural light, realistic texture, high detail, no text, no logos, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
};

const buildImageSearchTopic = (payload: DishImagePayload) => {
  const ingredients = (payload.ingredients ?? []).map((item) => item.name).slice(0, 5).join(" ");
  return `${payload.name} ${payload.cuisineType ?? ""} ${ingredients}`.trim();
};

export const isRenderableImageUrl = (value?: string | null) => {
  if (!value || !value.trim()) {
    return false;
  }

  if (value.startsWith("data:image/")) {
    return true;
  }

  try {
    const parsed = new globalThis.URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const openAiImageRequest = async (prompt: string) => {
  if (!hasOpenAIKey()) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const first = json.data?.[0];
  if (!first) {
    return null;
  }

  if (first.url && isRenderableImageUrl(first.url)) {
    return first.url;
  }

  if (first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }

  return null;
};

const deepSeekImageQuery = async (payload: DishImagePayload) => {
  if (!hasDeepSeekKey()) {
    return null;
  }

  const topic = buildImageSearchTopic(payload);

  const result = await deepSeekJsonRequest<{ query?: string }>([
    {
      role: "system",
      content: "Return strict JSON {\"query\":\"...\"}. Build an exact web image search query for the named cooked dish.",
    },
    {
      role: "user",
      content: topic,
    },
  ]);

  const query = result?.query?.trim();
  return query || null;
};

const fetchMealDbImage = async (query: string): Promise<string | null> => {
  const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    meals?: Array<{ strMeal?: string | null; strMealThumb?: string | null }> | null;
  };

  const meals = json.meals ?? [];
  if (!meals.length) {
    return null;
  }

  const normalized = query.toLowerCase();
  const picked = meals.find((meal) => (meal.strMeal ?? "").toLowerCase().includes(normalized)) ?? meals[0];
  const thumbnail = picked?.strMealThumb?.trim();

  return isRenderableImageUrl(thumbnail) ? (thumbnail ?? null) : null;
};

const fetchWikipediaImage = async (query: string): Promise<string | null> => {
  const url = new globalThis.URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${query} dish`);
  url.searchParams.set("gsrlimit", "5");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "1000");

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    query?: {
      pages?: Record<string, { thumbnail?: { source?: string } }>;
    };
  };

  const pages = Object.values(json.query?.pages ?? {});
  for (const page of pages) {
    const source = page.thumbnail?.source;
    if (isRenderableImageUrl(source)) {
      return source ?? null;
    }
  }

  return null;
};

const externalImageLookup = async (query: string) => {
  const variants = Array.from(
    new Set([
      query.trim(),
      query.trim().split(/\s+/).slice(0, 3).join(" "),
    ]),
  ).filter(Boolean);

  for (const term of variants) {
    const mealDb = await fetchMealDbImage(term);
    if (mealDb) {
      return mealDb;
    }

    const wiki = await fetchWikipediaImage(term);
    if (wiki) {
      return wiki;
    }
  }

  return null;
};

export const resolveImageProvider = async (payload: {
  openAiImage: () => Promise<string | null>;
  deepSeekQuery: () => Promise<string | null>;
  externalLookup: (query: string) => Promise<string | null>;
  fallbackImage: (query: string) => string;
  defaultQuery: string;
  prompt: string;
}): Promise<DishImageResult> => {
  const openAiImage = await payload.openAiImage();
  if (openAiImage) {
    return {
      url: openAiImage,
      source: "openai",
      prompt: payload.prompt,
    };
  }

  const deepSeekQuery = await payload.deepSeekQuery();
  const effectiveQuery = deepSeekQuery ?? payload.defaultQuery;

  const externalImage = await payload.externalLookup(effectiveQuery);
  if (externalImage) {
    return {
      url: externalImage,
      source: deepSeekQuery ? "deepseek_external" : "external_fallback",
      prompt: payload.prompt,
      query: effectiveQuery,
    };
  }

  return {
    url: payload.fallbackImage(effectiveQuery),
    source: "fallback_svg",
    prompt: payload.prompt,
    query: effectiveQuery,
  };
};

export const generateMetadataSuggestion = async (payload: {
  name: string;
  ingredients: Array<{ name: string }>;
  instructions: string;
}): Promise<MetadataSuggestion> => {
  const fallback = fallbackMetadataSuggestion(payload);

  const result = await resolveTextProvider<Omit<MetadataSuggestion, "source" | "provider">>({
    deepSeek: () =>
      deepSeekJsonRequest([
        {
          role: "system",
          content:
            "Return strict JSON for recipe metadata fields: cuisineType, prepTimeMinutes, cookTimeMinutes, servings, difficulty(EASY|MEDIUM|HARD), tags, nutrition, allergens.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ]),
    openAi: () =>
      openAiJsonRequest([
        {
          role: "system",
          content:
            "Return strict JSON for recipe metadata fields: cuisineType, prepTimeMinutes, cookTimeMinutes, servings, difficulty(EASY|MEDIUM|HARD), tags, nutrition, allergens.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ]),
  });

  if (!result) {
    return {
      ...fallback,
      source: "fallback",
      provider: "fallback",
    };
  }

  const candidate = result.value;
  return {
    cuisineType: candidate.cuisineType ?? fallback.cuisineType,
    prepTimeMinutes: Number(candidate.prepTimeMinutes ?? fallback.prepTimeMinutes),
    cookTimeMinutes: Number(candidate.cookTimeMinutes ?? fallback.cookTimeMinutes),
    servings: Number(candidate.servings ?? fallback.servings),
    difficulty: candidate.difficulty ?? fallback.difficulty,
    tags: Array.isArray(candidate.tags) ? candidate.tags : fallback.tags,
    nutrition: candidate.nutrition ?? fallback.nutrition,
    allergens: Array.isArray(candidate.allergens) ? candidate.allergens : fallback.allergens,
    source: "ai",
    provider: result.provider,
  };
};

export const generateDishImage = async (payload: DishImagePayload): Promise<DishImageResult> => {
  const prompt = buildDishImagePrompt(payload);

  return resolveImageProvider({
    openAiImage: () => openAiImageRequest(prompt),
    deepSeekQuery: () => deepSeekImageQuery(payload),
    externalLookup: externalImageLookup,
    fallbackImage: (query) => fallbackImageDataUri(payload.name || query, payload.stylePrompt),
    defaultQuery: buildImageSearchTopic(payload) || payload.name,
    prompt,
  });
};

export const generateCookNarrative = async (payload: {
  pantry: string[];
  canCookNow: string[];
  canAlmostCook: Array<{ name: string; missing: string[] }>;
}) => {
  const result = await resolveTextProvider<{ summary: string; tips: string[] }>({
    deepSeek: () =>
      deepSeekJsonRequest([
        {
          role: "system",
          content: "Return strict JSON {\"summary\":string,\"tips\":string[]}. Keep advice practical and concise.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ]),
    openAi: () =>
      openAiJsonRequest([
        {
          role: "system",
          content: "Return strict JSON {\"summary\":string,\"tips\":string[]}. Keep advice practical and concise.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ]),
  });

  if (!result) {
    return null;
  }

  return {
    ...result.value,
    provider: result.provider,
  };
};

export const isAiConfigured = () => hasDeepSeekKey() || hasOpenAIKey();
