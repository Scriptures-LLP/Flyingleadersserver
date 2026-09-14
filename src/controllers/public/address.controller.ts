import type { Request, Response } from "express";

import { Address } from "../../models/Address.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await Address.find({ customerId: req.customer!.sub }).sort({ isDefault: -1, createdAt: -1 });
  res.json({ items: addresses });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.customer!.sub;
  if (req.body.isDefault) {
    await Address.updateMany({ customerId }, { isDefault: false });
  }
  const isFirst = (await Address.countDocuments({ customerId })) === 0;
  const address = await Address.create({ ...req.body, customerId, isDefault: req.body.isDefault || isFirst });
  res.status(201).json({ item: address });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.customer!.sub;
  const address = await Address.findOne({ _id: req.params.id, customerId });
  if (!address) throw ApiError.notFound("Address not found");

  if (req.body.isDefault) {
    await Address.updateMany({ customerId }, { isDefault: false });
  }
  Object.assign(address, req.body);
  await address.save();
  res.json({ item: address });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const address = await Address.findOneAndDelete({ _id: req.params.id, customerId: req.customer!.sub });
  if (!address) throw ApiError.notFound("Address not found");
  res.status(204).send();
});
