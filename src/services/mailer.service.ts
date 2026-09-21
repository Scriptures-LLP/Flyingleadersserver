import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

let transporter: Transporter | null = null;

export const isMailConfigured = () => !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);

function getTransporter(): Transporter {
  if (!isMailConfigured()) {
    throw ApiError.serviceUnavailable("Email isn't set up on this server yet");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is TLS from the first byte; every other port (587, 2525, ...) starts
      // plain and must upgrade (STARTTLS) — insist on the upgrade so credentials
      // never travel in the clear. (2525 matters: Render's free plan blocks 25,
      // 465 and 587 outbound, and 2525 is the usual alternative.)
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT !== 465,
      auth: {
        user: env.SMTP_USER,
        // Google shows app passwords in four space-separated groups; the
        // spaces aren't part of the password.
        pass: env.SMTP_PASS.replace(/\s+/g, ""),
      },
      // Fail fast: a hung mail server must not hold a customer's request open.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

// SMTP_FROM may be a bare address or already "Name <address>".
const fromAddress = () => (env.SMTP_FROM.includes("<") ? env.SMTP_FROM : `"Flying Leader" <${env.SMTP_FROM}>`);

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  await getTransporter().sendMail({ from: fromAddress(), ...message });
}

/** Opens and authenticates an SMTP connection without sending anything. */
export async function verifyMailTransport() {
  await getTransporter().verify();
}

export function passwordResetEmail(code: string, expiresInMinutes: number) {
  const subject = "Your Flying Leader password reset code";
  const text =
    `Your Flying Leader password reset code is ${code}.\n\n` +
    `It expires in ${expiresInMinutes} minutes. If you didn't ask to reset your password, ` +
    `you can ignore this email — your password won't change.`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#141414">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">
    <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:16px;padding:28px" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:20px;font-weight:800;color:#D62828">Flying Leader</td></tr>
      <tr><td style="padding-top:18px;font-size:15px;line-height:22px">Use this code to reset your password:</td></tr>
      <tr><td align="center" style="padding:18px 0"><span style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:8px;background:#f5f5f5;border-radius:12px;padding:12px 22px">${code}</span></td></tr>
      <tr><td style="font-size:13px;line-height:20px;color:#6b6b6b">It expires in ${expiresInMinutes} minutes. If you didn't ask to reset your password, you can ignore this email — your password won't change.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
