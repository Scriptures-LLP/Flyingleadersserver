import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const isWhatsAppConfigured = () =>
  !!(env.GUPSHUP_API_KEY && env.GUPSHUP_APP_NAME && env.GUPSHUP_SOURCE_NUMBER);

/**
 * India-only: normalises whatever form a phone number is stored/typed in
 * ("+919876543210", "919876543210", "9876543210"…) to Gupshup's expected
 * "91XXXXXXXXXX", digits only. Returns null rather than throwing so callers
 * that run as fire-and-forget background notifications (which must never
 * throw) can just skip the send on a bad number.
 */
export function toGupshupDestination(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length >= 10 ? digits.slice(-10) : "";
  return /^[6-9]\d{9}$/.test(national) ? `91${national}` : null;
}

/**
 * Sends an approved WhatsApp template message through Gupshup's WhatsApp
 * Business API. WhatsApp only allows free-form text inside a 24h window after
 * the customer last messaged the business; anything outside that (which is
 * the normal case for a booking/payment notification) must use a template
 * that's already been approved by Meta via Gupshup's console.
 *
 * `destination` is the customer's number, E.164 digits only (no +, e.g.
 * "919876543210"). `templateId` is the Gupshup template's id (a UUID, not its
 * display name). `params` fill the template's `{{1}}`, `{{2}}`… placeholders
 * in order.
 */
export async function sendWhatsAppTemplate(
  destination: string,
  templateId: string,
  params: string[],
): Promise<void> {
  if (!isWhatsAppConfigured()) throw ApiError.serviceUnavailable("WhatsApp isn't set up on this server yet");

  const controller = new AbortController();
  // Fail fast: a slow WhatsApp gateway must not hold a customer-facing request open.
  const timer = setTimeout(() => controller.abort(), 10_000);
  const unavailable = () =>
    ApiError.serviceUnavailable("Couldn't send the WhatsApp message right now. Please try again in a moment.");

  const body = new URLSearchParams({
    channel: "whatsapp",
    source: env.GUPSHUP_SOURCE_NUMBER,
    destination,
    "src.name": env.GUPSHUP_APP_NAME,
    template: JSON.stringify({ id: templateId, params }),
  });

  let res: Response;
  try {
    res = await fetch(env.GUPSHUP_TEMPLATE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: env.GUPSHUP_API_KEY,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
  } catch (err) {
    console.error("[whatsapp] request to Gupshup failed:", err instanceof Error ? err.message : err);
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }

  const payload = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
  if (!res.ok || payload.status !== "submitted") {
    // Log Gupshup's own reason (never the API key) so a template / number /
    // balance problem can be diagnosed from the server logs.
    console.error(`[whatsapp] Gupshup rejected the send (HTTP ${res.status}): ${JSON.stringify(payload)}`);
    throw unavailable();
  }
}

export type CreateTemplateResult = { ok: boolean; httpStatus: number; gupshupResponse: unknown };

/**
 * Submits a new WhatsApp template for Meta's approval through Gupshup, so an
 * admin can create one without leaving our own panel. EXPERIMENTAL: built
 * against a Gupshup endpoint shape found in docs that weren't dated as
 * current, so the exact field set may have drifted -- `gupshupResponse` is
 * always returned as-is (not swallowed into a generic error like the send
 * function above) specifically so a rejection's real reason is visible and
 * this can be adjusted quickly rather than guessed at blindly.
 *
 * `elementName` must be lowercase letters, numbers and underscores only, and
 * unique. `content` is the body text using `{{1}}`, `{{2}}`… placeholders;
 * `sampleValues` fills them in the same order to build the "how it'll look"
 * example Meta's reviewers see.
 */
export async function createWhatsAppTemplate(params: {
  elementName: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  content: string;
  sampleValues: string[];
  footer?: string;
}): Promise<CreateTemplateResult> {
  if (!env.GUPSHUP_API_KEY || !env.GUPSHUP_APP_ID) {
    throw ApiError.serviceUnavailable("WhatsApp template creation isn't set up on this server yet");
  }

  let example = params.content;
  params.sampleValues.forEach((value, i) => {
    example = example.replace(`{{${i + 1}}}`, value);
  });

  const body = new URLSearchParams({
    elementName: params.elementName,
    languageCode: "en",
    category: params.category,
    templateType: "TEXT",
    vertical: params.elementName,
    content: params.content,
    example,
    ...(params.footer ? { footer: params.footer } : {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${env.GUPSHUP_CREATE_TEMPLATE_URL_BASE}/${env.GUPSHUP_APP_ID}/template`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: env.GUPSHUP_API_KEY,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
  } catch (err) {
    console.error("[whatsapp] create-template request to Gupshup failed:", err instanceof Error ? err.message : err);
    throw ApiError.serviceUnavailable("Couldn't reach Gupshup right now. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }

  const gupshupResponse = await res.json().catch(() => ({}));
  if (!res.ok) console.error(`[whatsapp] Gupshup rejected template creation (HTTP ${res.status}):`, gupshupResponse);
  return { ok: res.ok, httpStatus: res.status, gupshupResponse };
}

export type WhatsAppTemplate = {
  id: string;
  elementName: string;
  /** The body text with {{1}}, {{2}}… placeholders, as registered. */
  content: string;
  category: string;
  status: string;
  /** Only present when status is FAILED/REJECTED — Gupshup's own reason. */
  reason?: string;
};

/** Lists every template registered on the app, approved or not, for the admin's "pick one" dropdown and reference table. */
export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  if (!env.GUPSHUP_API_KEY || !env.GUPSHUP_APP_ID) {
    throw ApiError.serviceUnavailable("WhatsApp isn't set up on this server yet");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${env.GUPSHUP_CREATE_TEMPLATE_URL_BASE}/${env.GUPSHUP_APP_ID}/template`, {
      method: "GET",
      signal: controller.signal,
      headers: { apikey: env.GUPSHUP_API_KEY, accept: "application/json" },
    });
  } catch (err) {
    console.error("[whatsapp] list-templates request to Gupshup failed:", err instanceof Error ? err.message : err);
    throw ApiError.serviceUnavailable("Couldn't reach Gupshup right now. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }

  const payload = (await res.json().catch(() => ({}))) as {
    templates?: Array<{ id: string; elementName: string; data: string; category: string; status: string; reason?: string }>;
  };
  if (!res.ok) {
    console.error(`[whatsapp] Gupshup rejected listing templates (HTTP ${res.status}):`, payload);
    throw ApiError.serviceUnavailable("Couldn't load WhatsApp templates right now. Please try again in a moment.");
  }

  return (payload.templates ?? []).map((t) => ({
    id: t.id,
    elementName: t.elementName,
    content: t.data,
    category: t.category,
    status: t.status,
    reason: t.reason,
  }));
}
