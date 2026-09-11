import type { Request, Response } from "express";

import { AdminUser } from "../../models/AdminUser.js";
import * as authService from "../../services/auth.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const session = await authService.loginAdmin(email, password);
  res.json(session);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const admin = await AdminUser.findById(req.admin!.sub);
  if (!admin) throw ApiError.notFound("Account not found");
  res.json({ admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
});
