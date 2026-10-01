/**
 * One-time (but safe to re-run) migration: pulls the real catalog/content data
 * out of flyingdotcom's production MySQL and into this app's MongoDB, via the
 * same Mongoose models the admin itself uses — so validation, slug generation,
 * etc. all run exactly as they would for a real admin edit.
 *
 * Idempotent: every row is matched by `legacyMysqlId` (upsert, not insert), so
 * running this again after new tours/countries/etc. are added on the live site
 * just picks up the new rows. Never deletes anything.
 *
 * Scope (module E): countries, airports, media_categories, tours, tour_media,
 * tour_airport_custom_dates + tour_travel_dates (→ TourDate), tour_airport_prices,
 * gallery_images, home_covers, settings, promo_codes. Deliberately NOT migrated:
 * bookings, booking_travellers, promo_redemptions, contact_messages/queries,
 * admin_users, managers, traffic_hits, analytics_* — those stay MySQL-only
 * (website) or Mongo-only (app), by design — see the engagement's MySQL-sync
 * decision.
 *
 * MySQL connection here is deliberately separate from src/mysql/pool.ts (the
 * live write-sync pool, driven by .env's MYSQL_HOST/USER/PASSWORD) — this
 * script only ever READS from MySQL, so it takes its own explicit production
 * credentials below rather than touching that pool or its config.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import mongoose from "mongoose";
import mysql from "mysql2/promise";

import { env } from "../src/config/env.js";
import { Airport } from "../src/models/Airport.js";
import { Country } from "../src/models/Country.js";
import { GalleryImage } from "../src/models/GalleryImage.js";
import { HomeCover } from "../src/models/HomeCover.js";
import { MediaCategory } from "../src/models/MediaCategory.js";
import { PromoCode } from "../src/models/PromoCode.js";
import { Setting } from "../src/models/Setting.js";
import { Tour } from "../src/models/Tour.js";
import { TourAirportPrice } from "../src/models/TourAirportPrice.js";
import { TourDate } from "../src/models/TourDate.js";
import { TourMedia } from "../src/models/TourMedia.js";
import { s3Adapter } from "../src/storage/s3Adapter.js";

// ---- MySQL (production, read-only) -----------------------------------------

const FLYINGDOTCOM_CONFIG_PATH = path.resolve(import.meta.dirname, "../../flyingdotcom/inc/config.php");
const FLYINGDOTCOM_ROOT = path.resolve(import.meta.dirname, "../../flyingdotcom");

function phpDefine(text: string, name: string): string {
  const m = text.match(new RegExp(`define\\('${name}',\\s*'([^']*)'\\)`));
  if (!m) throw new Error(`Couldn't find ${name} in config.php`);
  return m[1] ?? "";
}

const configPhp = fs.readFileSync(FLYINGDOTCOM_CONFIG_PATH, "utf8");
const DB_NAME = phpDefine(configPhp, "DB_NAME");
const DB_USER = phpDefine(configPhp, "DB_USER");
const DB_PASS = phpDefine(configPhp, "DB_PASS");
const MYSQL_HOST = "srv742.hstgr.io";
const MYSQL_PORT = 3306;

const DRY_RUN = process.argv.includes("--dry-run");

let created = 0;
let updated = 0;
let skipped = 0;
const warnings: string[] = [];

function warn(msg: string) {
  warnings.push(msg);
  console.warn(`  ! ${msg}`);
}

async function columnsOf(conn: mysql.Pool, table: string): Promise<Set<string>> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map((r) => r.Field as string));
}

function pick(columns: Set<string>, ...candidates: string[]): string | null {
  return candidates.find((c) => columns.has(c)) ?? null;
}

/** Finds a legacy image file on disk (from the handed-over flyingdotcom checkout) and
 * uploads it to S3 under the same folder/field convention the admin itself uses.
 * Returns null (and warns) rather than throwing if the file isn't present locally —
 * a missing image should never fail the whole migration. */
async function migrateImage(relPath: string, folder: string, label: string): Promise<string | null> {
  const absPath = path.join(FLYINGDOTCOM_ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    warn(`${label}: image file not found locally at ${relPath} — skipped, leaving this record without an image`);
    return null;
  }
  if (DRY_RUN) return `[dry-run] would upload ${relPath}`;
  // s3Adapter.save() deletes its source file after upload (correct for its
  // normal caller — a multer temp-upload file). absPath here is the permanent
  // handed-over flyingdotcom copy, not a temp file, so it's never passed
  // directly — a throwaway copy is uploaded (and deleted) instead, leaving the
  // real local file untouched for next time.
  const tmpPath = path.join(os.tmpdir(), `migrate-${Date.now()}-${path.basename(absPath)}`);
  await fs.promises.copyFile(absPath, tmpPath);
  const stored = await s3Adapter.save(folder, tmpPath, path.basename(absPath));
  return stored.key;
}

async function main() {
  console.log(`Connecting to MySQL ${MYSQL_HOST}:${MYSQL_PORT}/${DB_NAME} (read-only)...`);
  // A pool, not a single connection — this script runs long enough (thousands
  // of per-row round trips, interleaved with Mongo writes) that a single
  // connection's idle/wait_timeout can close it mid-run; the pool opens a
  // fresh connection transparently whenever that happens.
  const conn = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASS,
    dateStrings: true,
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  await conn.query("SELECT 1");
  console.log("Connected to MySQL.\n");

  console.log(`Connecting to MongoDB (${DRY_RUN ? "dry run — no writes" : "will write"})...`);
  await mongoose.connect(env.MONGO_URI);
  console.log("Connected to MongoDB.\n");

  // ---- countries ----
  console.log("== countries ==");
  {
    const cols = await columnsOf(conn, "countries");
    const nameCol = pick(cols, "title", "name") ?? "title";
    const coverCol = pick(cols, "cover_image", "image", "cover");
    const activeCol = pick(cols, "is_active", "active", "status");
    console.log(`  columns detected: name=${nameCol}, cover=${coverCol}, active=${activeCol}`);

    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM countries");
    for (const row of rows) {
      const existing = await Country.findOne({ legacyMysqlId: row.id });
      let coverImage: string | undefined = existing?.coverImage ?? undefined;
      if (coverCol && row[coverCol]) {
        const key = await migrateImage(`admin/uploads/countries/${row[coverCol]}`, "countries", `country #${row.id}`);
        if (key) coverImage = key;
      }
      const doc = {
        legacyMysqlId: row.id,
        name: row[nameCol],
        coverImage,
        isActive: activeCol ? !!row[activeCol] : true,
        sortOrder: row.sort_order ?? 0,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} country "${doc.name}" (legacy id ${row.id})`);
        continue;
      }
      if (existing) {
        await Country.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await Country.create(doc);
        created++;
      }
    }
    console.log(`  ${rows.length} countries processed.\n`);
  }

  // ---- airports ----
  console.log("== airports ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM airports");
    for (const row of rows) {
      // Airport.code is hard-unique with no auto-dedup (unlike slugs). Code,
      // not legacyMysqlId, is checked FIRST: this database has leftover test
      // airports from earlier manual admin testing whose legacyMysqlId was set
      // against a local test MySQL, not this production one — those numbers
      // can coincidentally collide with a real production id (e.g. a test row
      // sitting on legacyMysqlId=3 while the REAL airport #3 is a different,
      // already-existing code). Trusting legacyMysqlId first would match the
      // wrong document and then collide trying to rename it to the real code.
      const existing = (await Airport.findOne({ code: row.code })) ?? (await Airport.findOne({ legacyMysqlId: row.id }));
      const doc = {
        legacyMysqlId: row.id,
        code: row.code,
        name: row.name,
        isActive: row.is_active === undefined ? true : !!row.is_active,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} airport "${doc.code}" (legacy id ${row.id})`);
        continue;
      }
      if (existing) {
        await Airport.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await Airport.create(doc);
        created++;
      }
    }
    console.log(`  ${rows.length} airports processed.\n`);
  }

  // ---- media_categories ----
  console.log("== media_categories ==");
  {
    const cols = await columnsOf(conn, "media_categories");
    const nameCol = pick(cols, "name", "title") ?? "name";
    const singleCol = pick(cols, "is_single", "single");
    const activeCol = pick(cols, "is_active", "active");
    console.log(`  columns detected: name=${nameCol}, single=${singleCol}, active=${activeCol}`);

    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM media_categories");
    for (const row of rows) {
      const existing = await MediaCategory.findOne({ legacyMysqlId: row.id });
      const doc = {
        legacyMysqlId: row.id,
        name: row[nameCol],
        isSingle: singleCol ? !!row[singleCol] : false,
        sortOrder: row.sort_order ?? 0,
        isActive: activeCol ? !!row[activeCol] : true,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} media category "${doc.name}" (legacy id ${row.id})`);
        continue;
      }
      if (existing) {
        await MediaCategory.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await MediaCategory.create(doc);
        created++;
      }
    }
    console.log(`  ${rows.length} media_categories processed.\n`);
  }

  // ---- tours ----
  console.log("== tours ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM tours");
    for (const row of rows) {
      const existing = await Tour.findOne({ legacyMysqlId: row.id });

      let countryId: mongoose.Types.ObjectId | undefined;
      if (row.country_id) {
        const country = await Country.findOne({ legacyMysqlId: row.country_id }).select("_id");
        if (country) countryId = country._id;
        else warn(`tour #${row.id} "${row.title}": referenced country_id ${row.country_id} not found — left without a country`);
      }

      let coverImage: string | undefined = existing?.coverImage ?? undefined;
      if (row.image) {
        // tours.image already stores the "tours/<file>" legacy value (see
        // imageMirror.ts's legacyValue for "tours") — don't re-prepend "tours/".
        const key = await migrateImage(`storage/${row.image}`, "tours", `tour #${row.id}`);
        if (key) coverImage = key;
      }

      const doc = {
        legacyMysqlId: row.id,
        title: row.title,
        slug: row.slug || undefined,
        shortDesc: row.short_desc ?? undefined,
        fullDesc: row.full_desc ?? undefined,
        location: row.location ?? undefined,
        duration: row.duration ?? undefined,
        countryId,
        price: Number(row.price) || 0,
        priceChild: row.price_child != null ? Number(row.price_child) : undefined,
        priceInfant: row.price_infant != null ? Number(row.price_infant) : undefined,
        tokenAmount: row.token_amount != null ? Number(row.token_amount) : 0,
        allowTokenPayment: !!row.token_amount,
        coverImage,
        itinerary: row.itinerary ?? undefined,
        inclusions: row.inclusions ?? undefined,
        exclusions: row.exclusions ?? undefined,
        flightDetails: row.flight_details ?? undefined,
        showFlightDetails: !!row.show_flight_details,
        hotelDetails: row.hotel_details ?? undefined,
        showHotelDetails: !!row.show_hotel_details,
        totalSeats: row.total_seats ?? undefined,
        seatsAvailable: row.seats_available ?? undefined,
        seatsRemark: row.seats_remark ?? undefined,
        isActive: row.is_active === undefined ? true : !!row.is_active,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} tour "${doc.title}" (legacy id ${row.id})`);
        continue;
      }
      if (existing) {
        await Tour.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        const t = new Tour(doc);
        await t.save();
        created++;
      }
    }
    console.log(`  ${rows.length} tours processed.\n`);
  }

  // ---- tour_media ----
  console.log("== tour_media ==");
  {
    const cols = await columnsOf(conn, "tour_media");
    const fileCol = pick(cols, "file", "image", "path") ?? "file";
    const catCol = pick(cols, "category_id", "media_category_id");
    const titleCol = pick(cols, "title");
    const altCol = pick(cols, "alt", "alt_text");
    const primaryCol = pick(cols, "is_primary", "primary");
    console.log(`  columns detected: file=${fileCol}, category=${catCol}, title=${titleCol}, alt=${altCol}, primary=${primaryCol}`);

    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM tour_media");
    for (const row of rows) {
      const existing = await TourMedia.findOne({ legacyMysqlId: row.id });

      const tour = await Tour.findOne({ legacyMysqlId: row.tour_id }).select("_id");
      if (!tour) {
        warn(`tour_media #${row.id}: referenced tour_id ${row.tour_id} not found — skipped`);
        skipped++;
        continue;
      }

      let categoryId: mongoose.Types.ObjectId | undefined;
      if (catCol && row[catCol]) {
        const cat = await MediaCategory.findOne({ legacyMysqlId: row[catCol] }).select("_id");
        if (cat) categoryId = cat._id;
      }

      const rawFile = fileCol ? row[fileCol] : null;
      if (!rawFile) {
        warn(`tour_media #${row.id}: no file reference — skipped`);
        skipped++;
        continue;
      }
      // tour_media's file column already includes its "tours/<id>/..." path, same as tours.image.
      const key = await migrateImage(`storage/${rawFile}`, "tourMedia", `tour_media #${row.id}`);
      if (!key) {
        skipped++;
        continue;
      }

      const doc = {
        legacyMysqlId: row.id,
        tourId: tour._id,
        categoryId,
        file: key,
        title: titleCol ? (row[titleCol] ?? undefined) : undefined,
        alt: altCol ? (row[altCol] ?? undefined) : undefined,
        isPrimary: primaryCol ? !!row[primaryCol] : false,
        sortOrder: row.sort_order ?? 0,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} tour_media #${row.id} for tour ${tour._id}`);
        continue;
      }
      if (existing) {
        await TourMedia.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await TourMedia.create(doc);
        created++;
      }
    }
    console.log(`  ${rows.length} tour_media rows processed.\n`);
  }

  // ---- tour dates: tour_airport_custom_dates (airport-specific) ----
  console.log("== tour_airport_custom_dates ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM tour_airport_custom_dates");
    for (const row of rows) {
      const existing = await TourDate.findOne({ legacyMysqlId: row.id, legacySourceTable: "tour_airport_custom_dates" });
      const tour = await Tour.findOne({ legacyMysqlId: row.tour_id }).select("_id");
      const airport = await Airport.findOne({ legacyMysqlId: row.airport_id }).select("_id");
      if (!tour || !airport) {
        warn(`tour_airport_custom_dates #${row.id}: tour or airport not found (tour_id=${row.tour_id}, airport_id=${row.airport_id}) — skipped`);
        skipped++;
        continue;
      }
      const doc = {
        legacyMysqlId: row.id,
        tourId: tour._id,
        airportId: airport._id,
        date: new Date(`${row.travel_date}T00:00:00.000Z`),
        price: Number(row.price) || 0,
        isActive: row.is_active === undefined ? true : !!row.is_active,
        legacySourceTable: "tour_airport_custom_dates" as const,
      };
      if (DRY_RUN) continue;
      if (existing) {
        await TourDate.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await TourDate.create(doc).catch((err) => {
          // The unique (tourId, airportId, date) index can collide with a row
          // already created another way — treat as already-migrated, not fatal.
          warn(`tour_airport_custom_dates #${row.id}: ${err.message}`);
          skipped++;
        });
      }
    }
    console.log(`  ${rows.length} tour_airport_custom_dates rows processed.\n`);
  }

  // ---- tour dates: tour_travel_dates (global fallback) ----
  console.log("== tour_travel_dates ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM tour_travel_dates");
    for (const row of rows) {
      const existing = await TourDate.findOne({ legacyMysqlId: row.id, legacySourceTable: "tour_travel_dates" });
      const tour = await Tour.findOne({ legacyMysqlId: row.tour_id }).select("_id");
      if (!tour) {
        warn(`tour_travel_dates #${row.id}: tour_id ${row.tour_id} not found — skipped`);
        skipped++;
        continue;
      }
      const doc = {
        legacyMysqlId: row.id,
        tourId: tour._id,
        airportId: null,
        date: new Date(`${row.travel_date}T00:00:00.000Z`),
        price: Number(row.price) || 0,
        label: row.label ?? undefined,
        isActive: row.is_active === undefined ? true : !!row.is_active,
        sortOrder: row.sort_order ?? 0,
        legacySourceTable: "tour_travel_dates" as const,
      };
      if (DRY_RUN) continue;
      if (existing) {
        await TourDate.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await TourDate.create(doc).catch((err) => {
          warn(`tour_travel_dates #${row.id}: ${err.message}`);
          skipped++;
        });
      }
    }
    console.log(`  ${rows.length} tour_travel_dates rows processed.\n`);
  }

  // ---- tour_airport_prices ----
  console.log("== tour_airport_prices ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM tour_airport_prices");
    for (const row of rows) {
      const existing = await TourAirportPrice.findOne({ legacyMysqlId: row.id });
      const tour = await Tour.findOne({ legacyMysqlId: row.tour_id }).select("_id");
      const airport = await Airport.findOne({ legacyMysqlId: row.airport_id }).select("_id");
      if (!tour || !airport) {
        warn(`tour_airport_prices #${row.id}: tour or airport not found — skipped`);
        skipped++;
        continue;
      }
      const doc = {
        legacyMysqlId: row.id,
        tourId: tour._id,
        airportId: airport._id,
        addonPrice: Number(row.price) || 0,
        isActive: true,
      };
      if (DRY_RUN) continue;
      if (existing) {
        await TourAirportPrice.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await TourAirportPrice.create(doc).catch((err) => {
          warn(`tour_airport_prices #${row.id}: ${err.message}`);
          skipped++;
        });
      }
    }
    console.log(`  ${rows.length} tour_airport_prices rows processed.\n`);
  }

  // ---- gallery_images ----
  console.log("== gallery_images ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM gallery_images");
    for (const row of rows) {
      const existing = await GalleryImage.findOne({ legacyMysqlId: row.id });
      // legacy value is "uploads/gallery/<file>" (see imageMirror.ts MIRROR_TARGETS.gallery) —
      // strip that prefix back off to get the bare filename on disk.
      const bareFile = String(row.file || "").replace(/^uploads\/gallery\//, "");
      if (!bareFile) {
        warn(`gallery_images #${row.id}: no file — skipped`);
        skipped++;
        continue;
      }
      const key = await migrateImage(`admin/uploads/gallery/${bareFile}`, "gallery", `gallery_images #${row.id}`);
      if (!key) {
        skipped++;
        continue;
      }
      const doc = {
        legacyMysqlId: row.id,
        title: row.title ?? undefined,
        altText: row.alt_text ?? undefined,
        file: key,
        kind: row.kind === "celebration" ? "celebration" : "tour",
        isFeatured: !!row.is_featured,
        isActive: row.is_active === undefined ? true : !!row.is_active,
        sortOrder: row.sort_order ?? 0,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} gallery image "${doc.title ?? bareFile}"`);
        continue;
      }
      if (existing) {
        await GalleryImage.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await GalleryImage.create(doc);
        created++;
      }
    }
    console.log(`  ${rows.length} gallery_images processed.\n`);
  }

  // ---- home_covers ----
  console.log("== home_covers ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM home_covers");
    for (const row of rows) {
      const existing = await HomeCover.findOne({ legacyMysqlId: row.id });
      if (!row.image) {
        warn(`home_covers #${row.id}: no image — skipped`);
        skipped++;
        continue;
      }
      const key = await migrateImage(`admin/uploads/covers/${row.image}`, "covers", `home_covers #${row.id}`);
      if (!key) {
        skipped++;
        continue;
      }
      const doc = {
        legacyMysqlId: row.id,
        image: key,
        title: row.title ?? undefined,
        isActive: row.is_active === undefined ? true : !!row.is_active,
        sortOrder: row.sort_order ?? 0,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} home cover "${doc.title ?? row.image}"`);
        continue;
      }
      if (existing) {
        await HomeCover.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await HomeCover.create(doc);
        created++;
      }
    }
    console.log(`  ${rows.length} home_covers processed.\n`);
  }

  // ---- settings ----
  console.log("== settings ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM settings");
    for (const row of rows) {
      const key = row.k ?? row.key;
      const value = row.v ?? row.value;
      if (!key) continue;
      if (DRY_RUN) {
        console.log(`  [dry-run] upsert setting "${key}"`);
        continue;
      }
      const result = await Setting.updateOne({ key }, { key, value: value ?? "" }, { upsert: true });
      if (result.upsertedCount) created++;
      else updated++;
    }
    console.log(`  ${rows.length} settings processed.\n`);
  }

  // ---- promo_codes ----
  console.log("== promo_codes ==");
  {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM promo_codes");
    for (const row of rows) {
      // PromoCode.code is hard-unique — same code-first matching as airports,
      // for the same reason (a stale legacyMysqlId from earlier local testing
      // can coincidentally collide with a real production id).
      const existing =
        (await PromoCode.findOne({ code: String(row.code).toUpperCase() })) ?? (await PromoCode.findOne({ legacyMysqlId: row.id }));
      let tourId: mongoose.Types.ObjectId | undefined;
      if (row.tour_id) {
        const tour = await Tour.findOne({ legacyMysqlId: row.tour_id }).select("_id");
        if (tour) tourId = tour._id;
        else warn(`promo_codes #${row.id} "${row.code}": referenced tour_id ${row.tour_id} not found`);
      }
      const doc = {
        legacyMysqlId: row.id,
        code: row.code,
        tourId: tourId ?? null,
        type: row.type === "amount" ? "amount" : "percent",
        value: Number(row.value) || 0,
        maxDiscount: row.max_discount != null ? Number(row.max_discount) : undefined,
        minCart: row.min_cart != null ? Number(row.min_cart) : 0,
        usageLimit: row.usage_limit ?? undefined,
        perUserLimit: row.per_user_limit ?? undefined,
        startsAt: row.starts_at ? new Date(row.starts_at.replace(" ", "T") + "Z") : undefined,
        expiresAt: row.expires_at ? new Date(row.expires_at.replace(" ", "T") + "Z") : undefined,
        isActive: row.is_active === undefined ? true : !!row.is_active,
        note: row.note ?? undefined,
      };
      if (DRY_RUN) {
        console.log(`  [dry-run] ${existing ? "update" : "create"} promo code "${doc.code}"`);
        continue;
      }
      if (existing) {
        await PromoCode.updateOne({ _id: existing._id }, doc);
        updated++;
      } else {
        await PromoCode.create(doc).catch((err) => {
          warn(`promo_codes #${row.id} "${row.code}": ${err.message}`);
          skipped++;
        });
      }
    }
    console.log(`  ${rows.length} promo_codes processed.\n`);
  }

  await conn.end();
  await mongoose.disconnect();

  console.log("=".repeat(60));
  console.log(DRY_RUN ? "DRY RUN complete — nothing was written." : "Migration complete.");
  console.log(`Created: ${created}  Updated: ${updated}  Skipped: ${skipped}`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s) — review these, nothing below is fatal:`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
