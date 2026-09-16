import { z } from "zod";

export const createReviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.coerce.number().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(1).max(2000),
  photos: z.array(z.string()).max(6).optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  moderationNote: z.string().trim().max(500).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
