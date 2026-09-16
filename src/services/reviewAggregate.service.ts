import { Types } from "mongoose";

import { Review } from "../models/Review.js";
import { Tour } from "../models/Tour.js";

// Recomputes a tour's displayed rating from its approved reviews. Called
// after every moderation decision rather than kept as a running counter —
// review volume is low enough that a full aggregate each time is simpler
// and can't drift out of sync.
export async function recomputeTourRating(tourId: string): Promise<void> {
  const [agg] = await Review.aggregate([
    { $match: { tourId: new Types.ObjectId(tourId), status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  if (!agg || agg.count === 0) {
    // No approved reviews yet — leave the placeholder rating alone, just
    // make sure the count reflects reality.
    await Tour.findByIdAndUpdate(tourId, { ratingCount: 0 });
    return;
  }

  await Tour.findByIdAndUpdate(tourId, {
    rating: Math.round(agg.avg * 10) / 10,
    ratingCount: agg.count,
  });
}
