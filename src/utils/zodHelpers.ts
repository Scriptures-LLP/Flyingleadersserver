import { z } from "zod";

// z.coerce.boolean() runs JS `Boolean(value)`, so the *string* "false" (what
// FormData and process.env always give you) comes out `true`. This is the
// safe replacement: real booleans pass through, "true"/"1" and "false"/"0"
// strings map to their obvious value, anything else fails validation instead
// of silently doing the wrong thing.
export const zStrictBoolean = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return v;
}, z.boolean());
