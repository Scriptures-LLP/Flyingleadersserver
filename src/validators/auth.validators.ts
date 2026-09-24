import { z } from "zod";

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone: z.string().trim().min(7).optional(),
    phoneCode: z.string().trim().optional(),
    referralCode: z.string().trim().optional(),
  })
  .refine((v) => !!v.email || !!v.phone, {
    message: "Provide an email address or mobile number",
    path: ["email"],
  });

export const loginSchema = z.object({
  // Either an email address or a mobile number — auth.service.ts tells them apart.
  identifier: z.string().trim().min(1, "Email or mobile number is required"),
  password: z.string().min(1, "Password is required"),
});

export const phoneVerifySchema = z.object({
  idToken: z.string().min(1),
  name: z.string().trim().optional(),
});

export const resetPasswordSchema = z.object({
  idToken: z.string().min(1),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const resetPasswordEmailSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

const otpPhone = z.string().trim().min(10, "Enter a valid mobile number").max(20);
const otpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const otpSendSchema = z.object({ phone: otpPhone, purpose: z.enum(["login", "reset"]).default("login") });
export const otpVerifySchema = z.object({
  phone: otpPhone,
  code: otpCode,
  name: z.string().trim().max(80).optional(),
  // Optional: only used when this sign-in creates a new account.
  referralCode: z.string().trim().max(40).optional(),
});
export const otpVerifyResetSchema = z.object({ phone: otpPhone, code: otpCode });
export const resetWithTokenSchema = z.object({
  resetToken: z.string().min(10),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required"),
});
