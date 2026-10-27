import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

/**
 * Manual WhatsApp send via Gupshup — for booking/payment confirmations or any
 * other one-off notice ("on purchase or any other task", per the brief). Needs
 * an already-approved Gupshup template: WhatsApp only allows free text inside
 * a 24h window after the customer last messaged the business, so anything
 * outside that must go through a template Meta has approved via Gupshup's
 * console. Params fill the template's {{1}}, {{2}}… placeholders in order.
 */
export function WhatsAppNotifyPage() {
  const [phone, setPhone] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [paramsText, setParamsText] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const params = paramsText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      return api.post("/admin/whatsapp/send", { phone: phone.trim(), templateId: templateId.trim(), params });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send.reset();
    send.mutate();
  };

  return (
    <div className="max-w-xl">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-green-500 to-green-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">WhatsApp Notify</h1>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Send a one-off WhatsApp message to a customer — booking confirmed, payment received, or anything else.
        Needs a template already approved on Gupshup; find its Template ID (a UUID, not its display name) under the{" "}
        <span className="font-medium text-neutral-700">flyingleadersupport</span> app's Templates list.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Customer's mobile number</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Gupshup Template ID</label>
          <input
            className="input"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="e.g. 6f1a2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Template values — one per line, in order ({"{{1}}"}, {"{{2}}"}…)
          </label>
          <textarea
            className="input min-h-[96px]"
            value={paramsText}
            onChange={(e) => setParamsText(e.target.value)}
            placeholder={"Ranjeet Singh\nPhuket & Krabi 4N/5D\n₹79,000"}
          />
        </div>

        {send.isError && <p className="text-sm text-red-600">{apiErrorMessage(send.error)}</p>}
        {send.isSuccess && <p className="text-sm text-green-600">Sent.</p>}

        <button
          type="submit"
          disabled={send.isPending}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {send.isPending ? "Sending…" : "Send WhatsApp Message"}
        </button>
      </form>
    </div>
  );
}
