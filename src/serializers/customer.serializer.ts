import type { CustomerDoc } from "../models/Customer.js";
import { s3Adapter } from "../storage/s3Adapter.js";

/**
 * Public-facing shape of a customer, shared by the auth session (login/signup)
 * and the profile endpoints so the client always receives a consistent user.
 * `avatar` is resolved from its stored key to a fully-qualified URL.
 */
export function serializeCustomer(customer: CustomerDoc) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    avatar: customer.avatar ? s3Adapter.urlFor(customer.avatar) : null,
    notificationPreferences: customer.notificationPreferences,
    languagePreference: customer.languagePreference,
  };
}
