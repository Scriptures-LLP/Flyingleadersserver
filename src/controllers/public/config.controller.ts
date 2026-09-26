import type { Request, Response } from "express";

import { getAgeCategoryConfig } from "../../services/ageCategory.service.js";
import { getSocialLinks } from "../../services/socialLinks.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getConfig = asyncHandler(async (_req: Request, res: Response) => {
  const [ageCategories, socialLinks] = await Promise.all([getAgeCategoryConfig(), getSocialLinks()]);
  res.json({ ageCategories, socialLinks });
});
