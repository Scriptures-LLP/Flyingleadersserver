import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../utils/ApiError.js";
import type { AdminTokenPayload } from "../utils/jwt.js";

/** Must run after requireAdminAuth. Restricts a route to specific admin roles. */
export function requireRole(...roles: AdminTokenPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(ApiError.unauthorized());
    if (!roles.includes(req.admin.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(" or ")}`));
    }
    next();
  };
}
