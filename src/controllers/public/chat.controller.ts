import type { Request, Response } from "express";

import * as chatbotService from "../../services/chatbot.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body as { message: string };
  const result = await chatbotService.sendMessage(req.customer!.sub, message);
  res.json(result);
});

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const items = await chatbotService.getHistory(req.customer!.sub);
  res.json({ items });
});
