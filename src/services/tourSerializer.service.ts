import type { HydratedDocument } from "mongoose";

import { localDiskAdapter } from "../storage/localDiskAdapter.js";
import { placeholderImage } from "../utils/placeholderImage.js";

type TourLike = HydratedDocument<any>;

/**
 * Shapes a Tour document to match the mobile app's existing TourPackage type
 * exactly — including `description`/`gallery`/`extraCount`, which the app's
 * Details screen renders directly off whatever object it's handed (there's no
 * separate list-vs-detail fetch on the client side). `gallery`/`extraCount`
 * are placeholders until the real per-tour media library (module H-adjacent,
 * TourMedia) is built — for now every tour just shows its own cover image.
 */
export function serializeTourSummary(tour: TourLike) {
  const image = tour.coverImage ? localDiskAdapter.urlFor(tour.coverImage) : placeholderImage(tour.slug, 900, 1200);
  return {
    id: tour.id,
    slug: tour.slug,
    title: tour.title,
    destination: tour.location ?? tour.title,
    shortDesc: tour.shortDesc ?? "",
    description: tour.fullDesc ?? tour.shortDesc ?? "",
    category: tour.category ?? "",
    rating: tour.rating ?? 4.5,
    pricePerPerson: tour.price,
    duration: tour.duration ?? "",
    groupSize: tour.groupSizeLabel ?? "",
    hotelClass: tour.hotelClassLabel ?? "",
    flights: tour.showFlightDetails ? "Flights" : "",
    image,
    gallery: [image],
    extraCount: 0,
    isActive: tour.isActive,
  };
}

export function serializeTourDetail(tour: TourLike) {
  return {
    ...serializeTourSummary(tour),
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
