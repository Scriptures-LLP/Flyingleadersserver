import type { Request, Response } from "express";

import { Customer } from "../../models/Customer.js";
import * as authService from "../../services/auth.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const session = await authService.signupCustomer(req.body);
  res.status(201).json(session);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const session = await authService.loginCustomer(email, password);
  res.json(session);
});

function serializeCustomer(customer: InstanceType<typeof Customer>) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    notificationPreferences: customer.notificationPreferences,
    languagePreference: customer.languagePreference,
  };
}

export const me = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.customer!.sub);
  if (!customer) throw ApiError.notFound("Account not found");
  res.json({ user: serializeCustomer(customer) });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.customer!.sub);
  if (!customer) throw ApiError.notFound("Account not found");

  const { name, notificationPreferences, languagePreference } = req.body as {
    name?: string;
    notificationPreferences?: Partial<typeof customer.notificationPreferences>;
    languagePreference?: string;
  };

  if (name) customer.name = name;
  if (notificationPreferences) {
    Object.assign(customer.notificationPreferences, notificationPreferences);
    customer.markModified("notificationPreferences");
  }
  if (languagePreference) customer.languagePreference = languagePreference;

  await customer.save();
  res.json({ user: serializeCustomer(customer) });
});
