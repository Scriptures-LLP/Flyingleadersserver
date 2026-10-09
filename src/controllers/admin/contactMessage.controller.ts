import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";

import { getMysqlPool } from "../../mysql/pool.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

type WebsiteContactRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "seen" | "archived";
  created_at: Date;
};

// The website writes contact_messages in MySQL; this only reads it.
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const pool = getMysqlPool();
  if (!pool) {
    res.json({ items: [] });
    return;
  }

  const [rows] = await pool.query<WebsiteContactRow[]>(
    "SELECT id, name, email, phone, subject, message, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 500",
  );

  res.json({
    items: rows.map((r) => ({
      _id: `website-${r.id}`,
      source: "website",
      name: r.name,
      email: r.email,
      phone: r.phone,
      subject: r.subject,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
});
