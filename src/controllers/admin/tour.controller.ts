import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";

import { Tour } from "../../models/Tour.js";
import { syncTourRemove, syncTourUpsert } from "../../mysql/sync/tourSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import {
  daysWithImages,
  resolveItineraryImages,
  serializeEntryForAdmin,
  suggestForDay,
  type ItineraryImageEntry,
} from "../../services/itineraryImage.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Adds the resolved public URL of the cover image so the admin panel can render
// a preview — the stored `coverImage` is only our storage key.
function serializeForAdmin(tour: HydratedDocument<any>) {
  const obj = tour.toObject();
  return { ...obj, coverImageUrl: tour.coverImage ? s3Adapter.urlFor(tour.coverImage as string) : null };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const items = await Tour.find().sort({ createdAt: -1 });
  res.json({ items: items.map(serializeForAdmin) });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  res.json({ item: serializeForAdmin(tour) });
});

// Auto-resolves per-day itinerary photos and saves them onto the tour. Strictly
// best-effort: any failure (Wikimedia down, bad itinerary) is swallowed so it
// can never turn a successful tour create/update into an error. Manual picks are
// preserved and unchanged day titles reuse the cached photo.
async function refreshItineraryImages(
  tour: HydratedDocument<any>,
  opts: { regenerateKey?: string } = {},
): Promise<void> {
  try {
    tour.itineraryImages = await resolveItineraryImages(tour, opts);
    await tour.save();
  } catch (err) {
    console.error("[itinerary-image] resolve failed for tour", tour.id, err);
  }
}

// Parsed days joined with their stored image entry (resolved URLs) — the shape
// the admin itinerary-images editor renders.
function itineraryItems(tour: HydratedDocument<any>) {
  return daysWithImages(tour).map((d) => ({
    key: d.key,
    dayNumber: d.day,
    title: d.title,
    description: d.description,
    entry: serializeEntryForAdmin(d.entry, (k) => s3Adapter.urlFor(k)),
  }));
}

function findDay(tour: HydratedDocument<any>, key: string) {
  return daysWithImages(tour).find((d) => d.key === key) ?? null;
}

// Replace (or add) the entry for a day key, leaving every other day untouched.
function upsertEntry(tour: HydratedDocument<any>, entry: ItineraryImageEntry) {
  const list = ((tour.itineraryImages as ItineraryImageEntry[]) ?? []).filter((e) => e.key !== entry.key);
  list.push(entry);
  tour.itineraryImages = list;
}

// Guards the "paste an image URL" path: a Google Maps / web-page link is HTML,
// not an image, so it never renders in an <img>. We check the content type and
// reject non-images with a clear message. If the host blocks our HEAD/GET (some
// CDNs do), we allow it rather than falsely reject a genuine image.
async function assertDirectImageUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    throw ApiError.badRequest("Enter a full image URL that starts with http:// or https://");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    let resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    let ct = resp.headers.get("content-type") ?? "";
    if (!ct) {
      resp = await fetch(url, { headers: { Range: "bytes=0-0" }, redirect: "follow", signal: controller.signal });
      ct = resp.headers.get("content-type") ?? "";
    }
    if (ct && !ct.toLowerCase().startsWith("image/")) {
      throw ApiError.badRequest(
        "That link isn't a direct image. Paste a URL that points straight to an image file " +
          "(ending in .jpg, .png, .webp…). A Google Maps or web-page link won't work — open the " +
          "photo itself, then copy its image address.",
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Network error / HEAD blocked — can't verify, so don't block a real image.
  } finally {
    clearTimeout(timeout);
  }
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const updates: Record<string, unknown> = { ...req.body };
  await attachUploadedImage(req, "tours", updates, "coverImage");
  const tour = await Tour.create(updates);
  await refreshItineraryImages(tour);
  // Don't make the admin wait on a round trip to a remote legacy host for a
  // response to their own, already-successful Mongo write — kick the sync off
  // and let it update mysqlSync in the background; the list/detail views pick
  // the real status up on their next fetch.
  void runMysqlSync(Tour, tour, () => syncTourUpsert(tour));
  res.status(201).json({ item: serializeForAdmin(tour) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const existing = await Tour.findById(req.params.id);
  if (!existing) throw ApiError.notFound("Tour not found");

  const updates: Record<string, unknown> = { ...req.body };
  await attachUploadedImage(req, "tours", updates, "coverImage", existing.coverImage as string | undefined);

  // An explicit empty coverImage (and no replacement file) means "remove the
  // cover" — drop the stored file so it doesn't linger in S3.
  if (!req.file && updates.coverImage === "" && existing.coverImage) {
    await s3Adapter.remove(existing.coverImage as string).catch(() => undefined);
  }

  Object.assign(existing, updates);
  await existing.save();
  // Re-resolve day photos after the edit. Unchanged day titles reuse the cached
  // image (no Wikimedia call) and manual picks are preserved; only new/renamed
  // days are searched.
  await refreshItineraryImages(existing);
  void runMysqlSync(Tour, existing, () => syncTourUpsert(existing));
  res.json({ item: serializeForAdmin(existing) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findByIdAndDelete(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  if (tour.coverImage) await s3Adapter.remove(tour.coverImage as string).catch(() => undefined);
  await syncTourRemove(tour.legacyMysqlId as number | undefined).catch((err) =>
    console.error("[mysql-sync] failed to remove tour:", err),
  );
  res.status(204).send();
});

export const resync = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  await runMysqlSync(Tour, tour, () => syncTourUpsert(tour));
  const refreshed = await Tour.findById(tour._id);
  res.json({ item: refreshed ? serializeForAdmin(refreshed) : null });
});

// ---------------------------------------------------------------------------
// Itinerary day images — admin editor + migration for existing tours.
// All of these read tour.itinerary (the already-saved rich-text) and operate on
// the tour.itineraryImages cache; none touch the package gallery (TourMedia).
// ---------------------------------------------------------------------------

// The current day list + each day's stored image. No external calls.
export const listItineraryImages = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  res.json({ items: itineraryItems(tour) });
});

// Live Wikimedia suggestions for one day (the admin's "search again" / review).
export const suggestItineraryImage = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  const key = (req.body?.key as string) ?? "";
  const day = findDay(tour, key);
  if (!day) throw ApiError.badRequest("Unknown itinerary day");
  const { query, candidates } = await suggestForDay(day, tour);
  res.json({ query, candidates });
});

// Re-resolve automatically: one day (body.key, forced) or fill all missing/
// changed days (no key). Manual picks are preserved. Also the migration hook for
// existing tours — "generate suggestions" without overwriting manual choices.
export const regenerateItineraryImages = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  const key = (req.body?.key as string) || undefined;
  await refreshItineraryImages(tour, key ? { regenerateKey: key } : {});
  res.json({ items: itineraryItems(tour) });
});

// Admin picks one of the suggested Wikimedia candidates for a day.
export const selectItineraryImage = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  const key = (req.body?.key as string) ?? "";
  const day = findDay(tour, key);
  if (!day) throw ApiError.badRequest("Unknown itinerary day");
  const c = req.body?.candidate;
  if (!c?.imageUrl) throw ApiError.badRequest("A candidate image is required");

  upsertEntry(tour, {
    key,
    dayNumber: day.day,
    title: day.title,
    searchKeyword: (req.body?.query as string) ?? "",
    imageUrl: String(c.imageUrl),
    thumbUrl: String(c.thumbUrl || c.imageUrl),
    fileTitle: String(c.fileTitle ?? ""),
    descriptionUrl: String(c.descriptionUrl ?? ""),
    artist: String(c.artist ?? ""),
    licenseName: String(c.licenseName ?? ""),
    licenseUrl: String(c.licenseUrl ?? ""),
    attribution: String(c.attribution ?? ""),
    source: "wikimedia",
    selectionMethod: "manual",
    matchStatus: "published",
    score: Number(c.score ?? 0),
    updatedAt: new Date(),
  });
  await tour.save();
  res.json({ items: itineraryItems(tour) });
});

// Admin overrides a day with their own image: an uploaded file (multer "image")
// or a pasted URL. Stored as a manual pick so a later re-resolve never clobbers it.
export const setManualItineraryImage = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  const key = (req.body?.key as string) ?? "";
  const day = findDay(tour, key);
  if (!day) throw ApiError.badRequest("Unknown itinerary day");

  let imageUrl: string;
  let source: string;
  if (req.file) {
    // Reuse the "tours" folder (same as cover images, known to be publicly
    // served) rather than a brand-new prefix that the bucket policy might not
    // expose — otherwise the uploaded image 403s and won't load.
    const stored = await s3Adapter.save("tours", req.file.path, req.file.originalname);
    imageUrl = stored.key; // storage key — serializers resolve it via urlFor
    source = "manual-upload";
  } else if (req.body?.imageUrl) {
    imageUrl = String(req.body.imageUrl).trim();
    await assertDirectImageUrl(imageUrl); // rejects Google-Maps/webpage links
    source = "manual-url";
  } else {
    throw ApiError.badRequest("Provide an image file or an image URL");
  }

  upsertEntry(tour, {
    key,
    dayNumber: day.day,
    title: day.title,
    searchKeyword: "",
    imageUrl,
    thumbUrl: imageUrl,
    fileTitle: "",
    descriptionUrl: "",
    artist: String(req.body?.artist ?? ""),
    licenseName: String(req.body?.licenseName ?? ""),
    licenseUrl: "",
    attribution: String(req.body?.attribution ?? ""),
    source,
    selectionMethod: "manual",
    matchStatus: "published",
    score: 0,
    updatedAt: new Date(),
  });
  await tour.save();
  res.json({ items: itineraryItems(tour) });
});

// Remove a day's image entry (clears a manual pick or an unwanted auto match).
// The day then shows no image until the admin regenerates or re-saves the tour
// (which re-resolves it automatically).
export const clearItineraryImage = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  const key = req.params.key;
  if (!key) throw ApiError.badRequest("Day key is required");
  const kept = ((tour.itineraryImages as unknown as ItineraryImageEntry[]) ?? []).filter((e) => e.key !== key);
  (tour as HydratedDocument<any>).itineraryImages = kept;
  await tour.save();
  res.json({ items: itineraryItems(tour) });
});
