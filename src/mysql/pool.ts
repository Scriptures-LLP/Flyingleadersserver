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
      queueLimit: 20,
      connectTimeout: 8000,
      // The legacy site writes/reads every DATETIME under an explicit IST
      // session (flyingdotcom/inc/db.php sets `time_zone = 'Asia/Kolkata'`).
      // mysql2 defaults to the Node process's own OS timezone otherwise, so
      // without this a server not running in IST (the usual case on EC2)
      // reads back the wrong instant, and any value this pool writes back
      // would drift the same way on the PHP side.
      timezone: "+05:30",
    });
  }

  return pool;
}
