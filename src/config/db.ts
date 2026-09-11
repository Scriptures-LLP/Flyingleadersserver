import mongoose from "mongoose";

import { env } from "./env.js";

const GUARDED_DB_NAMES = new Set(["bidready", "newleeybackups", "sample_mflix", "admin", "local"]);

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);

  const dbName = new URL(env.MONGO_URI.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"))
    .pathname.replace(/^\//, "");

  if (GUARDED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to connect: "${dbName}" is an existing database on this cluster unrelated to Flying Leader. ` +
        `Point MONGO_URI at a dedicated database name (e.g. flying_leader_dev).`,
    );
  }

  await mongoose.connect(env.MONGO_URI);
  console.log(`[db] connected to MongoDB database "${dbName || mongoose.connection.name}"`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
