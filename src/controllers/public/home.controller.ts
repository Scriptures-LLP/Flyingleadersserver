import type { Request, Response } from "express";

import { Category } from "../../models/Category.js";
import { Country } from "../../models/Country.js";
import { GalleryImage } from "../../models/GalleryImage.js";
import { HomeCover } from "../../models/HomeCover.js";
import { Tour } from "../../models/Tour.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { serializeTourSummary } from "../../services/tourSerializer.service.js";
import { serializeCategory } from "./category.controller.js";
import { serializeCountry } from "./country.controller.js";

// There's no "featured" flag on Tour -- this is just "the most recent active
// tours" -- so a low cap quietly makes any older active tour unreachable from
// Home (still active, still bookable via search, just invisible here). Keep
// this comfortably above the real catalog size so nothing active disappears.
const FEATURED_LIMIT = 50;
const TOP_COUNTRIES_LIMIT = 8;
// AlbumOrbit's decorative collage layout is designed for a 1 hero + 8 orbiting shape.
const GALLERY_LIMIT = 9;

// The /home payload is the app's single heaviest read (five collections fanned
// out, up to ~50 tours serialized) and is identical for every visitor, so
// recomputing it on every app open is pure waste and the main source of the
// "home loads late" lag. Cache it in-process with a short TTL and serve it
// stale-while-revalidate: within TTL it's returned instantly; once stale the
// cached copy still answers immediately while a single background refresh runs
// (deduped via `refreshing`, so a burst of opens can't stampede the DB). All
// the URLs are public + immutable (see s3Adapter), so a cached copy never goes
// stale in a way the client would notice beyond new/edited content, which
// appears on the next refresh — at most TTL seconds behind the admin.
const HOME_TTL_MS = 60_000;
type HomePayload = Record<string, unknown>;
let homeCache: { data: HomePayload; at: number } | null = null;
let refreshing: Promise<HomePayload> | null = null;

async function computeHome(): Promise<HomePayload> {
  const [categories, countries, featuredTours, homeCovers, galleryImages] = await Promise.all([
    Category.find({ isActive: true }).sort({ sortOrder: 1, label: 1 }),
    Country.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).limit(TOP_COUNTRIES_LIMIT),
    Tour.find({ isActive: true }).sort({ createdAt: -1 }).limit(FEATURED_LIMIT),
    HomeCover.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }),
    GalleryImage.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).limit(GALLERY_LIMIT),
  ]);

  return {
    categories: categories.map(serializeCategory),
    topCountries: countries.map(serializeCountry),
    featuredTours: featuredTours.map(serializeTourSummary),
    homeCovers: homeCovers.map((c) => ({
      id: c.id,
      title: c.title ?? "",
      altText: c.altText ?? "",
      image: s3Adapter.urlFor(c.image as string),
    })),
    galleryImages: galleryImages.map((g) => ({
      id: g.id,
      url: s3Adapter.urlFor(g.file as string),
      title: g.title ?? "",
      altText: g.altText ?? "",
    })),
  };
}

function refreshHome(): Promise<HomePayload> {
  if (!refreshing) {
    refreshing = computeHome()
      .then((data) => {
        homeCache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export const getHome = asyncHandler(async (_req: Request, res: Response) => {
  const now = Date.now();
  // Fresh: answer from cache, nothing else to do.
  if (homeCache && now - homeCache.at < HOME_TTL_MS) {
    res.json(homeCache.data);
    return;
  }
  // Stale: answer instantly with what we have and refresh in the background.
  if (homeCache) {
    res.json(homeCache.data);
    refreshHome().catch(() => undefined);
    return;
  }
  // Cold (first request since boot): nothing to serve yet, so wait for it.
  res.json(await refreshHome());
});
