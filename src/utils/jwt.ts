import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export type CustomerTokenPayload = { sub: string; role: "customer" };
export type AdminTokenPayload = { sub: string; role: "admin" | "manager" };

export function signCustomerToken(customerId: string): string {
  const payload: CustomerTokenPayload = { sub: customerId, role: "customer" };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_CUSTOMER_EXPIRES_IN } as jwt.SignOptions);
}

export function signAdminToken(adminId: string, role: "admin" | "manager"): string {
  const payload: AdminTokenPayload = { sub: adminId, role };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ADMIN_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken<T extends object>(token: string): T {
  return jwt.verify(token, env.JWT_SECRET) as T;
}

/**
 * Proof that a mobile number was just verified by SMS code, good for setting a
 * new password. It carries no `role`, so requireAuth rejects it everywhere else:
 * it can reset a password and do nothing more.
 */
export function signPasswordResetToken(customerId: string): string {
  return jwt.sign({ sub: customerId, purpose: "pw-reset" }, env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyPasswordResetToken(token: string): { sub: string } {
  const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; purpose?: string };
  if (payload.purpose !== "pw-reset" || !payload.sub) throw new Error("not a password-reset token");
  return { sub: payload.sub };
}
