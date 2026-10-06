import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";

import { getMysqlPool } from "../../mysql/pool.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

type WebsiteBookingRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  phone: string;
  travel_date: string;
  travellers: number;
  notes: string | null;
  created_at: Date;
  tour_title: string;
  base_price: string;
  airport_code: string | null;
  airport_name: string | null;
  airport_price: string | null;
  custom_date_price: string | null;
  date_price: string | null;
};

// Same rules as the legacy admin dashboard: a booking is Paid when its notes carry a
// payment marker, and its amount is tour price + airport add-on + date price, per traveller.
function isPaid(notes: string | null): boolean {
  const n = notes ?? "";
  return n.includes("[PAID") || n.includes("RZP pid:");
}

function amountFor(r: WebsiteBookingRow): number {
  const base = Number(r.base_price ?? 0);
  const airport = r.airport_price != null ? Number(r.airport_price) : 0;
  const date =
    r.custom_date_price != null
      ? Number(r.custom_date_price)
      : r.date_price != null
        ? Number(r.date_price)
        : 0;
  const travellers = Math.max(0, Number(r.travellers ?? 0));
  return travellers > 0 ? (base + airport + date) * travellers : 0;
}

// The website writes bookings in MySQL; this only reads them.
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const pool = getMysqlPool();
  if (!pool) {
    res.json({ items: [] });
    return;
  }

  const [rows] = await pool.query<WebsiteBookingRow[]>(
    `SELECT b.id, b.name, b.email, b.phone,
            DATE_FORMAT(b.travel_date, '%Y-%m-%d') AS travel_date,
            b.travellers, b.notes, b.created_at,
            t.title AS tour_title, t.price AS base_price,
            a.code AS airport_code, a.name AS airport_name,
            tap.price AS airport_price,
            tacdp.price AS custom_date_price,
            ttd.price AS date_price
       FROM bookings b
       JOIN tours t ON t.id = b.tour_id
       LEFT JOIN airports a ON a.id = b.airport_id
       LEFT JOIN tour_airport_prices tap
              ON tap.tour_id = t.id AND tap.airport_id = b.airport_id
       LEFT JOIN tour_airport_custom_dates tacdp
              ON tacdp.tour_id = t.id AND tacdp.airport_id = b.airport_id
             AND tacdp.travel_date = b.travel_date AND tacdp.is_active = 1
       LEFT JOIN tour_travel_dates ttd
              ON ttd.tour_id = t.id AND ttd.travel_date = b.travel_date
      ORDER BY b.created_at DESC
      LIMIT 500`,
  );

  res.json({
    items: rows.map((r) => ({
      _id: `website-${r.id}`,
      source: "website",
      ref: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      tourTitle: r.tour_title,
      airportCode: r.airport_code,
      airportName: r.airport_name,
      travelDate: r.travel_date,
      travellers: r.travellers,
      bookedAt: r.created_at,
      amount: amountFor(r),
      status: isPaid(r.notes) ? "Paid" : "Pending",
    })),
  });
});
