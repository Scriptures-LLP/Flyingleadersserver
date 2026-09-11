import { AdminUser, type AdminUserDoc } from "../models/AdminUser.js";
import { Customer, type CustomerDoc } from "../models/Customer.js";
import { ApiError } from "../utils/ApiError.js";
import { signAdminToken, signCustomerToken } from "../utils/jwt.js";

export async function signupCustomer(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  phoneCode?: string;
}) {
  const existing = await Customer.findOne({ email: input.email.toLowerCase() });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const passwordHash = await Customer.hashPassword(input.password);
  const customer = await Customer.create({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    phoneCode: input.phoneCode,
    passwordHash,
    authProvider: "password",
  });

  return toSession(customer);
}

export async function loginCustomer(email: string, password: string) {
  const customer = await Customer.findOne({ email: email.toLowerCase() });
  if (!customer || !customer.isActive) throw ApiError.unauthorized("Invalid email or password");

  const ok = await customer.comparePassword(password);
  if (!ok) throw ApiError.unauthorized("Invalid email or password");

  return toSession(customer);
}

function toSession(customer: CustomerDoc) {
  return {
    token: signCustomerToken(customer.id),
    user: { id: customer.id, name: customer.name, email: customer.email },
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
