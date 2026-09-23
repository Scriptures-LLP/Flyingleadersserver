import type { Request, Response } from "express";

import { Customer, type CustomerDoc } from "../../models/Customer.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

function serializeForAdmin(customer: CustomerDoc) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    authProvider: customer.authProvider,
    isActive: customer.isActive,
    createdAt: (customer as unknown as { createdAt: Date }).createdAt,
  };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  const filter = search
    ? { $or: [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }, { phone: new RegExp(search, "i") }] }
    : {};
  const customers = await Customer.find(filter).sort({ createdAt: -1 });
  res.json({ items: customers.map(serializeForAdmin) });
});

export const setActive = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };
  const customer = await Customer.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
  if (!customer) throw ApiError.notFound("Customer not found");
  res.json({ item: serializeForAdmin(customer) });
});
