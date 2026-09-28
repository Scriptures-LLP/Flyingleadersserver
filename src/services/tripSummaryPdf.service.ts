import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type BookingLike = {
  bookingRef: string;
  status: string;
  paymentStatus: string;
  travelDate: Date;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  travellers: { name: string; type: string; age?: number }[];
  pricing: { baseAmount: number; discountAmount: number; finalAmount: number; promoCode?: string };
  amountPaid: number;
  itinerarySnapshot: { title: string; duration?: string; inclusions?: string; exclusions?: string; itinerary?: string };
};

const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ",
};

// pdf-lib draws plain text only — the admin's rich-text fields are stored as
// HTML, so this recovers readable plain text (block tags become line
// breaks, <li> gets a bullet) rather than dumping raw markup into the PDF.
function htmlToLines(html: string): string[] {
  const withBreaks = html
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e) => HTML_ENTITIES[e] ?? "");
  return withBreaks
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Symbols admins commonly type that the PDF's built-in fonts have no glyph for.
const SYMBOL_FALLBACKS: Record<string, string> = {
  "₹": "Rs. ", "✓": "-", "✔": "-", "✅": "-", "✗": "x", "✘": "x", "❌": "x", "→": "->", "←": "<-", "★": "*", "☆": "*",
  "\u2011": "-", "\u2212": "-", "\u2009": " ", "\u200a": " ", "\u202f": " ",
};

/**
 * The built-in PDF fonts only cover Latin-1 ("WinAnsi") and pdf-lib THROWS on
 * any other character — one emoji in a tour's itinerary (the admin's editor
 * lets them type freely) would make the whole download fail. So everything
 * headed for the page goes through here first: known symbols are swapped for a
 * plain equivalent, accents are folded when the letter itself isn't covered,
 * invisible/emoji characters are dropped, and any letter still unsupported
 * (e.g. a Devanagari name) shows as "?" rather than breaking the document.
 */
export function toPdfSafeText(input: string, supported: Set<number>): string {
  let out = "";
  for (const ch of input.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (supported.has(cp) && cp >= 0x20) {
      out += ch;
      continue;
    }
    const swap = SYMBOL_FALLBACKS[ch];
    if (swap !== undefined) {
      out += swap;
      continue;
    }
    if (ch === "\t") {
      out += " ";
      continue;
    }
    const folded = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    if (folded !== ch && [...folded].every((c) => supported.has(c.codePointAt(0)!))) {
      out += folded;
      continue;
    }
    // Emoji, variation selectors, joiners, other symbols, control characters: drop.
    if (/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Cf}\p{Cc}\p{So}\p{Sk}\p{Mn}\p{Me}]/u.test(ch)) continue;
    // A real letter we can't draw: keep the gap visible.
    out += "?";
  }
  return out.replace(/ {2,}/g, " ").trim();
}

export async function renderTripSummaryPdf(booking: BookingLike): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());

  let page = doc.addPage([595.28, 841.89]); // A4
  const margin = 50;
  let y = page.getHeight() - margin;
  const lineGap = 18;

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = doc.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
    }
  }

  const maxWidth = page.getWidth() - margin * 2;

  // Breaks a line into pieces that fit the page width, at word boundaries
  // (a single word longer than the line is split by characters).
  function wrap(str: string, f: typeof font, size: number, indent: number): string[] {
    const width = maxWidth - indent;
    const lines: string[] = [];
    let current = "";
    for (const word of str.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      let rest = word;
      while (f.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && f.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    if (current) lines.push(current);
    return lines;
  }

  function text(str: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const gap = opts.gap ?? lineGap;
    const f = opts.bold ? bold : font;
    const safe = toPdfSafeText(str, supported);
    // Bullet lines hang their wrapped continuation under the text, not the bullet.
    const indent = safe.startsWith("\u2022 ") ? f.widthOfTextAtSize("\u2022 ", size) : 0;
    const pieces = wrap(safe, f, size, indent);
    // A wrapped line packs tighter than the gap that separates paragraphs.
    const lineHeight = pieces.length > 1 ? Math.min(gap, size + 4) : gap;
    pieces.forEach((piece, i) => {
      const last = i === pieces.length - 1;
      ensureSpace(size + (last ? gap : lineHeight));
      page.drawText(piece, {
        x: margin + (i > 0 ? indent : 0),
        y,
        size,
        font: f,
        color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12),
      });
      y -= last ? gap : lineHeight;
    });
  }

  function divider() {
    ensureSpace(14);
    page.drawLine({
      start: { x: margin, y },
      end: { x: page.getWidth() - margin, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 14;
  }

  text("Flying Leader — Trip Summary", { size: 20, bold: true, gap: 26 });
  text(`Booking Ref: ${booking.bookingRef}`, { bold: true });
  text(`Status: ${booking.status.replace("_", " ")}  ·  Payment: ${booking.paymentStatus.replace("_", " ")}`);
  divider();

  text(booking.itinerarySnapshot.title, { size: 15, bold: true, gap: 22 });
  if (booking.itinerarySnapshot.duration) text(`Duration: ${booking.itinerarySnapshot.duration}`);
  text(`Travel date: ${new Date(booking.travelDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`);
  divider();

  text("Contact", { size: 13, bold: true, gap: 20 });
  text(booking.contactName);
  text(booking.contactEmail);
  text(booking.contactPhone);
  divider();

  text(`Travellers (${booking.travellers.length})`, { size: 13, bold: true, gap: 20 });
  for (const t of booking.travellers) {
    text(`${t.name} — ${t.type}${t.age !== undefined ? `, age ${t.age}` : ""}`);
  }
  divider();

  text("Payment", { size: 13, bold: true, gap: 20 });
  text(`Package amount: ${inr(booking.pricing.baseAmount)}`);
  if (booking.pricing.discountAmount > 0) {
    text(`Discount${booking.pricing.promoCode ? ` (${booking.pricing.promoCode})` : ""}: -${inr(booking.pricing.discountAmount)}`);
  }
  text(`Total Package Amount: ${inr(booking.pricing.finalAmount)}`, { bold: true });
  text(`Amount Paid: ${inr(booking.amountPaid)}`, { bold: true });
  const balance = Math.max(0, booking.pricing.finalAmount - booking.amountPaid);
  text(`Remaining Balance: ${inr(balance)}`, { bold: true, color: balance > 0 ? [0.7, 0.35, 0] : [0.1, 0.5, 0.2] });

  if (booking.itinerarySnapshot.itinerary) {
    divider();
    text("Itinerary", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.itinerary)) {
      text(line, { size: 10 });
    }
  }

  if (booking.itinerarySnapshot.inclusions) {
    divider();
    text("Inclusions", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.inclusions)) {
      text(line, { size: 10 });
    }
  }

  if (booking.itinerarySnapshot.exclusions) {
    divider();
    text("Exclusions", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.exclusions)) {
      text(line, { size: 10 });
    }
  }

  ensureSpace(30);
  page.drawText(toPdfSafeText(`Generated ${new Date().toLocaleString("en-IN")} — Flying Leader`, supported), {
    x: margin,
    y: margin - 10,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  return doc.save();
}
