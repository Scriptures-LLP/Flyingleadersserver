import { getFirebaseAuth } from "../config/firebaseAdmin.js";
import { AdminUser, type AdminUserDoc } from "../models/AdminUser.js";
import { Customer, type CustomerDoc } from "../models/Customer.js";
import { serializeCustomer } from "../serializers/customer.serializer.js";
import { ApiError } from "../utils/ApiError.js";
import { signAdminToken, signCustomerToken } from "../utils/jwt.js";

export async function signupCustomer(input: {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  phoneCode?: string;
}) {
  const email = input.email?.toLowerCase();
  const phone = input.phone?.trim();
  if (!email && !phone) throw ApiError.badRequest("Provide an email address or mobile number");

  const existing = await Customer.findOne({
    $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
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

  return toSession(customer);
}

/** `identifier` is either an email address or a mobile number. */
export async function loginCustomer(identifier: string, password: string) {
  const trimmed = identifier.trim();
  const isEmail = trimmed.includes("@");
  const customer = await Customer.findOne(
    isEmail ? { email: trimmed.toLowerCase() } : { phone: trimmed },
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

  let customer = await Customer.findOne({ phone });
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
