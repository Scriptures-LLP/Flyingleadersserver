import type { Request, Response } from "express";

import { sendWhatsAppTemplate, toGupshupDestination } from "../../services/whatsapp.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const send = asyncHandler(async (req: Request, res: Response) => {
  const { phone, templateId, params } = req.body as { phone: string; templateId: string; params: string[] };
  const destination = toGupshupDestination(phone);
  if (!destination) throw ApiError.badRequest("Enter a valid 10-digit mobile number.");
  await sendWhatsAppTemplate(destination, templateId, params);
  res.json({ ok: true });
});
