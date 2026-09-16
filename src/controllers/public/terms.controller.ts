import type { Request, Response } from "express";

import { Setting } from "../../models/Setting.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getTerms = asyncHandler(async (_req: Request, res: Response) => {
  const setting = await Setting.findOne({ key: "terms_html" });
  res.json({ html: setting?.value ?? "" });
});
