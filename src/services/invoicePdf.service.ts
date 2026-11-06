import { rgb } from "pdf-lib";

import {
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  createPdfCtx,
  divider,
  drawFooter,
  embedLogo,
  inr,
  text,
  toPdfSafeText,
  wrap,
} from "./pdfKit.service.js";

type InvoiceLike = {
  bookingRef: string;
  paymentStatus: string;
  travelDate: Date;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  itinerarySnapshot: { title: string };
  pricing: {
    baseAmount: number;
    discountAmount: number;
    tcsAmount?: number;
    finalAmount: number;
    promoCode?: string;
    breakdown?: { type: string; categoryLabel?: string; count: number; unitPrice: number; subtotal: number }[];
  };
  amountPaid: number;
  // Every captured payment, oldest first — each gets its own line (reference =
  // Razorpay payment id, or the office's own reference for an in-person
  // payment) rather than just a single lump total.
  payments?: { date: Date; reference: string; amount: number }[];
};

/**
 * The payment document: company letterhead (logo/address/GSTIN), invoice
 * no/date, who's being billed, the itemised price, and every payment
 * received against it with its own payment id. No itinerary/traveller detail
 * — that's the separate trip-summary PDF (see tripSummaryPdf.service.ts).
 */
export async function renderInvoicePdf(booking: InvoiceLike): Promise<Uint8Array> {
  const ctx = await createPdfCtx();
  const logoImage = await embedLogo(ctx.doc);

  // Logo + registered office/GSTIN on the left, invoice no/date on the right —
  // two independent columns sharing a band above the title, so neither the
  // text() helper's left-margin flow nor its single-column advance fits. Both
  // are placed with direct coordinates first, then `y` drops clear of
  // whichever column is taller before the normal flow resumes.
  const logoWidth = 84;
  const logoHeight = logoImage ? (logoImage.height / logoImage.width) * logoWidth : 0;
  const logoTop = ctx.y;
  if (logoImage) {
    ctx.page.drawImage(logoImage, { x: ctx.margin, y: logoTop - logoHeight, width: logoWidth, height: logoHeight });
  }

  // wrap()'s "indent" param just subtracts from maxWidth — reused here to get
  // a narrower column (the address must not run under the invoice no/date on
  // the right) without a second wrapping implementation.
  const addressColumnWidth = 250;
  const addressLines = wrap(ctx, COMPANY_ADDRESS, ctx.font, 8, ctx.maxWidth - addressColumnWidth);
  let addrY = logoTop - logoHeight - 10;
  for (const line of addressLines) {
    ctx.page.drawText(toPdfSafeText(line, ctx.supported), { x: ctx.margin, y: addrY, size: 8, font: ctx.font, color: rgb(0.45, 0.45, 0.5) });
    addrY -= 10;
  }
  ctx.page.drawText(toPdfSafeText(`GSTIN: ${COMPANY_GSTIN}`, ctx.supported), {
    x: ctx.margin,
    y: addrY,
    size: 8,
    font: ctx.bold,
    color: rgb(0.45, 0.45, 0.5),
  });
  addrY -= 10;

  // Right column starts level with the logo's top and uses the same line
  // height as the address column (10pt leading after the first line) so both
  // columns read as one balanced band rather than two mismatched blocks.
  const invoiceId = `INV-${booking.bookingRef}`;
  const invoiceDate = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  let metaY = logoTop - 9;
  [`Invoice No: ${invoiceId}`, `Invoice Date: ${invoiceDate}`].forEach((line) => {
    const safe = toPdfSafeText(line, ctx.supported);
    const w = ctx.font.widthOfTextAtSize(safe, 10);
    ctx.page.drawText(safe, { x: ctx.page.getWidth() - ctx.margin - w, y: metaY, size: 10, font: ctx.font, color: rgb(0.4, 0.4, 0.45) });
    metaY -= 14;
  });

  ctx.y = Math.min(addrY, metaY) - 14;

  text(ctx, "Flying Leader — Trip Invoice", { size: 20, bold: true, gap: 24 });
  text(ctx, `Booking Ref: ${booking.bookingRef}`, { bold: true });
  const paymentColor: [number, number, number] =
    booking.paymentStatus === "paid"
      ? [0.1, 0.5, 0.2]
      : booking.paymentStatus === "partial"
        ? [0.7, 0.45, 0]
        : booking.paymentStatus === "refunded" || booking.paymentStatus === "refund_initiated"
          ? [0.7, 0.2, 0.2]
          : [0.5, 0.5, 0.5];
  text(ctx, `Payment: ${booking.paymentStatus.replace("_", " ").toUpperCase()}`, { bold: true, color: paymentColor, gap: 22 });
  divider(ctx);

  text(ctx, "Billed To", { size: 12, bold: true, gap: 18 });
  text(ctx, booking.contactName);
  text(ctx, booking.contactEmail);
  text(ctx, booking.contactPhone);
  text(ctx, `For: ${booking.itinerarySnapshot.title}`, { gap: 16 });
  text(ctx, `Travel date: ${new Date(booking.travelDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`);
  divider(ctx);

  text(ctx, "Charges", { size: 13, bold: true, gap: 20 });
  if (booking.pricing.breakdown && booking.pricing.breakdown.length > 0) {
    for (const line of booking.pricing.breakdown) {
      const label = line.categoryLabel || line.type.charAt(0).toUpperCase() + line.type.slice(1);
      text(ctx, `${line.count} x ${label} @ ${inr(line.unitPrice)} = ${inr(line.subtotal)}`, { size: 10 });
    }
  } else {
    text(ctx, `Package amount: ${inr(booking.pricing.baseAmount)}`);
  }
  if (booking.pricing.discountAmount > 0) {
    text(ctx, `Discount${booking.pricing.promoCode ? ` (${booking.pricing.promoCode})` : ""}: -${inr(booking.pricing.discountAmount)}`);
  }
  if (booking.pricing.tcsAmount) {
    text(ctx, `TCS (2%): ${inr(booking.pricing.tcsAmount)}`);
  }
  text(ctx, `Total Package Amount: ${inr(booking.pricing.finalAmount)}`, { bold: true, gap: 22 });

  if (booking.payments && booking.payments.length > 0) {
    divider(ctx);
    text(ctx, "Payments Received", { size: 13, bold: true, gap: 20 });
    for (const p of booking.payments) {
      const when = new Date(p.date).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
      text(ctx, `${when} — ${inr(p.amount)} — Payment ID: ${p.reference}`, { size: 10 });
    }
  }

  divider(ctx);
  text(ctx, `Amount Paid: ${inr(booking.amountPaid)}`, { bold: true });
  const balance = Math.max(0, booking.pricing.finalAmount - booking.amountPaid);
  text(ctx, `Remaining Balance: ${inr(balance)}`, { bold: true, color: balance > 0 ? [0.7, 0.35, 0] : [0.1, 0.5, 0.2] });

  drawFooter(ctx);
  return ctx.doc.save();
}
