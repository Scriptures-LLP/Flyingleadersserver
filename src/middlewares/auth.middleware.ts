import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../utils/ApiError.js";
import { verifyToken, type AdminTokenPayload, type CustomerTokenPayload } from "../utils/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: CustomerTokenPayload;
      admin?: AdminTokenPayload;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next(ApiError.unauthorized("Missing bearer token"));

  try {
    const payload = verifyToken<CustomerTokenPayload>(token);
    if (payload.role !== "customer") return next(ApiError.unauthorized("Invalid token"));
    req.customer = payload;
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}

/** Same as requireAuth, but doesn't reject the request when no/invalid token is present — just leaves req.customer unset. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifyToken<CustomerTokenPayload>(token);
    if (payload.role === "customer") req.customer = payload;
  } catch {
    // ignore invalid token — treat as anonymous
  }
  next();
}

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next(ApiError.unauthorized("Missing bearer token"));

  try {
    const payload = verifyToken<AdminTokenPayload>(token);
    if (payload.role !== "admin" && payload.role !== "manager") {
      return next(ApiError.unauthorized("Invalid token"));
    }
    req.admin = payload;
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}
