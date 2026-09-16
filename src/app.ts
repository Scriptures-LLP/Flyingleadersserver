import path from "node:path";

import cors from "cors";
import express from "express";
import morgan from "morgan";

import { corsOrigins, env } from "./config/env.js";
import { checkoutPage } from "./controllers/public/checkout.controller.js";
import { webhook } from "./controllers/public/payment.controller.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { adminRoutes } from "./routes/admin/index.js";
import { publicRoutes } from "./routes/public/index.js";

export const app = express();

// CORS_ORIGINS="*" (or unset) allows any origin — fine for a public read API
// consumed mainly by a native app (which doesn't enforce CORS at all). A
// comma-separated allowlist restricts it once real browser clients (the
// admin panel, a future public website) need to be locked down.
const allowAnyOrigin = corsOrigins.length === 0 || corsOrigins.includes("*");
app.use(
  cors({
    origin: allowAnyOrigin ? true : corsOrigins,
    credentials: true,
  }),
);
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

// Mounted BEFORE express.json() with express.raw() — the raw request body
// (not the parsed JSON) is what the webhook signature is computed over.
app.post("/api/v1/payments/webhook", express.raw({ type: "application/json" }), webhook);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.resolve(env.UPLOAD_ROOT)));

app.get("/checkout", checkoutPage);

// commit/bootedAt let us tell from the outside whether a push has actually
// been picked up by a redeploy yet, instead of guessing from timing alone.
const bootedAt = new Date().toISOString();
app.get("/health", (_req, res) =>
  res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT ?? null, bootedAt }),
);

app.use("/api/v1", publicRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
