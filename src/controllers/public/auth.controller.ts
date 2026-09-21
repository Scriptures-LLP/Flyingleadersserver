import type { Request, Response } from "express";

import { Customer } from "../../models/Customer.js";
import { serializeCustomer } from "../../serializers/customer.serializer.js";
import * as authService from "../../services/auth.service.js";
import { requestPasswordResetCode } from "../../services/passwordReset.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { phoneVariants } from "../../utils/phone.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const session = await authService.signupCustomer(req.body);
  res.status(201).json(session);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body;
  const session = await authService.loginCustomer(identifier, password);
  res.json(session);
});

export const phoneVerify = asyncHandler(async (req: Request, res: Response) => {
  const { idToken, name } = req.body as { idToken: string; name?: string };
  const session = await authService.verifyFirebasePhoneToken(idToken, name);
  res.json(session);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { idToken, newPassword } = req.body as { idToken: string; newPassword: string };
  const session = await authService.resetPasswordWithPhoneToken(idToken, newPassword);
  res.json(session);
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await requestPasswordResetCode((req.body as { email: string }).email);
  // Same answer whether or not the address has an account.
  res.json({ ok: true });
});

export const resetPasswordEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as { email: string; code: string; newPassword: string };
  res.json(await authService.resetPasswordWithEmailCode(email, code, newPassword));
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.customer!.sub);
  if (!customer) throw ApiError.notFound("Account not found");
  res.json({ user: serializeCustomer(customer) });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.customer!.sub);
  if (!customer) throw ApiError.notFound("Account not found");

  const { name, email, phone, address, notificationPreferences, languagePreference } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    notificationPreferences?: Partial<typeof customer.notificationPreferences>;
    languagePreference?: string;
  };

  if (email && email.toLowerCase() !== customer.email) {
    const existing = await Customer.findOne({ email: email.toLowerCase() });
    if (existing) throw ApiError.conflict("An account with this email already exists");
    customer.email = email.toLowerCase();
  }
  if (name) customer.name = name;
  // A blank field means "no value", not the empty string: phone has a unique
  // index, and storing "" for one customer would make every later customer
  // who saves their profile without a number collide with it.
  if (phone !== undefined) {
    const nextPhone = phone.trim() || undefined;
    if (nextPhone && nextPhone !== customer.phone) {
      const taken = await Customer.findOne({ phone: { $in: phoneVariants(nextPhone) }, _id: { $ne: customer._id } });
      if (taken) throw ApiError.conflict("An account with this mobile number already exists");
    }
    customer.phone = nextPhone;
  }
  if (address !== undefined) customer.address = address.trim() || undefined;
  if (notificationPreferences) {
    Object.assign(customer.notificationPreferences, notificationPreferences);
    customer.markModified("notificationPreferences");
  }
  if (languagePreference) customer.languagePreference = languagePreference;

  await customer.save();
  res.json({ user: serializeCustomer(customer) });
});

export const updatePhoto = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.customer!.sub);
  if (!customer) throw ApiError.notFound("Account not found");
  if (!req.file) throw ApiError.badRequest("No image uploaded");

  const previousKey = customer.avatar;
  const stored = await s3Adapter.save("avatars", req.file.path, req.file.originalname);
  customer.avatar = stored.key;
  await customer.save();

  // Best-effort cleanup of the old object after the new one is committed.
  if (previousKey) await s3Adapter.remove(previousKey).catch(() => undefined);

  res.json({ user: serializeCustomer(customer) });
});
