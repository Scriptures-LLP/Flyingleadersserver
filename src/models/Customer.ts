import bcrypt from "bcryptjs";
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

import { env } from "../config/env.js";

export interface ICustomer {
  name: string;
  email: string;
  phone?: string;
  phoneCode?: string;
  passwordHash?: string;
  authProvider: "password" | "google";
  googleId?: string;
  isActive: boolean;
  notificationPreferences: {
    bookingUpdates: boolean;
    promotions: boolean;
    tripReminders: boolean;
  };
  languagePreference: string;
}

interface CustomerMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type CustomerModel = Model<ICustomer, object, CustomerMethods> & {
  hashPassword(plain: string): Promise<string>;
};

const customerSchema = new Schema<ICustomer, CustomerModel, CustomerMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    phoneCode: { type: String, trim: true },
    passwordHash: { type: String },
    authProvider: { type: String, enum: ["password", "google"], default: "password" },
    googleId: { type: String },
    isActive: { type: Boolean, default: true },
    notificationPreferences: {
      bookingUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      tripReminders: { type: Boolean, default: true },
    },
    languagePreference: { type: String, default: "en" },
  },
  { timestamps: true },
);

customerSchema.method("comparePassword", function comparePassword(candidate: string) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.passwordHash);
});

customerSchema.static("hashPassword", function hashPassword(plain: string) {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
});

export type CustomerDoc = HydratedDocument<ICustomer, CustomerMethods>;

export const Customer = model<ICustomer, CustomerModel>("Customer", customerSchema);
