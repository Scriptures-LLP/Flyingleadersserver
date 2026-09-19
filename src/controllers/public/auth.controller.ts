import type { Request, Response } from "express";

import { Customer } from "../../models/Customer.js";
import { serializeCustomer } from "../../serializers/customer.serializer.js";
import * as authService from "../../services/auth.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
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
  if (phone !== undefined) customer.phone = phone;
  if (address !== undefined) customer.address = address;
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
