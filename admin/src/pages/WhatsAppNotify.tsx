import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

type CreateTemplateResponse = {
  ok: boolean;
  httpStatus: number;
  gupshupResponse: { template?: { id?: string; status?: string }; message?: string };
};

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;

/**
 * Submits a brand-new template to Gupshup for Meta's approval, so an admin
 * never has to leave this panel to create one. Experimental: built against a
 * Gupshup endpoint shape that wasn't confirmed against current docs, so the
 * full raw response is shown on both success and failure rather than a
 * generic message — if Gupshup ever rejects something, the real reason is
 * right here to act on.
 */
function CreateTemplateForm() {
  const [elementName, setElementName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("UTILITY");
  const [content, setContent] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [footer, setFooter] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const sampleValues = sampleText
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
      const res = await api.post("/admin/whatsapp/templates", {
        elementName: elementName.trim(),
        category,
        content: content.trim(),
        sampleValues,
        footer: footer.trim() || undefined,
      });
      return res.data as CreateTemplateResponse;
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.reset();
    create.mutate();
  };

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-base font-semibold text-neutral-900">Create a New Template</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Submits a new template to Gupshup for Meta's approval. Business-initiated messages always need an approved
        template — this just saves the trip to Gupshup's own dashboard to create one.
      </p>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Template name</label>
          <input
            className="input"
            value={elementName}
            onChange={(e) => setElementName(e.target.value)}
            placeholder="e.g. booking_confirmed"
            pattern="[a-z0-9_]+"
            title="Lowercase letters, numbers and underscores only."
            required
          />
          <p className="mt-1 text-xs text-neutral-400">Lowercase letters, numbers and underscores only.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Category</label>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Message content — use {"{{1}}"}, {"{{2}}"}… for values that'll be filled in at send time
          </label>
          <textarea
            className="input min-h-[80px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Hi {{1}}, your booking for {{2}} is confirmed."
            maxLength={1024}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Sample values — one per line, in order, so Meta's reviewers can see what the message will look like
          </label>
          <textarea
            className="input min-h-[72px]"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder={"Ranjeet Singh\nPhuket & Krabi 4N/5D"}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Footer (optional)</label>
          <input className="input" value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} />
        </div>

        {create.isError && <p className="text-sm text-red-600">{apiErrorMessage(create.error)}</p>}
        {create.isSuccess && (
          <div className="rounded-md bg-neutral-50 p-3 text-sm">
            {create.data.ok && create.data.gupshupResponse.template ? (
              <p className="text-green-700">
                Submitted — status <strong>{create.data.gupshupResponse.template.status}</strong>. Template ID:{" "}
                <code className="rounded bg-neutral-200 px-1">{create.data.gupshupResponse.template.id}</code>
              </p>
            ) : (
              <p className="text-red-600">Gupshup rejected this: {JSON.stringify(create.data.gupshupResponse)}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {create.isPending ? "Submitting…" : "Submit for Approval"}
        </button>
      </form>
    </div>
  );
}

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

      <CreateTemplateForm />
    </div>
  );
}
