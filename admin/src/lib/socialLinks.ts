// Mirrors the server's cleanSocialUrl (src/services/socialLinks.service.ts) so the
// Settings form can say "that isn't an Instagram link" before saving. The server
// re-checks everything it sends to the app, so this is for feedback, not security.
export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], placeholder: "https://www.instagram.com/your-page" },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], placeholder: "https://www.facebook.com/your-page" },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], placeholder: "https://www.youtube.com/@your-channel" },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"], placeholder: "https://www.linkedin.com/company/your-page" },
] as const;

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]["key"];

/** The link as a clean https URL, or null if it isn't a usable link for that platform. */
export function cleanSocialUrl(key: SocialKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key)!;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!platform.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  url.protocol = "https:";
  return url.toString();
}
