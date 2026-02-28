import type { MetadataSuggestion } from "./types.js";
import { env } from "../config/env.js";
import { fallbackMetadataSuggestion } from "./ai-fallback.js";

type Message = { role: "system" | "user"; content: string };

const hasDeepSeekKey = Boolean(env.DEEPSEEK_API_KEY);
const hasOpenAIKey = Boolean(env.OPENAI_API_KEY);

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

const deepSeekJsonRequest = async <T>(messages: Message[]): Promise<T | null> => {
  if (!hasDeepSeekKey) {
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
  if (!hasOpenAIKey) {
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
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    output_text?: string;
  };

  return parseJson<T>(json.output_text);
};

const preferredJsonRequest = async <T>(messages: Message[]): Promise<T | null> => {
  const deepSeekResult = await deepSeekJsonRequest<T>(messages);
  if (deepSeekResult) {
    return deepSeekResult;
  }

  return openAiJsonRequest<T>(messages);
};

const deepSeekImageRequest = async () => {
  if (!hasDeepSeekKey || !env.DEEPSEEK_IMAGE_ENDPOINT) {
    return null;
  }

  return null;
};

const openAiImageRequest = async (prompt: string) => {
  if (!hasOpenAIKey) {
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

  const item = json.data?.[0];
  if (!item) {
    return null;
  }

  if (item.url) {
    return item.url;
  }

  if (item.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }

  return null;
};

export const generateMetadataSuggestion = async (payload: {
  name: string;
  ingredients: Array<{ name: string }>;
  instructions: string;
}): Promise<MetadataSuggestion> => {
  const fallback = fallbackMetadataSuggestion(payload);

  const result = await preferredJsonRequest<Omit<MetadataSuggestion, "source">>([
    {
      role: "system",
      content:
        "Return strict JSON metadata for recipe fields: cuisineType, prepTimeMinutes, cookTimeMinutes, servings, difficulty(EASY|MEDIUM|HARD), tags, nutrition, allergens.",
    },
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ]);

  if (!result) {
    return fallback;
  }

  return {
    cuisineType: result.cuisineType ?? fallback.cuisineType,
    prepTimeMinutes: Number(result.prepTimeMinutes ?? fallback.prepTimeMinutes),
    cookTimeMinutes: Number(result.cookTimeMinutes ?? fallback.cookTimeMinutes),
    servings: Number(result.servings ?? fallback.servings),
    difficulty: result.difficulty ?? fallback.difficulty,
    tags: Array.isArray(result.tags) ? result.tags : fallback.tags,
    nutrition: result.nutrition ?? fallback.nutrition,
    allergens: Array.isArray(result.allergens) ? result.allergens : fallback.allergens,
    source: "ai",
  };
};

export const generateDishImage = async (prompt: string) => {
  const deepSeekImage = await deepSeekImageRequest();
  if (deepSeekImage) {
    return deepSeekImage;
  }

  return openAiImageRequest(prompt);
};

export const generateCookNarrative = async (payload: {
  pantry: string[];
  canCookNow: string[];
  canAlmostCook: Array<{ name: string; missing: string[] }>;
}) => {
  return preferredJsonRequest<{ summary: string; tips: string[] }>([
    {
      role: "system",
      content: "Return JSON with {summary:string,tips:string[]} for pantry cooking advice.",
    },
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ]);
};

export const isAiConfigured = () => hasDeepSeekKey || hasOpenAIKey;
