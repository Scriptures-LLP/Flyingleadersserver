import type { Request, Response } from "express";

// Expo Go can't load a native Razorpay Checkout SDK (it's a third-party
// native module, unavailable outside a custom dev client). Instead the app
// opens this page in an in-app browser (expo-web-browser's auth session) and
// gets control back via a `flyingleader://payment-callback` redirect once
// Razorpay's own hosted Checkout.js finishes — no native dependency needed.
export function checkoutPage(req: Request, res: Response) {
  const { order_id, amount, key, name, email, contact, booking_id } = req.query as Record<string, string>;
  if (!order_id || !amount || !key || !booking_id) {
    res.status(400).send("Missing required checkout parameters");
    return;
  }

  const callbackBase = `flyingleader://payment-callback?booking_id=${encodeURIComponent(booking_id)}`;

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#fff;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#666">
  <div>Opening secure payment&hellip;</div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var options = {
      key: ${JSON.stringify(key)},
      amount: ${JSON.stringify(amount)},
      currency: "INR",
      order_id: ${JSON.stringify(order_id)},
      name: "Flying Leader",
      prefill: { name: ${JSON.stringify(name || "")}, email: ${JSON.stringify(email || "")}, contact: ${JSON.stringify(contact || "")} },
      handler: function (response) {
        window.location.href = ${JSON.stringify(callbackBase)} +
          "&status=success" +
          "&razorpay_order_id=" + encodeURIComponent(response.razorpay_order_id) +
          "&razorpay_payment_id=" + encodeURIComponent(response.razorpay_payment_id) +
          "&razorpay_signature=" + encodeURIComponent(response.razorpay_signature);
      },
      modal: {
        ondismiss: function () {
          window.location.href = ${JSON.stringify(callbackBase)} + "&status=failed&razorpay_order_id=" + ${JSON.stringify(order_id)};
        },
      },
    };
    var rzp = new Razorpay(options);
    rzp.on("payment.failed", function () {
      window.location.href = ${JSON.stringify(callbackBase)} + "&status=failed&razorpay_order_id=" + ${JSON.stringify(order_id)};
    });
    rzp.open();
  </script>
</body>
</html>`);
}
