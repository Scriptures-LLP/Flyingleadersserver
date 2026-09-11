import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  MONGO_URI: z.string().min(1, "MONGO_URI is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_CUSTOMER_EXPIRES_IN: z.string().default("30d"),
  JWT_ADMIN_EXPIRES_IN: z.string().default("8h"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),

  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),

  UPLOAD_ROOT: z.string().default("./uploads"),
  PUBLIC_UPLOAD_BASE_URL: z.string().default("http://localhost:4000/uploads"),

  CORS_ORIGINS: z.string().default(""),

  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),

  // MySQL sync (module E — mirrors catalog/content edits into flyingdotcom's
  // legacy database so its unmodified public PHP pages keep working).
  // Off by default: every sync call becomes a no-op until this is true.
  MYSQL_SYNC_ENABLED: z.coerce.boolean().default(false),
  MYSQL_HOST: z.string().default("localhost"),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_DATABASE: z.string().default(""),
  MYSQL_USER: z.string().default(""),
  MYSQL_PASSWORD: z.string().default(""),
  // Absolute path to the flyingdotcom checkout, so synced images can be
  // copied into its actual storage/admin-uploads directories.
  FLYINGDOTCOM_STORAGE_ROOT: z.string().default(""),

  // Module D — Firebase Phone Auth (base64-encoded service-account JSON).
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().optional().default(""),

  // Module K — AI chatbot (OpenAI).
  LLM_API_KEY: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
