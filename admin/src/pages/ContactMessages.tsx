import { useQuery } from "@tanstack/react-query";

import { Pagination, usePagination } from "../components/Pagination";
import { api, apiErrorMessage } from "../lib/api";

type ContactMessage = {
  _id: string;
  source: "website";
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "seen" | "archived";
  createdAt: string;
};

const STATUS_STYLE: Record<ContactMessage["status"], string> = {
  new: "bg-red-50 text-red-700",
  seen: "bg-green-50 text-green-700",
  archived: "bg-neutral-100 text-neutral-500",
};

export function ContactMessagesPage() {
  const { data: messages, isLoading, error } = useQuery({
    queryKey: ["/admin/contact-messages"],
    queryFn: async () => (await api.get("/admin/contact-messages")).data.items as ContactMessage[],
  });

  const pager = usePagination(messages, 10);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Contact Messages</h1>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      <div className="flex flex-col gap-3">
        {pager.pageItems.map((m) => (
          <div key={m._id} className="rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">
                  {m.name} <span className="ml-1 text-xs font-semibold text-neutral-500">[Website]</span>
                </p>
                <p className="text-xs text-neutral-500">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""} · {new Date(m.createdAt).toLocaleString("en-IN")}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>
                {m.status}
              </span>
            </div>
            {m.subject && <p className="font-medium text-neutral-800">{m.subject}</p>}
            <p className="whitespace-pre-line text-sm text-neutral-700">{m.message}</p>
          </div>
        ))}
        {messages?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </div>

      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            total={pager.total}
            pageSize={pager.pageSize}
            onPage={pager.setPage}
            label="messages"
          />
        </div>
      )}
    </div>
  );
}
