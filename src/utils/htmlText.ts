const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/**
 * Readable plain text from tour content, which is either rich-text HTML or (for
 * older content) already plain text. Block tags become line breaks and list
 * items get a bullet, so structure survives; `maxChars` keeps it a sensible size
 * to hand to a language model.
 */
export function htmlToText(html: string | null | undefined, maxChars = 2000): string {
  if (!html) return "";
  const text = html
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}
