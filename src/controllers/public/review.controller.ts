import type { Request, Response } from "express";

import { Booking } from "../../models/Booking.js";
import { Review } from "../../models/Review.js";
import { Tour } from "../../models/Tour.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, rating, title, comment, photos } = req.body as {
    bookingId: string;
    rating: number;
    title?: string;
    comment: string;
    photos?: string[];
  };

  const booking = await Booking.findOne({ _id: bookingId, customerId: req.customer!.sub });
  if (!booking) throw ApiError.notFound("Booking not found");
  if (booking.status === "cancelled" || booking.paymentStatus === "unpaid") {
    throw ApiError.badRequest("This booking isn't eligible for a review");
  }
  // "Post-trip" is defined by the travel date having passed rather than a
  // status flag — nothing currently transitions a booking to "completed".
  if (new Date(booking.travelDate) > new Date()) {
    throw ApiError.badRequest("You can review this trip once your travel date has passed");
  }

  const existing = await Review.findOne({ bookingId: booking._id, tourId: booking.tourId });
  if (existing) throw ApiError.badRequest("You've already reviewed this trip");

  const review = await Review.create({
    tourId: booking.tourId,
    bookingId: booking._id,
    customerId: req.customer!.sub,
    rating,
    title,
    comment,
    photos: photos ?? [],
  });

  res.status(201).json({ item: review });
});

export const listForTour = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findOne({ slug: req.params.slug });
  if (!tour) throw ApiError.notFound("Tour not found");

  const reviews = await Review.find({ tourId: tour._id, status: "approved" })
    .populate("customerId", "name")
    .sort({ createdAt: -1 });

  res.json({
    items: reviews,
    summary: { rating: tour.rating, ratingCount: tour.ratingCount },
  });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await Review.find({ customerId: req.customer!.sub }).sort({ createdAt: -1 });
  res.json({ items: reviews });
});
