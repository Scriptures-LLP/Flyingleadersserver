// One-time backfill after adding is_active/applies_to_* columns to the legacy
// tour_airport_prices / tour_airport_custom_dates / tour_travel_dates tables:
// every TourAirportPrice/TourDate row that synced successfully *before* this
// migration has those columns sitting at their DEFAULT 1, which may not match
// what's actually set in Mongo. This force-resyncs every row (regardless of
// its recorded mysqlSync status) through the now-fixed sync functions.
import { connectDB, disconnectDB } from "../src/config/db.js";
import { TourAirportPrice } from "../src/models/TourAirportPrice.js";
import { TourDate } from "../src/models/TourDate.js";
import { syncTourAirportPriceUpsert } from "../src/mysql/sync/tourAirportPriceSync.js";
import { syncTourDateUpsert } from "../src/mysql/sync/tourDateSync.js";
import { runMysqlSync } from "../src/mysql/syncStatus.js";

async function main() {
  await connectDB();

  console.log("=== Tour airport prices ===");
  const prices = await TourAirportPrice.find({});
  let ok = 0;
  let fail = 0;
  for (const doc of prices) {
    await runMysqlSync(TourAirportPrice, doc, () => syncTourAirportPriceUpsert(doc));
    if (doc.mysqlSync?.status === "synced") ok++;
    else {
      fail++;
      console.log(`  [FAIL] TourAirportPrice ${doc._id}: ${doc.mysqlSync?.lastError}`);
    }
  }
  console.log(`TourAirportPrice: ${ok} synced, ${fail} failed (of ${prices.length})`);

  console.log("=== Tour dates ===");
  const dates = await TourDate.find({});
  ok = 0;
  fail = 0;
  for (const doc of dates) {
    await runMysqlSync(TourDate, doc, () => syncTourDateUpsert(doc));
    if (doc.mysqlSync?.status === "synced") ok++;
    else {
      fail++;
      console.log(`  [FAIL] TourDate ${doc._id}: ${doc.mysqlSync?.lastError}`);
    }
  }
  console.log(`TourDate: ${ok} synced, ${fail} failed (of ${dates.length})`);

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
