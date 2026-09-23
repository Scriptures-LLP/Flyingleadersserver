import { getFirebaseAuth } from "../config/firebaseAdmin.js";
import { AdminUser, type AdminUserDoc } from "../models/AdminUser.js";
import { Customer, type CustomerDoc } from "../models/Customer.js";
import { serializeCustomer } from "../serializers/customer.serializer.js";
import { ApiError } from "../utils/ApiError.js";
import { signAdminToken, signCustomerToken, signPasswordResetToken, verifyPasswordResetToken } from "../utils/jwt.js";
import { phoneVariants } from "../utils/phone.js";

import { consumePasswordResetCode } from "./passwordReset.service.js";
import { consumePhoneOtp } from "./phoneOtp.service.js";

// How recently the phone must have been verified for a password reset. The
// Firebase ID token itself lives an hour; a reset must follow the OTP closely
// so a token that leaks (or is replayed later) can't be used to take an
// account over.
const RESET_MAX_AGE_SECONDS = 10 * 60;

export async function signupCustomer(input: {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  phoneCode?: string;
  referralCode?: string;
}) {
  const email = input.email?.toLowerCase();
  const phone = input.phone?.trim();
  if (!email && !phone) throw ApiError.badRequest("Provide an email address or mobile number");

  const existing = await Customer.findOne({
    $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone: { $in: phoneVariants(phone) } }] : [])],
  });
  if (existing) {
    throw ApiError.conflict(
      existing.email === email ? "An account with this email already exists" : "An account with this mobile number already exists",
    );
  }

  const passwordHash = await Customer.hashPassword(input.password);
  const customer = await Customer.create({
    name: input.name,
    email,
    phone,
    phoneCode: input.phoneCode,
    passwordHash,
    authProvider: "password",
  });

  if (input.referralCode) {
    const { captureReferralSignup } = await import("./referral.service.js");
    await captureReferralSignup(input.referralCode, String(customer._id));
  }

  return toSession(customer);
}

/** `identifier` is either an email address or a mobile number. */
export async function loginCustomer(identifier: string, password: string) {
  const trimmed = identifier.trim();
  const isEmail = trimmed.includes("@");
  const customer = await Customer.findOne(
    isEmail ? { email: trimmed.toLowerCase() } : { phone: { $in: phoneVariants(trimmed) } },
  );
  if (!customer || !customer.isActive) throw ApiError.unauthorized("Invalid credentials");

  const ok = await customer.comparePassword(password);
  if (!ok) throw ApiError.unauthorized("Invalid credentials");

  return toSession(customer);
}

/**
 * `idToken` comes from the app's own Firebase phone sign-in — Firebase has
 * already verified the OTP by the time we see this. We just confirm the
 * token is genuine and find-or-create the matching Customer.
 */
export async function verifyFirebasePhoneToken(idToken: string, name?: string) {
  const decoded = await getFirebaseAuth()
    .verifyIdToken(idToken)
    .catch(() => {
      throw ApiError.unauthorized("Invalid or expired verification code");
    });

  const phone = decoded.phone_number;
  if (!phone) throw ApiError.badRequest("This sign-in method didn't provide a phone number");

  return findOrCreatePhoneSession(phone, name);
}

/** Signs in the customer with this (already verified) mobile number, creating the account the first time. */
async function findOrCreatePhoneSession(phone: string, name?: string) {
  let customer = await Customer.findOne({ phone: { $in: phoneVariants(phone) } });
  if (!customer) {
    customer = await Customer.create({
      name: name?.trim() || "Traveler",
      phone,
      authProvider: "phone",
      phoneVerifiedAt: new Date(),
    });
  } else if (!customer.phoneVerifiedAt) {
    customer.phoneVerifiedAt = new Date();
    await customer.save();
  }

  if (!customer.isActive) throw ApiError.unauthorized("This account has been deactivated");
  return toSession(customer);
}

/** Login / sign-up by mobile number with the code we texted. */
export async function loginWithPhoneOtp(phoneInput: string, code: string, name?: string) {
  const phone = await consumePhoneOtp(phoneInput, code, "login");
  return findOrCreatePhoneSession(phone, name);
}

/**
 * Forgot-password by mobile number, step 1: check the texted code and hand back
 * a short-lived token that can set a new password (and nothing else).
 */
export async function verifyResetOtp(phoneInput: string, code: string) {
  const phone = await consumePhoneOtp(phoneInput, code, "reset");
  const customer = await Customer.findOne({ phone: { $in: phoneVariants(phone) } });
  if (!customer) throw ApiError.notFound("No account is registered with this mobile number");
  if (!customer.isActive) throw ApiError.unauthorized("This account has been deactivated");
  return { resetToken: signPasswordResetToken(customer.id) };
}

/** Forgot-password by mobile number, step 2: set the new password with that token, and sign in. */
export async function resetPasswordWithResetToken(resetToken: string, newPassword: string) {
  let customerId: string;
  try {
    customerId = verifyPasswordResetToken(resetToken).sub;
  } catch {
    throw ApiError.unauthorized("Your verification has expired. Please verify your mobile number again.");
  }
  const customer = await Customer.findById(customerId);
  if (!customer || !customer.isActive) throw ApiError.unauthorized("This account isn't available");

  customer.passwordHash = await Customer.hashPassword(newPassword);
  if (!customer.phoneVerifiedAt) customer.phoneVerifiedAt = new Date();
  await customer.save();
  return toSession(customer);
}

/**
 * Forgot-password: proves ownership of the account's mobile number the same
 * way OTP sign-in does (Firebase has already checked the SMS code by the time
 * we see `idToken`), then sets a new password and signs the customer in.
 *
 * Deliberately requires a *recent* verification — a phone token older than
 * RESET_MAX_AGE_SECONDS is refused so a stale or leaked token can't reset a
 * password later.
 */
export async function resetPasswordWithPhoneToken(idToken: string, newPassword: string) {
  const decoded = await getFirebaseAuth()
    .verifyIdToken(idToken)
    .catch(() => {
      throw ApiError.unauthorized("Invalid or expired verification code");
    });

  const phone = decoded.phone_number;
  if (!phone) throw ApiError.badRequest("This verification didn't include a phone number");

  const verifiedSecondsAgo = Math.floor(Date.now() / 1000) - decoded.auth_time;
  if (verifiedSecondsAgo > RESET_MAX_AGE_SECONDS) {
    throw ApiError.unauthorized("Your verification has expired. Please verify your mobile number again.");
  }

  const customer = await Customer.findOne({ phone: { $in: phoneVariants(phone) } });
  if (!customer) throw ApiError.notFound("No account is registered with this mobile number");
  if (!customer.isActive) throw ApiError.unauthorized("This account has been deactivated");

  customer.passwordHash = await Customer.hashPassword(newPassword);
  if (!customer.phoneVerifiedAt) customer.phoneVerifiedAt = new Date();
  await customer.save();

  return toSession(customer);
}

/** Forgot-password for email accounts: the 6-digit code emailed by requestPasswordResetCode. */
export async function resetPasswordWithEmailCode(email: string, code: string, newPassword: string) {
  const customerId = await consumePasswordResetCode(email, code);
  const customer = await Customer.findById(customerId);
  if (!customer || !customer.isActive) throw ApiError.unauthorized("This account isn't available");

  customer.passwordHash = await Customer.hashPassword(newPassword);
  await customer.save();
  return toSession(customer);
}

function toSession(customer: CustomerDoc) {
  return {
    token: signCustomerToken(customer.id),
    user: serializeCustomer(customer),
  };
}

export async function loginAdmin(email: string, password: string) {
  const admin = await AdminUser.findOne({ email: email.toLowerCase() });
  if (!admin || !admin.isActive) throw ApiError.unauthorized("Invalid email or password");

  const ok = await admin.comparePassword(password);
  if (!ok) throw ApiError.unauthorized("Invalid email or password");

  admin.lastLoginAt = new Date();
  await admin.save();

  return adminSession(admin);
}

function adminSession(admin: AdminUserDoc) {
  return {
    token: signAdminToken(admin.id, admin.role as "admin" | "manager"),
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  };
}
