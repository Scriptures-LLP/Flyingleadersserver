import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";

import { Booking } from "../../models/Booking.js";
import { Country } from "../../models/Country.js";
import { Tour } from "../../models/Tour.js";
import { getMysqlPool } from "../../mysql/pool.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { BASE_QUERY, toSummary, type WebsiteBookingRow } from "./websiteBooking.controller.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// India has no DST, so a fixed +5:30 offset is all that's needed to turn "now"
// into the start of today in IST -- the business's own calendar day, not UTC's.
function startOfTodayIst(now = new Date()): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  istNow.setUTCHours(0, 0, 0, 0);
  return new Date(istNow.getTime() - IST_OFFSET_MS);
}

function todayIsoDateIst(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

type Range = "today" | "7d" | "30d" | "all";
const RANGE_LABEL: Record<Range, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };

// Mirrors the legacy admin's own range tabs: "today" is calendar-day-aligned
// (IST), 7d/30d are rolling windows from now, "all" has no lower bound.
function rangeStart(range: Range, now = new Date()): Date | null {
  if (range === "today") return startOfTodayIst(now);
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

type RecentBooking = {
  _id: string;
  source: "app" | "website";
  ref: string | number;
  name: string;
  phone: string;
  tourTitle: string;
  travellers: number;
  bookedAt: Date;
  amount: number;
  status: "Paid" | "Pending";
};

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const range: Range = ["today", "7d", "30d", "all"].includes(String(req.query.range)) ? (req.query.range as Range) : "today";
  const since = rangeStart(range);
  const now = new Date();

  const [totalTours, activeTours, countries, mongoBookingsAllTime] = await Promise.all([
    Tour.countDocuments(),
    Tour.countDocuments({ isActive: true }),
    Country.countDocuments(),
    Booking.countDocuments(),
  ]);

  const pool = getMysqlPool();

  let mysqlBookingsAllTime = 0;
  let mysqlRevenue = 0;
  let mysqlRecent: RecentBooking[] = [];
  let totalHits = 0;
  let totalUniques = 0;
  let todayHits = 0;
  let todayUniques = 0;

  if (pool) {
    const [countRows] = await pool.query<(RowDataPacket & { c: number })[]>("SELECT COUNT(*) c FROM bookings");
    mysqlBookingsAllTime = countRows[0]?.c ?? 0;

    const [rangedRows] = await pool.query<WebsiteBookingRow[]>(
      since ? `${BASE_QUERY} WHERE b.created_at >= ? ORDER BY b.created_at DESC` : `${BASE_QUERY} ORDER BY b.created_at DESC`,
      since ? [since] : [],
    );
    const rangedSummaries = rangedRows.map(toSummary);
    mysqlRevenue = rangedSummaries.filter((b) => b.status === "Paid").reduce((sum, b) => sum + b.amount, 0);
    mysqlRecent = rangedSummaries.slice(0, 10).map((b) => ({
      _id: b._id,
      source: "website",
      ref: b.ref,
      name: b.name,
      phone: b.phone,
      tourTitle: b.tourTitle,
      travellers: b.travellers,
      bookedAt: new Date(b.bookedAt),
      amount: b.amount,
      status: b.status as "Paid" | "Pending",
    }));

    const todayIso = todayIsoDateIst(now);
    const [hitsRows] = await pool.query<(RowDataPacket & { c: number })[]>("SELECT COUNT(*) c FROM traffic_hits");
    const [uniquesRows] = await pool.query<(RowDataPacket & { c: number })[]>(
      "SELECT COUNT(DISTINCT ip_hash) c FROM traffic_hits",
    );
    const [todayHitsRows] = await pool.query<(RowDataPacket & { c: number })[]>(
      "SELECT COUNT(*) c FROM traffic_hits WHERE day = ?",
      [todayIso],
    );
    const [todayUniquesRows] = await pool.query<(RowDataPacket & { c: number })[]>(
      "SELECT COUNT(DISTINCT ip_hash) c FROM traffic_hits WHERE day = ?",
      [todayIso],
    );
    totalHits = hitsRows[0]?.c ?? 0;
    totalUniques = uniquesRows[0]?.c ?? 0;
    todayHits = todayHitsRows[0]?.c ?? 0;
    todayUniques = todayUniquesRows[0]?.c ?? 0;
  }

  const mongoQuery = since ? { createdAt: { $gte: since } } : {};
  const mongoBookings = await Booking.find(mongoQuery)
    .populate<{ tourId: { title: string } | null }>("tourId", "title")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const mongoPaidTotal = await Booking.aggregate<{ _id: null; total: number }>([
    { $match: { paymentStatus: "paid", ...mongoQuery } },
    { $group: { _id: null, total: { $sum: "$amountPaid" } } },
  ]);
  const mongoRevenue = mongoPaidTotal[0]?.total ?? 0;

  const mongoRecent: RecentBooking[] = mongoBookings.map((b) => ({
    _id: String(b._id),
    source: "app",
    ref: b.bookingRef,
    name: b.contactName,
    phone: b.contactPhone,
    tourTitle: (b.tourId as { title?: string } | null)?.title ?? "—",
    travellers: b.travellers?.length ?? 0,
    bookedAt: b.createdAt as Date,
    amount: b.paymentStatus === "paid" ? b.amountPaid : b.pricing.finalAmount,
    status: b.paymentStatus === "paid" ? "Paid" : "Pending",
  }));

  const recentBookings = [...mongoRecent, ...mysqlRecent]
    .sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime())
    .slice(0, 10);

  res.json({
    range,
    rangeLabel: RANGE_LABEL[range],
    totalTours,
    activeTours,
    countries,
    bookingsAllTime: mongoBookingsAllTime + mysqlBookingsAllTime,
    revenuePaid: round2(mongoRevenue + mysqlRevenue),
    recentBookings,
    traffic: { totalHits, totalUniques, todayHits, todayUniques },
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
