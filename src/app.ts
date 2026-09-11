import path from "node:path";

import cors from "cors";
import express from "express";
import morgan from "morgan";

import { corsOrigins, env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { adminRoutes } from "./routes/admin/index.js";
import { publicRoutes } from "./routes/public/index.js";

export const app = express();

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  }),
);
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

// NOTE: the Razorpay webhook route (added in Phase 2) must be mounted here,
// BEFORE express.json(), using express.raw() — otherwise the raw request
// body needed for signature verification is lost.

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.resolve(env.UPLOAD_ROOT)));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/v1", publicRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
