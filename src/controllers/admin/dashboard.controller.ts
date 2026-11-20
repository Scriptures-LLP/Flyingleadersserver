import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";

import { AppDevice } from "../../models/AppDevice.js";
import { AppEvent } from "../../models/AppEvent.js";
import { Booking } from "../../models/Booking.js";
import { Country } from "../../models/Country.js";
import { Customer } from "../../models/Customer.js";
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

// The last `n` IST calendar days as YYYY-MM-DD, oldest first — the x-axis of the
// app activity chart. Built from IST so a day boundary matches when the
// business (and AppEvent.day) considers the day to have rolled over.
function recentIstDays(n: number, now = new Date()): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(todayIsoDateIst(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return days;
}

const ACTIVITY_DAYS = 14;

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

  // The legacy MySQL (website bookings + traffic_hits) is an OPTIONAL, external
  // data source: it lives on a separate box that can be down, unreachable
  // (ECONNREFUSED), or missing the analytics tables. A failure there must never
  // take down the whole admin dashboard — the Mongo-backed data (app bookings,
  // tours, revenue) is the primary store and always has to render. So the
  // entire MySQL section is best-effort: on any error we log and fall back to
  // zeros rather than letting asyncHandler turn it into a 500.
  if (pool) {
    try {
      const [countRows] = await pool.query<(RowDataPacket & { c: number })[]>("SELECT COUNT(*) c FROM bookings");
      mysqlBookingsAllTime = countRows[0]?.c ?? 0;

      const [rangedRows] = await pool.query<WebsiteBookingRow[]>(
        since ? `${BASE_QUERY} WHERE b.created_at >= ? ORDER BY b.created_at DESC` : `${BASE_QUERY} ORDER BY b.created_at DESC`,
        since ? [since] : [],
      );
      const rangedSummaries = rangedRows.map(toSummary);
      mysqlRevenue = rangedSummaries.filter((b) => b.status === "Paid").reduce((sum, b) => sum + b.amount, 0);
      mysqlRecent = rangedSummaries.slice(0, 50).map((b) => ({
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
    } catch (err) {
      console.warn("[dashboard] legacy MySQL unavailable, serving website/traffic stats as 0:", (err as Error).message || err);
    }
  }

  const mongoQuery = since ? { createdAt: { $gte: since } } : {};
  // Pull up to 50 so the admin can paginate the App Bookings table (6/page)
  // without a round-trip per page.
  const mongoBookings = await Booking.find(mongoQuery)
    .populate<{ tourId: { title: string } | null }>("tourId", "title")
    .sort({ createdAt: -1 })
    .limit(50)
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

  // Merged feed kept for backward compatibility; the UI now reads the split
  // app/website lists below instead.
  const recentBookings = [...mongoRecent, ...mysqlRecent]
    .sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime())
    .slice(0, 10);

  // ---- App analytics (user activity on the Flying Leader mobile app) --------
  const days = recentIstDays(ACTIVITY_DAYS, now);
  const [
    downloads,
    newInstalls,
    activeViewers,
    rangeSessions,
    rangeScreenViews,
    registeredUsers,
    newUsers,
    appBookingsInRange,
    platformRows,
    topScreenRows,
    activityRows,
    installsRows,
  ] = await Promise.all([
    AppDevice.countDocuments(),
    AppDevice.countDocuments(since ? { firstSeenAt: { $gte: since } } : {}),
    AppDevice.countDocuments(since ? { lastSeenAt: { $gte: since } } : {}),
    AppEvent.countDocuments({ type: "app_open", ...(since ? { createdAt: { $gte: since } } : {}) }),
    AppEvent.countDocuments({ type: "screen_view", ...(since ? { createdAt: { $gte: since } } : {}) }),
    Customer.countDocuments(),
    Customer.countDocuments(since ? { createdAt: { $gte: since } } : {}),
    Booking.countDocuments(mongoQuery),
    AppDevice.aggregate<{ _id: string | null; count: number }>([
      { $group: { _id: "$platform", count: { $sum: 1 } } },
    ]),
    AppEvent.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          type: { $in: ["screen_view", "tour_view"] },
          screen: { $nin: [null, ""] },
          ...(since ? { createdAt: { $gte: since } } : {}),
        },
      },
      { $group: { _id: "$screen", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    AppEvent.aggregate<{ _id: string; sessions: number; screenViews: number; devices: string[] }>([
      { $match: { day: { $in: days } } },
      {
        $group: {
          _id: "$day",
          sessions: { $sum: { $cond: [{ $eq: ["$type", "app_open"] }, 1, 0] } },
          screenViews: { $sum: { $cond: [{ $eq: ["$type", "screen_view"] }, 1, 0] } },
          devices: { $addToSet: "$deviceId" },
        },
      },
    ]),
    // Installs/day over the window — firstSeenAt bucketed to its IST calendar
    // day, so the dashboard can chart a downloads trend, not just a total.
    AppDevice.aggregate<{ _id: string; count: number }>([
      { $match: { firstSeenAt: { $gte: new Date(now.getTime() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { date: "$firstSeenAt", format: "%Y-%m-%d", timezone: "+05:30" } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const activityByDay = new Map(activityRows.map((r) => [r._id, r]));
  const installsByDay = new Map(installsRows.map((r) => [r._id, r.count]));
  const activity = days.map((day) => {
    const row = activityByDay.get(day);
    return {
      day,
      sessions: row?.sessions ?? 0,
      screenViews: row?.screenViews ?? 0,
      viewers: row?.devices.length ?? 0,
      installs: installsByDay.get(day) ?? 0,
    };
  });

  const platforms = { android: 0, ios: 0, web: 0 } as Record<"android" | "ios" | "web", number>;
  for (const row of platformRows) {
    if (row._id && row._id in platforms) platforms[row._id as keyof typeof platforms] = row.count;
  }

  const topScreens = topScreenRows.map((r) => ({ screen: r._id, count: r.count }));

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
    // Website (legacy MySQL) bookings, split out from the app.
    website: {
      bookingsAllTime: mysqlBookingsAllTime,
      revenue: round2(mysqlRevenue),
      recentBookings: mysqlRecent,
    },
    // Flying Leader app: bookings + revenue + install/engagement analytics.
    app: {
      bookingsAllTime: mongoBookingsAllTime,
      bookingsInRange: appBookingsInRange,
      revenue: round2(mongoRevenue),
      downloads,
      newInstalls,
      activeViewers,
      sessions: rangeSessions,
      screenViews: rangeScreenViews,
      registeredUsers,
      newUsers,
      platforms,
      topScreens,
      activity,
      recentBookings: mongoRecent,
    },
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
