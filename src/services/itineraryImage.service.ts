import { env } from "../config/env.js";
import { parseItineraryDays, type ItineraryDay } from "../utils/itinerary.js";

// Resolves a real destination photo for each itinerary day from Wikimedia
// Commons, keyed to the place parsed from the day's title. Results are cached on
// the Tour (tour.itineraryImages) so the public read path NEVER calls Wikimedia
// — only an admin save / explicit regenerate does, and even that only for
// new/changed days. Everything here is best-effort: any failure yields a safe
// "no image" entry and the app falls back to the package photo, so a Wikimedia
// outage can never break tour create/edit.
//
// Wikimedia images are CC-licensed (or PD): we capture artist + license + the
// file description page so attribution requirements can be honoured, and we only
// store the (permitted) scaled thumbnail URL + metadata — never a downloaded copy.

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// Requested width of the scaled thumbnail we link to (Commons serves it from its
// own CDN; it may round up to the nearest responsive bucket, e.g. ~960px). Small
// enough to stay light for the day-card thumbnails, big enough for the admin
// suggestion previews. We never download the original.
const DISPLAY_WIDTH = 640;
const REQUEST_TIMEOUT_MS = 7000;
const SEARCH_LIMIT = 12;
// A day only auto-publishes when the best candidate clears this score; otherwise
// it's held as "needs_review" for the admin to pick from suggestions.
const PUBLISH_THRESHOLD = 10;
// How long a (query -> ranked candidates) result stays cached in-process, so the
// same destination isn't searched twice (across days, tours, and admin calls).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageCandidate = {
  fileTitle: string;
  imageUrl: string;
  thumbUrl: string;
  descriptionUrl: string;
  artist: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  width: number;
  height: number;
  score: number;
};

export type ItineraryImageEntry = {
  key: string;
  dayNumber: number | null;
  title: string;
  searchKeyword: string;
  imageUrl: string;
  thumbUrl: string;
  fileTitle: string;
  descriptionUrl: string;
  artist: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  source: string;
  selectionMethod: "auto" | "manual";
  matchStatus: "published" | "needs_review" | "empty" | "failed";
  score: number;
  updatedAt: Date;
};

type TourLike = {
  itinerary?: string | null;
  location?: string | null;
  title?: string | null;
  itineraryImages?: ItineraryImageEntry[] | null;
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const TAG_RE = /<[^>]*>/g;
const stripHtml = (s: string) =>
  (s || "")
    .replace(TAG_RE, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalize = (s: string) => (s || "").toLowerCase().replace(/[_]/g, " ");

const tokenize = (s: string): string[] =>
  normalize(s)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3);

// ---------------------------------------------------------------------------
// Search-query building — turn a day into a destination search string + the
// place/context tokens used for relevance scoring.
// ---------------------------------------------------------------------------

const LEISURE_RE =
  /\b(?:leisure|free day|day at leisure|at leisure|own pace|free time|relax(?:ation)?|rest day|day free)\b/i;

const STOP_WORDS = new Set([
  "visit", "explore", "enjoy", "discover", "see", "seeing", "arrive", "arriving",
  "arrival", "depart", "departure", "departing", "transfer", "transferring",
  "drive", "driving", "travel", "travelling", "proceed", "head", "continue",
  "sightseeing", "sightsee", "tour", "touring", "excursion", "trip", "boating",
  "boat", "cruise", "cruising", "shopping", "shop", "experience", "experiencing",
  "check", "checkin", "checkout", "overnight", "breakfast", "lunch", "dinner",
  "stay", "welcome", "return", "returning", "start", "begin", "reach", "reaching",
  "fly", "flight", "pickup", "pick", "drop", "spend", "spending", "walk", "trek",
  "trekking", "hike", "hiking", "visiting", "morning", "afternoon", "evening", "night",
  "free", "leisure", "hotel", "resort", "houseboat", "camp", "lodge", "guesthouse",
  "to", "at", "in", "of", "the", "for", "around", "near", "towards", "toward",
  "through", "via", "and", "a", "an", "on", "from", "your", "our", "with", "by",
  "&", "-", "–", "—", "into", "then", "later", "today", "day", "enroute", "en",
]);

const isStop = (t: string) => STOP_WORDS.has(t.toLowerCase().replace(/-/g, ""));

function cleanToken(t: string): string {
  return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'-]+$/gu, "");
}

/** Pulls the place/landmark phrase out of a heading, stripping action verbs. */
function extractPlace(heading: string): string {
  if (!heading) return "";
  const segment = heading.split(/[|/•:;&+,]| - | – | — |[.!?]|\(/)[0] ?? heading;
  let tokens = segment.split(/\s+/).map(cleanToken).filter(Boolean);
  while (tokens.length && isStop(tokens[0]!)) tokens.shift();
  while (tokens.length && isStop(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.slice(0, 5).join(" ").trim();
}

export type ResolvedQuery = {
  query: string;
  generic: boolean;
  place: string;
  location: string;
};

/**
 * Builds the Commons search query for a day + the place it represents. Adds the
 * package destination as disambiguating context ("Victoria Seychelles" ≠
 * "Victoria, Australia"). `generic` days (leisure / no landmark) fall back to the
 * package destination itself.
 */
export function buildSearchQuery(
  day: Pick<ItineraryDay, "title" | "description">,
  tour: Pick<TourLike, "location" | "title">,
): ResolvedQuery {
  const location = (tour.location ?? "").trim();
  const fallbackBase = location || (tour.title ?? "").trim();

  let place = extractPlace(day.title ?? "");

  if ((!place || place.length < 3 || LEISURE_RE.test(day.title ?? "")) && day.description) {
    const fromDesc = extractPlace(day.description);
    if (fromDesc && fromDesc.length >= 3 && !LEISURE_RE.test(fromDesc)) place = fromDesc;
  }

  if (!place || place.length < 3 || LEISURE_RE.test(place)) {
    return { query: fallbackBase, generic: true, place: fallbackBase, location };
  }

  const needsCtx = location && !place.toLowerCase().includes(location.toLowerCase());
  const query = needsCtx ? `${place} ${location}` : place;
  return { query: query.trim(), generic: false, place, location };
}

// ---------------------------------------------------------------------------
// Wikimedia Commons provider
// ---------------------------------------------------------------------------

function userAgent(): string {
  const contact = env.WIKIMEDIA_CONTACT_EMAIL ? ` <${env.WIKIMEDIA_CONTACT_EMAIL}>` : "";
  return `${env.WIKIMEDIA_USER_AGENT}${contact}`;
}

async function commonsGet(params: Record<string, string>): Promise<any | null> {
  const url = `${COMMONS_API}?${new URLSearchParams({ format: "json", ...params }).toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent(), "Api-User-Agent": userAgent() },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[itinerary-image] Commons ${res.status} ${params.list ?? params.prop ?? ""}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[itinerary-image] Commons request failed:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Things that are technically "images" on Commons but never a destination photo.
const REJECT_RE =
  /\b(logo|icon|map|maps|diagram|flag|flags|coat of arms|crest|poster|advert|advertisement|banner|chart|graph|seal|emblem|locator|svg|sticker|symbol|cartograph|blueprint|infographic|screenshot|signature|stamp|postage|plaque|scan|scans|document|drawing|sketch|painting|portrait of|book|books|library|reference|page|pages|illustration|illustrated|engraving|lithograph|woodcut|manuscript|gazette|journal|magazine|newspaper|title page|print|prints|etching|plate|atlas|encyclopedia|encyclopaedia|dictionary|almanac|postcard|poster)\b/i;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function buildAttribution(artist: string, licenseName: string): string {
  const who = artist ? artist : "Unknown author";
  const lic = licenseName ? `, ${licenseName}` : "";
  return `${who}${lic} — via Wikimedia Commons`;
}

/** Score a candidate against the day's place/context tokens. Returns -1 to reject. */
function scoreCandidate(
  c: { fileTitle: string; description: string; categories: string; width: number; height: number; mime: string },
  placeTokens: string[],
  contextTokens: string[],
  rank: number,
): number {
  if (!ALLOWED_MIME.has(c.mime)) return -1;
  if (c.width < 400 || c.height < 300) return -1; // low-res

  const title = normalize(c.fileTitle.replace(/^file:/i, "").replace(/\.[a-z0-9]+$/i, ""));
  // "Strong" signal = filename + categories (reliably describe the subject);
  // the free-text description can mention anything, so it only adds score, never
  // qualifies a candidate on its own.
  const strongHay = normalize(`${title} ${c.categories}`);
  const fullHay = normalize(`${strongHay} ${c.description}`);
  if (REJECT_RE.test(title) || REJECT_RE.test(c.categories)) return -1;

  let score = 0;
  let strongHits = 0;
  for (const t of placeTokens) {
    if (strongHay.includes(t)) {
      score += 8;
      strongHits += 1;
    } else if (fullHay.includes(t)) {
      score += 3; // described but not in the filename/categories — weaker
    }
  }
  for (const t of contextTokens) if (fullHay.includes(t)) score += 3;

  // Must be about this place: at least one place word in the filename/categories.
  if (placeTokens.length > 0 && strongHits === 0) return -1;
  // Exact-landmark bonus: every place word present in the strong signal.
  if (placeTokens.length > 0 && strongHits === placeTokens.length) score += 6;

  if (c.width >= c.height) score += 3; // landscape suits the card
  if (c.width >= 1200) score += 2; // hi-res
  score += Math.max(0, (SEARCH_LIMIT - rank) * 0.4); // mild search-rank bias

  return score;
}

/** Runs the Commons search + imageinfo + scoring for a query. Cached in-process. */
const queryCache = new Map<string, { expires: number; candidates: ImageCandidate[] }>();

async function searchAndRank(resolved: ResolvedQuery): Promise<ImageCandidate[]> {
  const cacheKey = resolved.query.toLowerCase().trim();
  if (!cacheKey) return [];
  const hit = queryCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.candidates;

  const search = await commonsGet({
    action: "query",
    list: "search",
    srnamespace: "6",
    srsearch: resolved.query,
    srlimit: String(SEARCH_LIMIT),
  });
  const titles: string[] = (search?.query?.search ?? []).map((s: any) => s.title).filter(Boolean);
  if (titles.length === 0) {
    queryCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, candidates: [] });
    return [];
  }

  const info = await commonsGet({
    action: "query",
    prop: "imageinfo",
    titles: titles.join("|"),
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: String(DISPLAY_WIDTH),
  });
  const pages: Record<string, any> = info?.query?.pages ?? {};

  // extmetadata order isn't guaranteed to match the search order, so re-attach
  // the original search rank by title.
  const rankByTitle = new Map(titles.map((t, i) => [t, i] as const));

  const placeTokens = tokenize(resolved.place);
  const contextTokens = tokenize(resolved.location).filter((t) => !placeTokens.includes(t));

  const candidates: ImageCandidate[] = [];
  for (const page of Object.values(pages)) {
    const ii = page?.imageinfo?.[0];
    if (!ii) continue;
    const em = ii.extmetadata ?? {};
    const artist = stripHtml(em.Artist?.value ?? "");
    const licenseName = stripHtml(em.LicenseShortName?.value ?? "");
    const licenseUrl = (em.LicenseUrl?.value ?? "").trim();
    const description = stripHtml(em.ImageDescription?.value ?? "");
    const categories = normalize(em.Categories?.value ?? "");
    const fileTitle = page.title as string;
    const score = scoreCandidate(
      {
        fileTitle,
        description,
        categories,
        width: ii.width ?? 0,
        height: ii.height ?? 0,
        mime: ii.mime ?? "",
      },
      placeTokens,
      contextTokens,
      rankByTitle.get(fileTitle) ?? SEARCH_LIMIT,
    );
    if (score < 0) continue;
    candidates.push({
      fileTitle,
      imageUrl: ii.thumburl || ii.url,
      thumbUrl: ii.thumburl || ii.url,
      descriptionUrl: ii.descriptionurl ?? "",
      artist,
      licenseName,
      licenseUrl,
      attribution: buildAttribution(artist, licenseName),
      width: ii.width ?? 0,
      height: ii.height ?? 0,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  queryCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, candidates });
  return candidates;
}

// ---------------------------------------------------------------------------
// Public service API
// ---------------------------------------------------------------------------

const keyFor = (day: ItineraryDay) => (day.day != null ? `d${day.day}` : `i${day.index}`);

function publishedEntry(key: string, day: ItineraryDay, keyword: string, c: ImageCandidate): ItineraryImageEntry {
  return {
    key,
    dayNumber: day.day,
    title: day.title,
    searchKeyword: keyword,
    imageUrl: c.imageUrl,
    thumbUrl: c.thumbUrl,
    fileTitle: c.fileTitle,
    descriptionUrl: c.descriptionUrl,
    artist: c.artist,
    licenseName: c.licenseName,
    licenseUrl: c.licenseUrl,
    attribution: c.attribution,
    source: "wikimedia",
    selectionMethod: "auto",
    matchStatus: "published",
    score: c.score,
    updatedAt: new Date(),
  };
}

function unresolvedEntry(
  key: string,
  day: ItineraryDay,
  keyword: string,
  status: "needs_review" | "failed",
): ItineraryImageEntry {
  return {
    key,
    dayNumber: day.day,
    title: day.title,
    searchKeyword: keyword,
    imageUrl: "",
    thumbUrl: "",
    fileTitle: "",
    descriptionUrl: "",
    artist: "",
    licenseName: "",
    licenseUrl: "",
    attribution: "",
    source: "wikimedia",
    selectionMethod: "auto",
    matchStatus: status,
    score: 0,
    updatedAt: new Date(),
  };
}

/**
 * Full itineraryImages array for a tour: manual picks are always kept; auto
 * entries are reused when the day's search query is unchanged; new/changed days
 * are searched + scored. High-confidence best match auto-publishes; a weak match
 * is held as "needs_review" for the admin. Never throws.
 *
 * `regenerateKey` forces one day (even a manual one) to re-resolve from scratch.
 */
export async function resolveItineraryImages(
  tour: TourLike,
  opts: { regenerateKey?: string } = {},
): Promise<ItineraryImageEntry[]> {
  const days = parseItineraryDays(tour.itinerary);
  if (days.length === 0) return [];

  const prevByKey = new Map<string, ItineraryImageEntry>();
  for (const e of tour.itineraryImages ?? []) prevByKey.set(e.key, e);

  const out: ItineraryImageEntry[] = [];
  for (const day of days) {
    const key = keyFor(day);
    const prev = prevByKey.get(key);
    const regen = opts.regenerateKey === key;

    // Manual selections are sacred unless this exact day is being regenerated.
    if (prev && prev.selectionMethod === "manual" && !regen) {
      out.push({ ...prev, dayNumber: day.day, title: day.title });
      continue;
    }

    const resolved = buildSearchQuery(day, tour);

    // Reuse a cached auto result when the query is unchanged and we published one.
    if (
      prev &&
      !regen &&
      prev.selectionMethod === "auto" &&
      prev.matchStatus === "published" &&
      prev.searchKeyword === resolved.query &&
      prev.imageUrl
    ) {
      out.push({ ...prev, dayNumber: day.day, title: day.title });
      continue;
    }

    const candidates = await searchAndRank(resolved);
    const best = candidates[0];
    if (best && best.score >= PUBLISH_THRESHOLD) {
      out.push(publishedEntry(key, day, resolved.query, best));
    } else {
      // Weak/no match: hold for admin review rather than publish something off.
      out.push(unresolvedEntry(key, day, resolved.query, best ? "needs_review" : "failed"));
    }
  }

  return out;
}

/** Live suggestions for one day — top ranked candidates for the admin to pick. */
export async function suggestForDay(
  day: Pick<ItineraryDay, "title" | "description">,
  tour: Pick<TourLike, "location" | "title">,
  limit = 6,
): Promise<{ query: string; candidates: ImageCandidate[] }> {
  const resolved = buildSearchQuery(day as ItineraryDay, tour);
  const candidates = await searchAndRank(resolved);
  return { query: resolved.query, candidates: candidates.slice(0, limit) };
}

/** Parsed days joined with their stored image entry — drives the admin editor. */
export function daysWithImages(tour: TourLike): Array<ItineraryDay & { key: string; entry: ItineraryImageEntry | null }> {
  const days = parseItineraryDays(tour.itinerary);
  const byKey = new Map<string, ItineraryImageEntry>();
  for (const e of tour.itineraryImages ?? []) byKey.set(e.key, e);
  return days.map((day) => {
    const key = keyFor(day);
    return { ...day, key, entry: byKey.get(key) ?? null };
  });
}

/** Shape sent to the app/public detail response (resolved + published only). */
export function serializeItineraryImages(
  entries: ItineraryImageEntry[] | undefined | null,
  urlFor: (key: string) => string,
) {
  return (entries ?? [])
    .filter((e) => e.matchStatus === "published" && e.imageUrl)
    .map((e) => ({
      key: e.key,
      dayNumber: e.dayNumber ?? null,
      imageUrl: urlFor(e.imageUrl),
      thumbUrl: urlFor(e.thumbUrl || e.imageUrl),
      attribution: e.attribution,
      artist: e.artist,
      licenseName: e.licenseName,
      licenseUrl: e.licenseUrl,
      descriptionUrl: e.descriptionUrl,
      source: e.source,
    }));
}

/** Admin-facing shape for one stored entry (keeps review/selection fields). */
export function serializeEntryForAdmin(
  entry: ItineraryImageEntry | null,
  urlFor: (key: string) => string,
) {
  if (!entry) return null;
  return {
    ...entry,
    imageUrl: entry.imageUrl ? urlFor(entry.imageUrl) : "",
    thumbUrl: entry.thumbUrl ? urlFor(entry.thumbUrl) : "",
  };
}
