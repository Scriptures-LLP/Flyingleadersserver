// Parses a free-text / HTML itinerary (the single rich-text string an admin
// authors in the Tours form) into day-by-day chunks, so the server can resolve
// a representative photo per day. This mirrors the app's parseItineraryDays
// (flying-leader-app/src/utils/tours/itinerary.ts) so both sides agree on what
// "a day" is and can key images to it — but works on plain text (day number +
// title + description) rather than producing renderable HTML.

export type ItineraryDay = {
  /** 0-based position in the itinerary (fallback identity for day-less chunks). */
  index: number;
  /** The "Day N" number when present, else null (free-form chunk). */
  day: number | null;
  /** The day's heading text, with the leading "Day N -" stripped. */
  title: string;
  /** The rest of the day's content as plain text (used as fallback context). */
  description: string;
};

// Block-level tags become line breaks so "Day 1" headings land on their own
// line; everything else is stripped to plain text.
const BLOCK_TAG_RE = /<\/(?:p|div|h[1-6]|li|ul|ol|tr|table|section)>|<br\s*\/?>/gi;
const TAG_RE = /<[^>]+>/g;
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&#39;": "'",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&quot;": '"',
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&ndash;": "–",
  "&mdash;": "—",
};

function htmlToText(html: string): string {
  return html
    .replace(BLOCK_TAG_RE, "\n")
    .replace(TAG_RE, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/[ \t ]+/g, " ")
    // Ensure a "Day N" that sits mid-line (several days in one paragraph) starts
    // its own line, so each is detected as a separate day.
    .replace(/([^\n])\s(day\s*\d+\b)/gi, "$1\n$2")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

// A line that begins with "Day N" (optionally zero-padded), followed by the
// usual separators admins type between the label and the title.
const DAY_LINE_RE = /^day\s*0*(\d+)\b[\s:.\-–—|)]*/i;

/**
 * Splits an itinerary into day chunks. Returns [] when there are no "Day N"
 * markers (free-form itinerary) — callers then fall back to the package image,
 * so content that doesn't follow the day convention is never mis-handled.
 */
export function parseItineraryDays(raw?: string | null): ItineraryDay[] {
  if (!raw) return [];
  const text = htmlToText(raw);
  if (!text) return [];

  const lines = text.split("\n");
  const days: ItineraryDay[] = [];
  const bodies: string[][] = [];

  for (const line of lines) {
    const m = DAY_LINE_RE.exec(line);
    if (m) {
      days.push({
        index: days.length,
        day: Number(m[1]),
        title: line.slice(m[0].length).trim(),
        description: "",
      });
      bodies.push([]);
    } else if (days.length > 0) {
      bodies[bodies.length - 1]!.push(line);
    }
  }

  if (days.length === 0) return [];

  days.forEach((d, i) => {
    const body = bodies[i]!;
    // Some admins put the title on the line *after* "Day N" — promote it.
    if (!d.title && body.length > 0) d.title = body.shift()!.trim();
    d.description = body.join(" ").trim();
  });

  return days;
}
