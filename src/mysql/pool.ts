import mysql from "mysql2/promise";

import { env } from "../config/env.js";

let pool: mysql.Pool | null = null;

/** Returns the shared MySQL pool, or null if sync is disabled (MYSQL_SYNC_ENABLED=false). */
export function getMysqlPool(): mysql.Pool | null {
  if (!env.MYSQL_SYNC_ENABLED) return null;

  if (!pool) {
    pool = mysql.createPool({
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }

  return pool;
}
