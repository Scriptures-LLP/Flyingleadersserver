import { createPdfCtx, divider, drawFooter, drawSimpleHeader, embedLogo, htmlToLines, text } from "./pdfKit.service.js";

type TripSummaryLike = {
  bookingRef: string;
  status: string;
  travelDate: Date;
  contactName: string;
  contactEmail?: string;
  contactPhone: string;
  travellers: { name: string; type: string; age?: number }[];
  itinerarySnapshot: {
    title: string;
    duration?: string;
    inclusions?: string;
    exclusions?: string;
    itinerary?: string;
    // Admin free-text (HTML) flight & hotel info, copied from the tour. These are
    // rich-text blocks, not structured fields — there is no separate airline /
    // flight-number / confirmation-number model, so the PDF renders exactly what
    // the admin wrote and never fabricates booking references.
    flightDetails?: string;
    hotelDetails?: string;
  };
};

/**
 * The trip-content document: what's being travelled, who's travelling, and
 * the itinerary/flights/hotels — no pricing or payment detail (that's the
 * separate invoice PDF, see invoicePdf.service.ts). Customers get this for
 * trip planning; it reads the same whether the balance is fully paid or not.
 */
export async function renderTripSummaryPdf(booking: TripSummaryLike): Promise<Uint8Array> {
  const ctx = await createPdfCtx();
  const logoImage = await embedLogo(ctx.doc);
  drawSimpleHeader(ctx, logoImage);

  text(ctx, "Flying Leader — Trip Summary", { size: 20, bold: true, gap: 26 });
  text(ctx, `Booking Ref: ${booking.bookingRef}`, { bold: true });
  text(ctx, `Status: ${booking.status.replace("_", " ")}`);
  divider(ctx);

  text(ctx, booking.itinerarySnapshot.title, { size: 15, bold: true, gap: 22 });
  if (booking.itinerarySnapshot.duration) text(ctx, `Duration: ${booking.itinerarySnapshot.duration}`);
  text(ctx, `Travel date: ${new Date(booking.travelDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`);
  divider(ctx);

  text(ctx, "Contact", { size: 13, bold: true, gap: 20 });
  text(ctx, booking.contactName);
  if (booking.contactEmail) text(ctx, booking.contactEmail);
  text(ctx, booking.contactPhone);
  divider(ctx);

  text(ctx, `Travellers (${booking.travellers.length})`, { size: 13, bold: true, gap: 20 });
  for (const t of booking.travellers) {
    text(ctx, `${t.name} — ${t.type}${t.age !== undefined ? `, age ${t.age}` : ""}`);
  }

  if (booking.itinerarySnapshot.flightDetails) {
    divider(ctx);
    text(ctx, "Flights", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.flightDetails)) {
      text(ctx, line, { size: 10 });
    }
  }

  if (booking.itinerarySnapshot.hotelDetails) {
    divider(ctx);
    text(ctx, "Hotels", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.hotelDetails)) {
      text(ctx, line, { size: 10 });
    }
  }

  if (booking.itinerarySnapshot.itinerary) {
    divider(ctx);
    text(ctx, "Itinerary", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.itinerary)) {
      // The admin writes each day as its own plain-text line ("Day 1 |
      // Welcome to Hanoi") with nothing marking it up as a heading, so the
      // whole itinerary used to read as one undifferentiated block. Detecting
      // that pattern here — instead of asking every admin to remember to
      // format it — makes each day's start visibly stand out.
      // Not anchored to the start: admins often lead the line with an emoji
      // (dropped later by the PDF's own text sanitizing, not here).
      const isDayHeader = /\bday\s*\d+\b/i.test(line);
      text(ctx, line, isDayHeader ? { size: 12, bold: true, gap: 16 } : { size: 10 });
    }
  }

  if (booking.itinerarySnapshot.inclusions) {
    divider(ctx);
    text(ctx, "Inclusions", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.inclusions)) {
      text(ctx, line, { size: 10 });
    }
  }

  if (booking.itinerarySnapshot.exclusions) {
    divider(ctx);
    text(ctx, "Exclusions", { size: 13, bold: true, gap: 20 });
    for (const line of htmlToLines(booking.itinerarySnapshot.exclusions)) {
      text(ctx, line, { size: 10 });
    }
  }

  drawFooter(ctx);
  return ctx.doc.save();
}
