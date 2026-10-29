import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { Customer } from "../../models/Customer.js";
import { sendGuestMessage, sendMessage } from "../../services/chatbot.service.js";
import { sendWhatsAppSessionMessage, toGupshupDestination } from "../../services/whatsapp.service.js";
import { phoneVariants } from "../../utils/phone.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

/**
 * Pieced together from Gupshup's own (inconsistently-dated) docs, not
 * verified against a real live payload yet — the sender's number has shown
 * up as both `source` and `sender.phone` in different doc examples, so both
 * are checked. Logs the full raw payload whenever the shape doesn't match
 * what's expected, so the real format is visible from server logs on the
 * first real inbound message rather than guessed at blindly.
 */
function extractInboundText(body: unknown): { from: string; text: string } | null {
  const b = body as {
    type?: string;
    payload?: { type?: string; source?: string; sender?: { phone?: string }; payload?: { text?: string } };
  };
  if (b?.type !== "message") return null;
  const from = b.payload?.source ?? b.payload?.sender?.phone;
  const text = b.payload?.payload?.text;
  if (!from || b.payload?.type !== "text" || typeof text !== "string") return null;
  return { from, text };
}

/**
 * Inbound WhatsApp messages from Gupshup. Replies fast with 200 (webhooks
 * must ack quickly) and does the actual AI reply + WhatsApp send afterwards
 * in the background -- a round-trip through OpenAI plus its tool calls can
 * take several seconds, too slow to hold the webhook response open for.
 */
export const gupshupWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!env.GUPSHUP_WEBHOOK_SECRET || req.query.token !== env.GUPSHUP_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  res.json({ ok: true });

  const inbound = extractInboundText(req.body);
  if (!inbound) {
    console.log("[whatsapp-webhook] ignored non-text/unrecognised event:", JSON.stringify(req.body).slice(0, 2000));
    return;
  }

  const destination = toGupshupDestination(inbound.from);
  if (!destination) return;

  try {
    const customer = await Customer.findOne({ phone: { $in: phoneVariants(inbound.from) }, isActive: true });
    const { reply } = customer ? await sendMessage(String(customer._id), inbound.text) : await sendGuestMessage(inbound.text);
    await sendWhatsAppSessionMessage(destination, reply);
  } catch (err) {
    console.error("[whatsapp-webhook] failed to auto-reply:", err);
  }
});
