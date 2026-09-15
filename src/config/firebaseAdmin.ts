import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { env } from "./env.js";
import { ApiError } from "../utils/ApiError.js";

/** Lazily initialized so a missing/unset key doesn't crash the whole server at boot. */
export function getFirebaseAuth() {
  if (!env.FIREBASE_SERVICE_ACCOUNT_B64) {
    throw ApiError.badRequest("Phone sign-in isn't configured on this server yet");
  }
  if (getApps().length === 0) {
    const json = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8");
    initializeApp({ credential: cert(JSON.parse(json)) });
  }
  return getAuth();
}
