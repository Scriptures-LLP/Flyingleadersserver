import { Booking } from "../models/Booking.js";
import { Category } from "../models/Category.js";
import { Country } from "../models/Country.js";
import { Setting } from "../models/Setting.js";
import { Tour } from "../models/Tour.js";
import { TourDate } from "../models/TourDate.js";
import { htmlToText } from "../utils/htmlText.js";

import { categorizeAge, getAgeCategoryConfig } from "./ageCategory.service.js";
import { computeBaseAmount } from "./pricing.service.js";
import { listTourAirports, listTourDates, type TourAirportOption } from "./tourOptions.service.js";

/**
 * The facts the chat assistant is allowed to state. Every function returns
 * plain JSON built from the live database, so answers about tours, prices,
 * dates and bookings come from the same data (and the same pricing code) the
 * app itself uses — never from the model's memory.
 *
 * Deliberately never returned: airport / travel-date charges. They are already
 * inside each traveller type's price, and customers aren't shown them itemised.
 */

type ToolArgs = Record<string, unknown>;
type ToolContext = { customerId: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
export const inr = (n: number) => `₹${round2(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// ---- catalogue -------------------------------------------------------------

type CatalogTour = {
  tour: Awaited<ReturnType<typeof loadTours>>[number];
  destination: string;
  categories: string[];
};

async function loadTours() {
  return Tour.find({ isActive: true }).lean();
}

async function loadCatalog(): Promise<CatalogTour[]> {
  const [tours, countries, categories] = await Promise.all([loadTours(), Country.find().lean(), Category.find().lean()]);
  const countryName = new Map(countries.map((c) => [String(c._id), c.name]));
  const categoryLabel = new Map(categories.map((c) => [c.slug ?? "", c.label]));
  return tours.map((tour) => ({
    tour,
    destination: countryName.get(String(tour.countryId)) ?? tour.location ?? "",
    categories: [tour.category, tour.category2].filter((s): s is string => !!s).map((s) => categoryLabel.get(s) ?? s),
  }));
}

// Words that carry no meaning when matching a tour — English plus the Hinglish
// customers actually type ("Vietnam ka price kitna hai").
const STOP = new Set(
  (
    "a an the of for to in on at me my i we you is are am be do does can could would please pls tell about what which how much many " +
    "show give get find want need looking suggest recommend any some tour tours package packages trip trips price prices cost costs " +
    "rate details detail info information best good cheap cheapest budget from with and or ka ki ke hai hain kitna kitne batao " +
    "bataiye chahiye mujhe humein hume ek koi kya"
  ).split(" "),
);

const tokenize = (q: string) =>
  q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

function scoreTour(c: CatalogTour, query: string, tokens: string[]): number {
  const title = c.tour.title.toLowerCase();
  const slug = (c.tour.slug ?? "").toLowerCase();
  if (query && (title === query.toLowerCase() || slug === query.toLowerCase())) return 100;
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t) || slug.includes(t)) score += 3;
    if (c.destination.toLowerCase().includes(t)) score += 3;
    if (c.categories.some((x) => x.toLowerCase().includes(t))) score += 2;
    if ((c.tour.location ?? "").toLowerCase().includes(t)) score += 2;
    if ((c.tour.shortDesc ?? "").toLowerCase().includes(t)) score += 1;
  }
  return score;
}

function availability(t: CatalogTour["tour"]): string {
  if (t.seatsRemark === "Sold Out" || t.seatsAvailable === 0) return "Sold out";
  if (t.seatsAvailable != null) return `${t.seatsAvailable} seats left${t.seatsRemark && t.seatsRemark !== "Available" ? ` (${t.seatsRemark})` : ""}`;
  return t.seatsRemark ?? "Available";
}

function summarize(c: CatalogTour) {
  const t = c.tour;
  return {
    name: t.title,
    destination: c.destination || undefined,
    categories: c.categories.length ? c.categories : undefined,
    duration: t.duration || undefined,
    startingPricePerAdult: inr(t.price),
    availability: availability(t),
    rating: t.rating ? `${t.rating}/5` : undefined,
  };
}

/** Resolves free text ("vietnam", "the singapore one") to one tour, or says which are candidates. */
async function resolveTour(query: string): Promise<{ tour: CatalogTour } | { ambiguous: string[] } | { notFound: string[] }> {
  const catalog = await loadCatalog();
  const tokens = tokenize(query);
  const scored = catalog
    .map((c) => ({ c, score: scoreTour(c, query, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { notFound: catalog.map((c) => c.tour.title) };
  const [best, second] = scored;
  if (second && second.score === best!.score && best!.score < 100) {
    return { ambiguous: scored.filter((x) => x.score === best!.score).map((x) => x.c.tour.title) };
  }
  return { tour: best!.c };
}

// ---- departures ------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** The India-time calendar day (YYYY-MM-DD) a stored date falls on — same rule the app uses. */
const dayKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type Departure = { day: string; airports: { id: string; code: string; name: string }[]; rowByAirport: Map<string, string>; anyRowId?: string };

async function loadDepartures(tourId: unknown): Promise<{ departures: Departure[]; tourAirports: TourAirportOption[] }> {
  const tourAirports = await listTourAirports(tourId as never);
  const dates = await listTourDates(tourId as never, tourAirports);
  const byDay = new Map<string, Departure>();
  for (const d of dates) {
    const key = dayKey(d.date);
    const dep: Departure = byDay.get(key) ?? { day: key, airports: [], rowByAirport: new Map(), anyRowId: undefined };
    if (d.airport) {
      if (!dep.rowByAirport.has(d.airport._id)) {
        dep.rowByAirport.set(d.airport._id, d.id);
        dep.airports.push({ id: d.airport._id, code: d.airport.code, name: d.airport.name });
      }
    } else if (!dep.anyRowId) {
      dep.anyRowId = d.id;
    }
    byDay.set(key, dep);
  }
  // A date that isn't tied to an airport works from every airport the tour flies from.
  for (const dep of byDay.values()) {
    if (dep.anyRowId) {
      for (const a of tourAirports) {
        if (!dep.airports.some((x) => x.id === a.id)) dep.airports.push({ id: a.id, code: a.code, name: a.name });
      }
    }
  }
  return { departures: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)), tourAirports };
}

// ---- tools -----------------------------------------------------------------

async function searchTours(args: ToolArgs) {
  const query = str(args.query);
  const maxPrice = num(args.maxPrice);
  const minPrice = num(args.minPrice);
  const tokens = tokenize(query);
  const catalog = await loadCatalog();

  let matches = catalog
    .map((c) => ({ c, score: tokens.length ? scoreTour(c, query, tokens) : 1 }))
    .filter((x) => x.score > 0)
    .filter((x) => (maxPrice === undefined ? true : x.c.tour.price <= maxPrice))
    .filter((x) => (minPrice === undefined ? true : x.c.tour.price >= minPrice))
    .sort((a, b) => b.score - a.score || a.c.tour.price - b.c.tour.price);

  // "cheapest" style questions with no destination: order by price.
  if (!tokens.length) matches = matches.sort((a, b) => a.c.tour.price - b.c.tour.price);

  if (matches.length === 0) {
    return {
      count: 0,
      message: "No tour matches that. These are all the tours currently offered.",
      allTours: catalog.map((c) => ({ name: c.tour.title, destination: c.destination || undefined, startingPricePerAdult: inr(c.tour.price) })),
    };
  }
  return { count: matches.length, tours: matches.slice(0, 8).map((x) => summarize(x.c)) };
}

const ALL_SECTIONS = ["overview", "pricing", "itinerary", "inclusions", "exclusions", "flights_hotels"] as const;
type Section = (typeof ALL_SECTIONS)[number];

async function getTourDetails(args: ToolArgs) {
  const query = str(args.tour);
  if (!query) return { error: "Say which tour." };
  const found = await resolveTour(query);
  if ("ambiguous" in found) return { ambiguous: found.ambiguous, message: "More than one tour matches — ask which one they mean." };
  if ("notFound" in found) return { found: false, message: "No tour by that name.", allTours: found.notFound };

  const requested = Array.isArray(args.sections) ? (args.sections.filter((s) => ALL_SECTIONS.includes(s as Section)) as Section[]) : [];
  const sections = new Set<Section>(requested.length ? requested : ["overview", "pricing"]);
  const { tour: t, destination, categories } = found.tour;
  const out: Record<string, unknown> = { name: t.title };

  if (sections.has("overview")) {
    out.overview = {
      destination: destination || undefined,
      categories: categories.length ? categories : undefined,
      duration: t.duration || undefined,
      groupSize: t.groupSizeLabel || undefined,
      hotelClass: t.hotelClassLabel || undefined,
      rating: t.rating ? `${t.rating}/5${t.ratingCount ? ` from ${t.ratingCount} reviews` : ""}` : undefined,
      availability: availability(t),
      summary: htmlToText(t.shortDesc, 600) || htmlToText(t.fullDesc, 600) || undefined,
    };
  }

  if (sections.has("pricing")) {
    const ageConfig = await getAgeCategoryConfig();
    out.pricing = {
      startingPricePerAdult: inr(t.price),
      pricePerChild: inr(t.priceChild ?? t.price),
      childPriceByAge: t.childPricingTiers?.length
        ? t.childPricingTiers.map((x) => `ages ${x.minAge}–${x.maxAge}: ${inr(x.price)}`)
        : undefined,
      pricePerInfant: (t.priceInfant ?? 0) > 0 ? inr(t.priceInfant ?? 0) : "No charge for the tour itself",
      travellerTypes: `Infant: up to ${ageConfig.infantMaxAge} years, Child: ${ageConfig.infantMaxAge + 1}–${ageConfig.childMaxAge} years, Adult: ${ageConfig.childMaxAge + 1}+ years`,
      partPayment: t.allowTokenPayment && (t.tokenAmount ?? 0) > 0 ? `Can book with a token payment of ${inr(t.tokenAmount ?? 0)}, balance later` : "Full payment at booking",
      note: "These are starting prices. The exact price depends on each traveller's age, the travel date and the departure airport — use get_price_quote for the real figure.",
    };
  }
  if (sections.has("itinerary")) out.itinerary = htmlToText(t.itinerary, 3500) || "Not available";
  if (sections.has("inclusions")) out.inclusions = htmlToText(t.inclusions, 1800) || "Not available";
  if (sections.has("exclusions")) out.exclusions = htmlToText(t.exclusions, 1800) || "Not available";
  if (sections.has("flights_hotels")) {
    out.flights = htmlToText(t.flightDetails, 1200) || "Not available";
    out.hotels = htmlToText(t.hotelDetails, 1200) || "Not available";
  }
  return out;
}

async function getDepartures(args: ToolArgs) {
  const query = str(args.tour);
  if (!query) return { error: "Say which tour." };
  const found = await resolveTour(query);
  if ("ambiguous" in found) return { ambiguous: found.ambiguous, message: "More than one tour matches — ask which one they mean." };
  if ("notFound" in found) return { found: false, message: "No tour by that name.", allTours: found.notFound };

  const { departures, tourAirports } = await loadDepartures(found.tour.tour._id);
  if (departures.length === 0) {
    return {
      tour: found.tour.tour.title,
      fixedDepartures: false,
      message: "No fixed departure dates are set right now.",
      departureAirports: tourAirports.map((a) => `${a.code} – ${a.name}`),
    };
  }
  return {
    tour: found.tour.tour.title,
    fixedDepartures: true,
    upcomingDepartures: departures.slice(0, 20).map((d) => ({
      date: d.day,
      display: dayLabel(d.day),
      departureAirports: d.airports.map((a) => `${a.code} – ${a.name}`),
    })),
  };
}

async function getPriceQuote(args: ToolArgs) {
  const query = str(args.tour);
  if (!query) return { error: "Say which tour." };
  const ages = Array.isArray(args.travellerAges) ? args.travellerAges.map(Number) : [];
  if (ages.length === 0 || ages.length > 20 || ages.some((a) => !Number.isFinite(a) || a < 0 || a > 110)) {
    return { needs: "travellerAges", message: "Ask for the age of every traveller — the price depends on it." };
  }

  const found = await resolveTour(query);
  if ("ambiguous" in found) return { ambiguous: found.ambiguous, message: "More than one tour matches — ask which one they mean." };
  if ("notFound" in found) return { found: false, message: "No tour by that name.", allTours: found.notFound };
  const tour = await Tour.findById(found.tour.tour._id);
  if (!tour) return { found: false };

  // Same age → type rule the booking screen uses, so the quote matches the booking.
  const ageConfig = await getAgeCategoryConfig();
  const travellers = ages.map((age) => ({ type: categorizeAge(age, ageConfig), age }));

  const { departures, tourAirports } = await loadDepartures(tour._id);
  const dateArg = str(args.date);
  const airportArg = str(args.airport).toLowerCase();
  const listDates = () => departures.slice(0, 20).map((d) => ({ date: d.day, display: dayLabel(d.day) }));

  // Which departure (a calendar day) — needed when the tour flies on fixed dates.
  let dep: Departure | undefined;
  if (departures.length > 0) {
    if (!dateArg) return { needs: "date", message: "This tour departs on fixed dates — ask which one.", availableDates: listDates() };
    dep = departures.find((d) => d.day === dateArg);
    if (!dep) return { ok: false, message: `No departure on ${dateArg}.`, availableDates: listDates() };
  }

  // Which airport — from those flying that day (or all the tour's, if it has no fixed dates).
  const airports: { id: string; code: string; name: string }[] = dep ? dep.airports : tourAirports;
  const chosenAirport =
    (airportArg ? airports.find((a) => a.code.toLowerCase() === airportArg || a.name.toLowerCase().includes(airportArg)) : undefined) ??
    (airports.length === 1 ? airports[0] : undefined);
  if (airports.length > 1 && !chosenAirport) {
    return { needs: "airport", message: "Ask which departure airport.", airports: airports.map((a) => `${a.code} – ${a.name}`) };
  }

  // The date row that prices this departure: the airport's own row if there is one, else the "any airport" row —
  // the same choice the booking screen makes.
  const dateRowId = dep ? ((chosenAirport && dep.rowByAirport.get(chosenAirport.id)) ?? dep.anyRowId) : undefined;
  const tourDate = dateRowId ? await TourDate.findById(dateRowId) : null;
  const airportForPricing = chosenAirport ? (tourAirports.find((a) => a.id === chosenAirport.id) ?? null) : null;
  const { baseAmount, breakdown } = computeBaseAmount(
    tour,
    travellers,
    tourDate,
    airportForPricing && { code: airportForPricing.code, addonPrice: airportForPricing.addonPrice, appliesTo: airportForPricing.appliesTo },
  );

  const typeName = { adult: "Adult", child: "Child", infant: "Infant" } as const;
  return {
    ok: true,
    tour: tour.title,
    departure: {
      date: dep ? dayLabel(dep.day) : "The customer chooses the travel date when booking",
      airport: chosenAirport ? `${chosenAirport.code} – ${chosenAirport.name}` : undefined,
    },
    perTraveller: breakdown.map((l) => ({
      type: typeName[l.type],
      count: l.count,
      pricePerPerson: inr(l.unitPrice),
      subtotal: inr(l.subtotal),
    })),
    total: inr(baseAmount),
    tokenPayment: tour.allowTokenPayment && (tour.tokenAmount ?? 0) > 0 ? `Can book now with just ${inr(Math.min(tour.tokenAmount ?? 0, baseAmount))}` : undefined,
    seatWarning: tour.seatsAvailable != null && tour.seatsAvailable < travellers.length ? `Only ${tour.seatsAvailable} seats are left` : undefined,
    note: "Total before any promo code or wallet credit, which are applied at checkout.",
  };
}

function bookingSummary(b: InstanceType<typeof Booking>, airportCode?: string) {
  const closed = b.status === "cancelled" || b.paymentStatus === "refunded";
  const remaining = closed ? 0 : Math.max(0, round2(b.pricing.finalAmount - b.amountPaid));
  return {
    bookingRef: b.bookingRef,
    tour: (b.itinerarySnapshot as { title?: string } | undefined)?.title,
    travelDate: dayLabel(dayKey(b.travelDate)),
    departureAirport: airportCode,
    travellers: b.travellers.length,
    status: b.status,
    paymentStatus: b.paymentStatus,
    total: inr(b.pricing.finalAmount),
    paid: inr(b.amountPaid),
    remaining: inr(remaining),
  };
}

async function getMyBookings(_args: ToolArgs, ctx: ToolContext) {
  const bookings = await Booking.find({ customerId: ctx.customerId }).sort({ createdAt: -1 }).limit(10).populate("airportId", "code");
  if (bookings.length === 0) return { count: 0, message: "This customer has no bookings yet." };
  return {
    count: bookings.length,
    bookings: bookings.map((b) => bookingSummary(b, (b.airportId as unknown as { code?: string } | null)?.code)),
  };
}

async function getBookingStatus(args: ToolArgs, ctx: ToolContext) {
  const ref = str(args.bookingRef).toUpperCase();
  // Scoped to the signed-in customer here, never by anything the model supplies.
  const b = await Booking.findOne({ bookingRef: ref, customerId: ctx.customerId }).populate("airportId", "code");
  if (!b) return { found: false, message: "No booking with that reference on this account." };
  return { found: true, ...bookingSummary(b, (b.airportId as unknown as { code?: string } | null)?.code) };
}

async function getPolicies() {
  const setting = await Setting.findOne({ key: "terms_html" });
  const text = htmlToText(setting?.value, 6000);
  return text
    ? { termsAndConditions: text }
    : { message: "No terms text is available. Don't state a cancellation or refund policy — offer to pass the question to the team." };
}

async function escalate(args: ToolArgs) {
  return { escalated: true, reason: str(args.reason) };
}

/** Runs one tool call for a signed-in customer. Never throws: a failure becomes a result the model can explain. */
export async function runChatTool(name: string, args: ToolArgs, ctx: ToolContext): Promise<unknown> {
  try {
    switch (name) {
      case "search_tours":
        return await searchTours(args);
      case "get_tour_details":
        return await getTourDetails(args);
      case "get_departures":
        return await getDepartures(args);
      case "get_price_quote":
        return await getPriceQuote(args);
      case "get_my_bookings":
        return await getMyBookings(args, ctx);
      case "get_booking_status":
        return await getBookingStatus(args, ctx);
      case "get_policies":
        return await getPolicies();
      case "escalate_to_human":
        return await escalate(args);
      default:
        return { error: `Unknown tool ${name}` };
    }
  } catch (err) {
    console.error(`[chatbot] tool ${name} failed:`, err);
    return { error: "That information couldn't be loaded right now." };
  }
}
