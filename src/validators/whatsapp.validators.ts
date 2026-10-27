import { z } from "zod";

export const sendWhatsAppSchema = z.object({
  phone: z.string().trim().min(10),
  /** The Gupshup template's id (a UUID, not its display name) — from the app's Templates list on Gupshup. */
  templateId: z.string().trim().min(1),
  /** Fills the template's {{1}}, {{2}}… placeholders in order. */
  params: z.array(z.string()).default([]),
});
