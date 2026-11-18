import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";

import { getMysqlPool } from "../../mysql/pool.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { BASE_QUERY, toSummary, type WebsiteBookingRow } from "./websiteBooking.controller.js";

// Full historical archive of the legacy website's own tables -- unlike the
// "Website Bookings" / "Contact Messages" pages (capped at the latest 500 for
// load time), this is the complete backup the client asked for, read-only.
//
// It must stay a frozen snapshot, not a live mirror: without a cutoff this
// section re-queries the same live tables Website Bookings/Contact Messages
// already show, so brand-new records appeared in both places. Everything
// from before the backup (taken 12 Nov 2026) belongs here; anything created
// since is current/live data and should only show on the live pages.
const BACKUP_SNAPSHOT_CUTOFF = "2026-11-13 00:00:00";

export const bookings = asyncHandler(async (_req: Request, res: Response) => {
  const pool = getMysqlPool();
  if (!pool) {
    res.json({ items: [] });
    return;
  }
  const [rows] = await pool.query<WebsiteBookingRow[]>(
    `${BASE_QUERY} WHERE b.created_at < ? ORDER BY b.created_at DESC`,
    [BACKUP_SNAPSHOT_CUTOFF],
  );
  res.json({ items: rows.map(toSummary) });
});

type BookingTravellerRow = RowDataPacket & {
  id: number;
  booking_id: number;
  name: string;
  type: "adult" | "child" | "infant";
  created_at: Date;
  customer_name: string | null;
  tour_title: string | null;
};

export const bookingTravellers = asyncHandler(async (_req: Request, res: Response) => {
  const pool = getMysqlPool();
  if (!pool) {
    res.json({ items: [] });
    return;
  }
  const [rows] = await pool.query<BookingTravellerRow[]>(
    `
    SELECT bt.id, bt.booking_id, bt.name, bt.type, bt.created_at,
           b.name AS customer_name, t.title AS tour_title
      FROM booking_travellers bt
      LEFT JOIN bookings b ON b.id = bt.booking_id
      LEFT JOIN tours t ON t.id = b.tour_id
     WHERE bt.created_at < ?
     ORDER BY bt.created_at DESC
  `,
    [BACKUP_SNAPSHOT_CUTOFF],
  );
  res.json({
    items: rows.map((r) => ({
      _id: `traveller-${r.id}`,
      bookingRef: r.booking_id,
      name: r.name,
      type: r.type,
      customerName: r.customer_name,
      tourTitle: r.tour_title,
      createdAt: r.created_at,
    })),
  });
});

type ContactMessageRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "seen" | "archived";
  created_at: Date;
};

export const contactMessages = asyncHandler(async (_req: Request, res: Response) => {
  const pool = getMysqlPool();
  if (!pool) {
    res.json({ items: [] });
    return;
  }
  const [rows] = await pool.query<ContactMessageRow[]>(
    "SELECT id, name, email, phone, subject, message, status, created_at FROM contact_messages WHERE created_at < ? ORDER BY created_at DESC",
    [BACKUP_SNAPSHOT_CUTOFF],
  );
  res.json({
    items: rows.map((r) => ({
      _id: `contact-message-${r.id}`,
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

type ContactQueryRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  page_url: string | null;
  status: "new" | "read" | "archived";
  created_at: Date;
};

export const contactQueries = asyncHandler(async (_req: Request, res: Response) => {
  const pool = getMysqlPool();
  if (!pool) {
    res.json({ items: [] });
    return;
  }
  const [rows] = await pool.query<ContactQueryRow[]>(
    "SELECT id, name, email, phone, subject, message, page_url, status, created_at FROM contact_queries WHERE created_at < ? ORDER BY created_at DESC",
    [BACKUP_SNAPSHOT_CUTOFF],
  );
  res.json({
    items: rows.map((r) => ({
      _id: `contact-query-${r.id}`,
      name: r.name,
      email: r.email,
      phone: r.phone,
      subject: r.subject,
      message: r.message,
      pageUrl: r.page_url,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
});
