import bcrypt from "bcryptjs";
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

import { env } from "../config/env.js";

export interface IAdminUser {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "manager";
  isActive: boolean;
  lastLoginAt?: Date;
}

interface AdminUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type AdminUserModel = Model<IAdminUser, object, AdminUserMethods> & {
  hashPassword(plain: string): Promise<string>;
};

const adminUserSchema = new Schema<IAdminUser, AdminUserModel, AdminUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "manager"], required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

adminUserSchema.method("comparePassword", function comparePassword(candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash);
});

adminUserSchema.static("hashPassword", function hashPassword(plain: string) {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
});

export type AdminUserDoc = HydratedDocument<IAdminUser, AdminUserMethods>;

export const AdminUser = model<IAdminUser, AdminUserModel>("AdminUser", adminUserSchema);
