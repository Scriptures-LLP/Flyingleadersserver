import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { Airport } from "../src/models/Airport.js";
import { Category } from "../src/models/Category.js";
import { Country } from "../src/models/Country.js";
import { Tour } from "../src/models/Tour.js";

/** Creates the doc via `create()` (so slug-generation hooks run) only if one matching `match` doesn't already exist. */
async function findOrCreate<T>(model: any, match: Record<string, unknown>, data: T) {
  const existing = await model.findOne(match);
  if (existing) return existing;
  return model.create(data);
}

async function seed() {
  await connectDB();

  const adminEmail = env.SEED_ADMIN_EMAIL ?? "admin@flyingleader.com";
  const adminPassword = env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

  const existingAdmin = await AdminUser.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await AdminUser.create({
      name: "Admin",
      email: adminEmail,
      passwordHash: await AdminUser.hashPassword(adminPassword),
      role: "admin",
    });
    console.log(`[seed] created admin user: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`[seed] admin user already exists: ${adminEmail}`);
  }

  const existingManager = await AdminUser.findOne({ email: "manager@flyingleader.com" });
  if (!existingManager) {
    await AdminUser.create({
      name: "Sample Manager",
      email: "manager@flyingleader.com",
      passwordHash: await AdminUser.hashPassword("ChangeMe!2026"),
      role: "manager",
    });
    console.log("[seed] created manager user: manager@flyingleader.com / ChangeMe!2026");
  }

  const categoryDefs = [
    { label: "Beach" },
    { label: "Mountains" },
    { label: "City Break" },
    { label: "Heritage" },
  ];
  for (const def of categoryDefs) {
    await findOrCreate(Category, { label: def.label }, def);
  }
  console.log(`[seed] ensured ${categoryDefs.length} categories`);

  const countryDefs = [{ name: "Indonesia" }, { name: "Thailand" }, { name: "United Arab Emirates" }];
  const countries: Record<string, string> = {};
  for (const def of countryDefs) {
    const doc = await findOrCreate(Country, { name: def.name }, def);
    countries[def.name] = doc.id;
  }
  console.log(`[seed] ensured ${countryDefs.length} countries`);

  const airportDefs = [
    { code: "DEL", name: "Delhi (Indira Gandhi Intl)" },
    { code: "BOM", name: "Mumbai (Chhatrapati Shivaji Intl)" },
  ];
  for (const def of airportDefs) {
    await findOrCreate(Airport, { code: def.code }, def);
  }
  console.log(`[seed] ensured ${airportDefs.length} airports`);

  const tourDefs = [
    {
      title: "Bali Bliss",
      shortDesc: "Temples, rice terraces & beach days across the island of gods.",
      fullDesc:
        "Discover the island of gods on this curated 6-day escape — Ubud's rice terraces, the lakeside Ulun Danu Beratan temple, and golden Seminyak sunsets.",
      location: "Bali, Indonesia",
      duration: "6 Days",
      category: "beach",
      countryId: countries["Indonesia"],
      price: 59000,
      groupSizeLabel: "Up to 12",
      hotelClassLabel: "4★ Hotels",
      showFlightDetails: true,
      rating: 4.9,
    },
    {
      title: "Phuket & Krabi Escape",
      shortDesc: "Island hopping, longtail boats and limestone cliffs.",
      fullDesc:
        "Two of Thailand's finest beach destinations in one trip — Phuket's buzzing shores and Krabi's dramatic limestone karsts.",
      location: "Thailand",
      duration: "5 Days",
      category: "beach",
      countryId: countries["Thailand"],
      price: 49000,
      groupSizeLabel: "Up to 15",
      hotelClassLabel: "4★ Hotels",
      showFlightDetails: true,
      rating: 4.8,
    },
    {
      title: "Dubai Luxe",
      shortDesc: "Skyline, desert safari and luxury shopping.",
      fullDesc:
        "Experience Dubai in style — Burj Khalifa, a dune desert safari with BBQ dinner, a dhow cruise, and time at the world's grandest malls.",
      location: "Dubai, UAE",
      duration: "5 Days",
      category: "city",
      countryId: countries["United Arab Emirates"],
      price: 85000,
      groupSizeLabel: "Up to 10",
      hotelClassLabel: "5★ Hotels",
      showFlightDetails: true,
      rating: 4.8,
    },
  ];

  for (const def of tourDefs) {
    await findOrCreate(Tour, { title: def.title }, def);
  }
  console.log(`[seed] ensured ${tourDefs.length} tours`);

  await disconnectDB();
  console.log("[seed] done");
}

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
