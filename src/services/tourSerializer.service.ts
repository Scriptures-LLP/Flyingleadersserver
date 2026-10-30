import type { HydratedDocument } from "mongoose";

import { s3Adapter } from "../storage/s3Adapter.js";
import { placeholderImage } from "../utils/placeholderImage.js";

type TourLike = HydratedDocument<any>;

/**
 * Shapes a Tour document to match the mobile app's existing TourPackage type
 * exactly — including `description`/`gallery`/`extraCount`, which the app's
 * Details screen renders directly off whatever object it's handed (there's no
 * separate list-vs-detail fetch on the client side). The list/summary shape
 * only carries the cover image; the real per-tour gallery (TourMedia) is
 * attached by serializeTourDetail, which the app prefers once it loads.
 */
export function serializeTourSummary(
  tour: TourLike,
  // `seatsAvailable` lets a caller override the card's seat count with the seats
  // on the tour's NEXT departure date (the per-date figure the booking flow uses),
  // which is what the admin actually maintains. When omitted (or null) the card
  // falls back to the package-level count. Passed explicitly — never via `.map`'s
  // index arg.
  opts?: { seatsAvailable?: number | null },
) {
  const image = tour.coverImage ? s3Adapter.urlFor(tour.coverImage) : placeholderImage(tour.slug, 900, 1200);
  return {
    id: tour.id,
    slug: tour.slug,
    title: tour.title,
    destination: tour.location ?? tour.title,
    shortDesc: tour.shortDesc ?? "",
    description: tour.fullDesc ?? tour.shortDesc ?? "",
    category: tour.category ?? "",
    category2: tour.category2 ?? "",
    rating: tour.rating ?? 4.5,
    pricePerPerson: tour.price,
    duration: tour.duration ?? "",
    groupSize: tour.groupSizeLabel ?? "",
    hotelClass: tour.hotelClassLabel ?? "",
    flights: tour.showFlightDetails ? "Flights" : "",
    image,
    gallery: [image],
    extraCount: 0,
    // Lets the app's Explore trip-type tabs (International / Domestic) filter the
    // catalogue for real. Defaults to international (false) to match the model.
    isDomestic: tour.isDomestic ?? false,
    // Drives the app Home screen's Group Tours / Private Tours tabs.
    tourType: tour.tourType ?? "group",
    // Seats carried on the summary too so the package cards (Home/Explore list)
    // can surface a colour-coded "seats left" label without a per-tour detail
    // fetch. Prefer the next departure date's seats (what the admin maintains and
    // the booking page shows); fall back to the package-level count.
    seatsAvailable: opts?.seatsAvailable != null ? opts.seatsAvailable : tour.seatsAvailable ?? null,
    seatsRemark: tour.seatsRemark ?? "Available",
    isActive: tour.isActive,
  };
}

/**
 * `galleryUrls` are the tour's TourMedia images (already ordered + resolved to
 * public URLs by the caller). When present they replace the cover-only
 * placeholder gallery — the app's Details screen shows them as thumbnails.
 */
export function serializeTourDetail(tour: TourLike, galleryUrls?: string[]) {
  const summary = serializeTourSummary(tour);
  return {
    ...summary,
    gallery: galleryUrls && galleryUrls.length > 0 ? galleryUrls : summary.gallery,
    fullDesc: tour.fullDesc ?? "",
    itinerary: tour.itinerary ?? "",
    inclusions: tour.inclusions ?? "",
    exclusions: tour.exclusions ?? "",
    flightDetails: tour.showFlightDetails ? tour.flightDetails ?? "" : "",
    hotelDetails: tour.showHotelDetails ? tour.hotelDetails ?? "" : "",
    priceChild: tour.priceChild ?? null,
    priceInfant: tour.priceInfant ?? null,
    childPricingTiers: tour.childPricingTiers ?? [],
    tokenAmount: tour.tokenAmount ?? 0,
    allowTokenPayment: tour.allowTokenPayment ?? false,
    seatsAvailable: tour.seatsAvailable ?? null,
    seatsRemark: tour.seatsRemark ?? "Available",
    countryId: tour.countryId ?? null,
  };
}
