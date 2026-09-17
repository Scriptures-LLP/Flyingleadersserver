import type { Request, Response } from "express";

import { getAgeCategoryConfig } from "../../services/ageCategory.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getConfig = asyncHandler(async (_req: Request, res: Response) => {
  const ageCategories = await getAgeCategoryConfig();
  res.json({ ageCategories });
});
