import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const isSmsConfigured = () => !!(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID && env.MSG91_OTP_VAR);

/**
 * Sends the OTP through MSG91's Flow API (v5). The message text is the approved
 * template registered in MSG91; we only supply the recipient and the value for
 * the template's OTP placeholder (named by MSG91_OTP_VAR, case-sensitive — a
 * wrong name makes MSG91 send the SMS with the code missing).
 *
 * `nationalNumber` is the 10-digit Indian mobile number (no +91).
 */
export async function sendOtpSms(nationalNumber: string, code: string): Promise<void> {
  if (!isSmsConfigured()) throw ApiError.serviceUnavailable("SMS isn't set up on this server yet");

  const controller = new AbortController();
  // Fail fast: a slow SMS gateway must not hold a customer's request open.
  const timer = setTimeout(() => controller.abort(), 10_000);
  const unavailable = () => ApiError.serviceUnavailable("Couldn't send the SMS right now. Please try again in a moment.");

  let res: Response;
  try {
    res = await fetch(env.MSG91_FLOW_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        template_id: env.MSG91_TEMPLATE_ID,
        short_url: "0",
        recipients: [{ mobiles: `91${nationalNumber}`, [env.MSG91_OTP_VAR]: code }],
      }),
    });
  } catch (err) {
    console.error("[sms] request to MSG91 failed:", err instanceof Error ? err.message : err);
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (!res.ok || body.type !== "success") {
    // Log MSG91's own reason (never the code or the auth key) so a template /
    // sender / balance problem can be diagnosed from the server logs.
    console.error(`[sms] MSG91 rejected the send (HTTP ${res.status}): ${body.message ?? "no message"}`);
    throw unavailable();
  }
}
