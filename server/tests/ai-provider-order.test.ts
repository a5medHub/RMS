import { describe, expect, it, vi } from "vitest";
import { resolveImageProvider, resolveTextProvider } from "../src/services/ai-provider.js";

describe("ai provider order", () => {
  it("uses DeepSeek first for text and OpenAI fallback", async () => {
    const order: string[] = [];

    const deepSeekFirst = await resolveTextProvider({
      deepSeek: async () => {
        order.push("deepseek");
        return { value: 1 };
      },
      openAi: async () => {
        order.push("openai");
        return { value: 2 };
      },
    });

    expect(deepSeekFirst?.provider).toBe("deepseek");
    expect(order).toEqual(["deepseek"]);

    const fallbackOrder: string[] = [];
    const openAiFallback = await resolveTextProvider({
      deepSeek: async () => {
        fallbackOrder.push("deepseek");
        return null;
      },
      openAi: async () => {
        fallbackOrder.push("openai");
        return { value: 2 };
      },
    });

    expect(openAiFallback?.provider).toBe("openai");
    expect(fallbackOrder).toEqual(["deepseek", "openai"]);
  });

  it("uses OpenAI image first then external fallback chain", async () => {
    const calls: string[] = [];

    const result = await resolveImageProvider({
      openAiImage: async () => {
        calls.push("openai_image");
        return null;
      },
      deepSeekQuery: async () => {
        calls.push("deepseek_query");
        return "chicken biryani";
      },
      externalLookup: async (query) => {
        calls.push(`external:${query}`);
        return "https://example.com/biryani.jpg";
      },
      fallbackImage: vi.fn(() => "data:image/svg+xml;base64,abc"),
      defaultQuery: "biryani",
      prompt: "food prompt",
    });

    expect(calls).toEqual(["openai_image", "deepseek_query", "external:chicken biryani"]);
    expect(result.source).toBe("deepseek_external");
    expect(result.url).toContain("https://example.com/");
  });
});