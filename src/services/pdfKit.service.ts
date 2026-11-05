import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from "pdf-lib";

/**
 * Shared PDF-drawing primitives for the booking documents (trip summary,
 * invoice). Both documents need the same page/text/wrap machinery and the
 * same Flying Leader branding, so it lives once here instead of twice.
 */

export const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

export const COMPANY_ADDRESS = "3rd Floor, Mohali Citi Square, SCO 04, Patiala Rd, Zirakpur, Nabha, Punjab 140603";
export const COMPANY_GSTIN = "03AAFCF2576G1ZT";

// Read once at module load (not per-PDF) — the file never changes at runtime.
// Missing asset degrades to a text-only header rather than failing the download.
// Resolved via the repo root (not just "../assets") because tsc's build output
// (dist/services/...) never gets this PNG copied alongside it — only src/ does
// — so the path has to walk back out to the root and into src/ either way,
// whether this file is running compiled (dist/services) or directly via tsx (src/services).
const LOGO_BYTES = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "../../src/assets/flying-leader-logo.png"));
  } catch {
    return null;
  }
})();

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ",
};

// pdf-lib draws plain text only — the admin's rich-text fields are stored as
// HTML, so this recovers readable plain text (block tags become line
// breaks, <li> gets a bullet) rather than dumping raw markup into the PDF.
export function htmlToLines(html: string): string[] {
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
  "‑": "-", "−": "-", " ": " ", " ": " ", " ": " ",
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
    const folded = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
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

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4
const MARGIN = 50;
const LINE_GAP = 18;

export type PdfCtx = {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  supported: Set<number>;
  page: PDFPage;
  margin: number;
  y: number;
  maxWidth: number;
};

/** One shared doc/font/page setup so both documents look and wrap identically. */
export async function createPdfCtx(): Promise<PdfCtx> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const page = doc.addPage(PAGE_SIZE);
  const margin = MARGIN;
  return { doc, font, bold, supported, page, margin, y: page.getHeight() - margin, maxWidth: page.getWidth() - margin * 2 };
}

export async function embedLogo(doc: PDFDocument): Promise<PDFImage | null> {
  if (!LOGO_BYTES) return null;
  return doc.embedPng(LOGO_BYTES).catch(() => null);
}

export function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y - needed < ctx.margin) {
    ctx.page = ctx.doc.addPage(PAGE_SIZE);
    ctx.y = ctx.page.getHeight() - ctx.margin;
  }
}

// Breaks a line into pieces that fit the page width, at word boundaries (a
// single word longer than the line is split by characters). `indent` also
// doubles as a generic "narrow the available width by this much" knob for
// columns that aren't the full page width (see the invoice's address block).
export function wrap(ctx: PdfCtx, str: string, f: PDFFont, size: number, indent: number): string[] {
  const width = ctx.maxWidth - indent;
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

export function text(
  ctx: PdfCtx,
  str: string,
  opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {},
) {
  const size = opts.size ?? 11;
  const gap = opts.gap ?? LINE_GAP;
  const f = opts.bold ? ctx.bold : ctx.font;
  const safe = toPdfSafeText(str, ctx.supported);
  // Bullet lines hang their wrapped continuation under the text, not the bullet.
  const indent = safe.startsWith("• ") ? f.widthOfTextAtSize("• ", size) : 0;
  const pieces = wrap(ctx, safe, f, size, indent);
  // A wrapped line packs tighter than the gap that separates paragraphs.
  const lineHeight = pieces.length > 1 ? Math.min(gap, size + 4) : gap;
  pieces.forEach((piece, i) => {
    const last = i === pieces.length - 1;
    ensureSpace(ctx, size + (last ? gap : lineHeight));
    ctx.page.drawText(piece, {
      x: ctx.margin + (i > 0 ? indent : 0),
      y: ctx.y,
      size,
      font: f,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12),
    });
    ctx.y -= last ? gap : lineHeight;
  });
}

export function divider(ctx: PdfCtx) {
  ensureSpace(ctx, 14);
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end: { x: ctx.page.getWidth() - ctx.margin, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  ctx.y -= 14;
}

export function drawFooter(ctx: PdfCtx) {
  ensureSpace(ctx, 30);
  ctx.page.drawText(toPdfSafeText(`Generated ${new Date().toLocaleString("en-IN")} — Flying Leader`, ctx.supported), {
    x: ctx.margin,
    y: ctx.margin - 10,
    size: 8,
    font: ctx.font,
    color: rgb(0.6, 0.6, 0.6),
  });
}

/**
 * Logo top-left + document title/ref directly below it. Used by the trip
 * summary, which has no second header column — the invoice draws its own
 * (logo + address/GSTIN on the left, invoice no/date on the right) since
 * that layout doesn't generalise cleanly to a single helper.
 */
export function drawSimpleHeader(ctx: PdfCtx, logoImage: PDFImage | null, logoWidth = 84) {
  const logoHeight = logoImage ? (logoImage.height / logoImage.width) * logoWidth : 0;
  if (logoImage) {
    ctx.page.drawImage(logoImage, { x: ctx.margin, y: ctx.y - logoHeight, width: logoWidth, height: logoHeight });
  }
  ctx.y -= logoHeight + (logoImage ? 14 : 0);
}
