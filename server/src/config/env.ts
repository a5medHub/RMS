import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(8),
  CLIENT_URL: z.string().url(),
  SERVER_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  DEEPSEEK_TEXT_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_IMAGE_ENDPOINT: z.union([z.literal(""), z.string().url()]).default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_TEXT_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  ALLOW_DEV_AUTH: z.string().optional().transform((value) => value === "true"),
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

