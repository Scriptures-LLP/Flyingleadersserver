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
