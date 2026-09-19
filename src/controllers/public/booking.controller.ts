import crypto from "node:crypto";

import type { Request, Response } from "express";

import { Booking } from "../../models/Booking.js";
import { Tour } from "../../models/Tour.js";
import { TourDate } from "../../models/TourDate.js";
import { categorizeAge, getAgeCategoryConfig } from "../../services/ageCategory.service.js";
import { computeBaseAmount, validatePromoCode } from "../../services/pricing.service.js";
import { listTourAirports } from "../../services/tourOptions.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

function generateBookingRef(): string {
  return `FL${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    tourId: string;
    tourDateId?: string;
    airportId?: string;
    travelDate: Date;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    travellers: { name: string; age?: number; gender?: string; type: "adult" | "child" | "infant" }[];
    promoCode?: string;
    useWalletCredit?: boolean;
  };

  const tour = await Tour.findOne({ _id: body.tourId, isActive: true });
  if (!tour) throw ApiError.notFound("Tour not found");

  if (tour.seatsAvailable != null && tour.seatsAvailable < body.travellers.length) {
    throw ApiError.badRequest("Not enough seats available for this tour");
  }

  // The client-supplied type is never trusted for pricing — age is the
  // source of truth everywhere (admin, app, pricing, invoice), derived from
  // the same configurable thresholds, so a traveller can't be priced as one
  // category while showing as another anywhere else in the system.
  const ageConfig = await getAgeCategoryConfig();
  const travellers = body.travellers.map((t) =>
    t.age !== undefined ? { ...t, type: categorizeAge(t.age, ageConfig) } : t,
  );

  let tourDateId: string | null = null;
  let tourDateDoc: InstanceType<typeof TourDate> | null = null;

  if (body.tourDateId) {
    const tourDate = await TourDate.findOne({ _id: body.tourDateId, tourId: tour._id, isActive: true });
    if (!tourDate) throw ApiError.badRequest("Selected travel date is not available");
    tourDateDoc = tourDate;
    tourDateId = String(tourDate._id);
  }

  // The airport is its own choice, validated against the tour's own airport
  // list (Tour Airport Prices) — it's never inferred by folding it into the
  // date. A date that's tied to an airport implies it when the client didn't
  // send one, and must agree with it when it did.
  const tourAirports = await listTourAirports(tour._id);
  const dateAirportId = tourDateDoc?.airportId ? String(tourDateDoc.airportId) : null;
  let airportId: string | null = body.airportId ?? dateAirportId;
  if (dateAirportId && body.airportId && dateAirportId !== body.airportId) {
    throw ApiError.badRequest("Selected travel date doesn't match the selected airport");
  }
  const onlyAirport = tourAirports.length === 1 ? tourAirports[0] : undefined;
  if (!airportId && onlyAirport) airportId = onlyAirport.id;
  if (!airportId && tourAirports.length > 1) throw ApiError.badRequest("Select a departure airport");
  const chosenAirport = airportId ? (tourAirports.find((a) => a.id === airportId) ?? null) : null;
  if (airportId && !chosenAirport) {
    throw ApiError.badRequest("Selected airport is not available for this tour");
  }

  const { baseAmount, breakdown, addons } = computeBaseAmount(
    tour,
    travellers,
    tourDateDoc,
    chosenAirport && { code: chosenAirport.code, addonPrice: chosenAirport.addonPrice },
  );

  let discountAmount = 0;
  let promoCodeId: string | undefined;
  let promoCode: string | undefined;
  if (body.promoCode) {
    const result = await validatePromoCode(body.promoCode, String(tour._id), baseAmount, req.customer!.sub);
    discountAmount = result.discountAmount;
    promoCodeId = String(result.promo!._id);
    promoCode = result.promo!.code;
  }

  let finalAmount = Math.round((baseAmount - discountAmount) * 100) / 100;

  let walletCreditApplied = 0;
  if (body.useWalletCredit) {
    const { getWalletBalance } = await import("../../services/referral.service.js");
    const walletBalance = await getWalletBalance(req.customer!.sub);
    walletCreditApplied = Math.min(walletBalance, finalAmount);
    finalAmount = Math.round((finalAmount - walletCreditApplied) * 100) / 100;
  }

  const tokenAmount = tour.allowTokenPayment ? Math.min(tour.tokenAmount ?? 0, finalAmount) : 0;

  const booking = await Booking.create({
    bookingRef: generateBookingRef(),
    customerId: req.customer!.sub,
    tourId: tour._id,
    tourDateId,
    airportId,
    travelDate: body.travelDate,
    contactName: body.contactName,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
    travellers,
    pricing: {
      baseAmount,
      discountAmount,
      promoCode,
      promoCodeId,
      finalAmount,
      tokenAmount,
      walletCreditApplied,
      breakdown,
      addons,
    },
    itinerarySnapshot: {
      title: tour.title,
      slug: tour.slug,
      image: tour.coverImage,
      duration: tour.duration,
      inclusions: tour.inclusions,
      exclusions: tour.exclusions,
      itinerary: tour.itinerary,
    },
  });

  if (walletCreditApplied > 0) {
    const { redeemWalletCredit } = await import("../../services/referral.service.js");
    await redeemWalletCredit(req.customer!.sub, walletCreditApplied, String(booking._id));
  }

  res.status(201).json({ item: booking });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find({ customerId: req.customer!.sub })
    .populate("airportId", "code name")
    .sort({ createdAt: -1 });
  res.json({ items: bookings });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.customer!.sub }).populate(
    "airportId",
    "code name",
  );
  if (!booking) throw ApiError.notFound("Booking not found");
  res.json({ item: booking });
});

export const tripSummaryPdf = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.customer!.sub });
  if (!booking) throw ApiError.notFound("Booking not found");
  // Only worth having once money has actually changed hands — an unpaid or
  // cancelled booking has nothing confirmed to summarize.
  if (booking.paymentStatus === "unpaid" || booking.status === "cancelled") {
    throw ApiError.badRequest("Trip summary is available once at least the token/partial payment is made");
  }

  const { renderTripSummaryPdf } = await import("../../services/tripSummaryPdf.service.js");
  const pdfBytes = await renderTripSummaryPdf(booking as any);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${booking.bookingRef}-trip-summary.pdf"`);
  res.send(Buffer.from(pdfBytes));
});
