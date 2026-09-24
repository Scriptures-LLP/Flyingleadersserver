import type { Request, Response } from "express";

import { Customer } from "../../models/Customer.js";
import { PushCampaign } from "../../models/PushCampaign.js";
import { Tour } from "../../models/Tour.js";
import { resolveAudience, type AudienceSpec } from "../../services/audience.service.js";
import { deliverToCustomers, type PushCategory } from "../../services/push.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// How many people a message would reach, before it's sent — so an admin can see
// "this goes to 42 customers, 31 phones" rather than send blind.
export const preview = asyncHandler(async (req: Request, res: Response) => {
  const { category, ...spec } = req.query as unknown as AudienceSpec & { category: PushCategory };
  const { audience, recipients, devices } = await resolveAudience(spec, category);
  res.json({
    audience, // customers matching the description
    recipients: recipients.length, // …who haven't switched this kind of notification off
    optedOut: audience - recipients.length,
    devices, // of those, phones we can push to right now (the rest see it in their in-app inbox)
  });
});

export const send = asyncHandler(async (req: Request, res: Response) => {
  const { title, body, category, audience, opens, tourSlug } = req.body as {
    title: string;
    body: string;
    category: PushCategory;
    audience: AudienceSpec;
    opens: "home" | "tour" | "trips" | "referral";
    tourSlug?: string;
  };

  if (opens === "tour") {
    if (!tourSlug || !(await Tour.exists({ slug: tourSlug, isActive: true }))) {
      throw ApiError.badRequest("Choose an active tour for the notification to open");
    }
  }
  const data = opens === "tour" ? { screen: "tour", tourSlug } : { screen: opens };

  const { audience: matched, recipients } = await resolveAudience(audience, category);
  if (recipients.length === 0) {
    throw ApiError.badRequest(
      matched === 0
        ? "No customers match that audience"
        : "Everyone in that audience has switched this kind of notification off",
    );
  }

  const campaign = await PushCampaign.create({ title, body, category, audience, data, sentBy: req.admin!.sub });
  const stats = await deliverToCustomers(recipients, { title, body, category, data, campaignId: String(campaign._id) });
  campaign.stats = { audience: matched, ...stats };
  await campaign.save();

  res.status(201).json({ item: campaign });
});

export const history = asyncHandler(async (_req: Request, res: Response) => {
  const items = await PushCampaign.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("sentBy", "name")
    .populate("audience.tourId", "title")
    .populate("audience.customerId", "name");
  res.json({ items });
});

// A few customers at a time, for the "send to one customer" picker.
export const findCustomers = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ items: [] });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const items = await Customer.find({ isActive: true, $or: [{ name: rx }, { email: rx }, { phone: rx }] })
    .select("name email phone")
    .limit(8);
  res.json({ items });
});
