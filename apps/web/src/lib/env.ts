import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  SIDECAR_URL: z.string().url(),
  SIDECAR_API_KEY: z.string().min(16),
  SIDECAR_URL_SIGNING_KEY: z.string().min(32),
  OPENAI_API_KEY: z.string().min(20).optional(),
  AZURE_DI_ENDPOINT: z.string().url().optional(),
  AZURE_DI_KEY: z.string().min(10).optional(),
  // Shows the one-click role switcher and the demo clock. On for the pitch prototype.
  DEMO_MODE: z.enum(["0", "1"]).default("1"),
});

export const env = schema.parse(process.env);
export const demoMode = env.DEMO_MODE === "1";
