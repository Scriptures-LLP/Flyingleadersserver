import { Setting } from "../models/Setting.js";

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

// Hosts each platform's link may point at — so a typo (or a pasted link to the
// wrong network) can't send customers somewhere unexpected.
const HOSTS: Record<SocialPlatform, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com", "lnkd.in"],
};

export const socialSettingKey = (platform: SocialPlatform) => `social_${platform}`;

/**
 * The link as a clean https URL, or null when it isn't a usable link for that
 * platform (empty, not http(s), or on another site). "instagram.com/flyingleader"
 * without a scheme is accepted and completed.
 */
export function cleanSocialUrl(platform: SocialPlatform, raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`))) return null;
  url.protocol = "https:";
  return url.toString();
}

/** The official pages the business has set in admin Settings; platforms without a valid link are left out. */
export async function getSocialLinks(): Promise<SocialLinks> {
  const rows = await Setting.find({ key: { $in: SOCIAL_PLATFORMS.map(socialSettingKey) } }).lean();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const links: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = cleanSocialUrl(platform, byKey.get(socialSettingKey(platform)));
    if (url) links[platform] = url;
  }
  return links;
}
