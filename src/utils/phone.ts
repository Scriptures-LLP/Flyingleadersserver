/**
 * Customer phone numbers are stored in whatever form they arrived in: the
 * app's OTP sign-in stores Firebase's E.164 form ("+919876543210") while an
 * account created by typing a number in has "9876543210". They're the same
 * person, so every lookup has to match all the common spellings of the one
 * number — otherwise signing in by OTP silently creates a second account, and
 * password recovery can't find the first.
 *
 * The app is India-only (+91 everywhere), so a 10-digit national number is
 * expanded with the +91 / 91 prefixes. Anything that isn't recognisably a
 * 10-digit number is matched exactly as given.
 */
export function phoneVariants(phone: string): string[] {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  const national = digits.length >= 10 ? digits.slice(-10) : "";
  if (!national) return [trimmed];
  return [...new Set([trimmed, national, `91${national}`, `+91${national}`])];
}
