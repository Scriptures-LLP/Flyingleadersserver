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

export async function renderTripSummaryPdf(booking: BookingLike): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

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

  function text(str: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 11;
    ensureSpace(size + (opts.gap ?? lineGap));
    page.drawText(str, {
      x: margin,
      y,
      size,
      font: opts.bold ? bold : font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12),
    });
    y -= opts.gap ?? lineGap;
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
  page.drawText(`Generated ${new Date().toLocaleString("en-IN")} — Flying Leader`, {
    x: margin,
    y: margin - 10,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  return doc.save();
}
