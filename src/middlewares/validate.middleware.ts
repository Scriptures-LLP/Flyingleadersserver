import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

import { ApiError } from "../utils/ApiError.js";

type Schemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(ApiError.badRequest("Validation failed", (err as { errors?: unknown }).errors ?? err));
    }
  };
}
