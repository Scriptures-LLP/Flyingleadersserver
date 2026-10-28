import { z } from "zod";

export const sendWhatsAppSchema = z.object({
  phone: z.string().trim().min(10),
  /** The Gupshup template's id (a UUID, not its display name) — from the app's Templates list on Gupshup. */
  templateId: z.string().trim().min(1),
  /** Fills the template's {{1}}, {{2}}… placeholders in order. */
  params: z.array(z.string()).default([]),
});

export const createWhatsAppTemplateSchema = z.object({
  /** Gupshup's own naming rule: lowercase letters, numbers and underscores only. */
  elementName: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores only."),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  content: z.string().trim().min(1).max(1024),
  /** Fills the content's {{1}}, {{2}}… placeholders in order, to build the sample Meta's reviewers see. */
  sampleValues: z.array(z.string()).default([]),
  footer: z.string().trim().max(60).optional(),
});
