import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

type Customer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  authProvider: string;
  isActive: boolean;
  createdAt: string;
};

export function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ["/admin/customers", search],
    queryFn: async () => (await api.get("/admin/customers", { params: { search: search || undefined } })).data.items as Customer[],
  });

  const toggleActive = useMutation({
    mutationFn: async (c: Customer) => api.patch(`/admin/customers/${c.id}/active`, { isActive: !c.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/customers"] }),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Customers</h1>
        <input
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-red-500"
        />
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {customers && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Signed up</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-700">{c.name}</td>
                  <td className="px-4 py-2 text-slate-700">{c.email ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.isActive ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {c.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => toggleActive.mutate(c)}
                      className="text-slate-600 hover:underline"
                    >
                      {c.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
