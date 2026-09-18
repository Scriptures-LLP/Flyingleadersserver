import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

type Person = { _id: string; name: string; email?: string } | string;

type Referral = {
  _id: string;
  referrerCustomerId?: Person;
  refereeCustomerId?: Person;
  referralCode: string;
  status: "pending" | "qualified" | "rewarded";
  rewardAmount?: number;
  createdAt: string;
};

type Wallet = { _id: string; customerId?: Person; balance: number };

const STATUS_STYLE: Record<Referral["status"], string> = {
  pending: "bg-slate-100 text-slate-600",
  qualified: "bg-red-50 text-red-700",
  rewarded: "bg-slate-100 text-slate-700",
};

function name(v?: Person): string {
  if (!v) return "—";
  if (typeof v === "string") return v;
  return v.name;
}

export function ReferralsPage() {
  const queryClient = useQueryClient();

  const { data: referrals, isLoading, error } = useQuery({
    queryKey: ["/admin/referrals"],
    queryFn: async () => (await api.get("/admin/referrals")).data.items as Referral[],
  });

  const { data: wallets } = useQuery({
    queryKey: ["/admin/referrals/wallets"],
    queryFn: async () => (await api.get("/admin/referrals/wallets")).data.items as Wallet[],
  });

  const [adjustFor, setAdjustFor] = useState<Wallet | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const customerId = typeof adjustFor!.customerId === "string" ? adjustFor!.customerId : adjustFor!.customerId!._id;
      return api.post(`/admin/referrals/wallets/${customerId}/adjust`, {
        amount: Number(adjustAmount),
        note: adjustNote || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/referrals/wallets"] });
      setAdjustFor(null);
      setAdjustAmount("");
      setAdjustNote("");
    },
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Referral Program</h1>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Referrer</th>
              <th className="px-4 py-2 font-medium">Referee</th>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Reward</th>
              <th className="px-4 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {referrals?.map((r) => (
              <tr key={r._id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-slate-700">{name(r.referrerCustomerId)}</td>
                <td className="px-4 py-2 text-slate-700">{name(r.refereeCustomerId)}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{r.referralCode}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-700">{r.rewardAmount ? `₹${r.rewardAmount}` : "—"}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
            {referrals?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No referrals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">Wallet Balances</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Balance</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {wallets?.map((w) => (
              <tr key={w._id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-slate-700">{name(w.customerId)}</td>
                <td className="px-4 py-2 text-slate-700">₹{w.balance.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setAdjustFor(w)} className="text-slate-600 hover:underline">
                    Adjust
                  </button>
                </td>
              </tr>
            ))}
            {wallets?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No wallet balances yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adjustFor && (
        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <div className="my-8 w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Adjust wallet</h2>
            <p className="mb-4 text-sm text-slate-500">{name(adjustFor.customerId)} — current: ₹{adjustFor.balance}</p>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Amount (₹, negative to deduct)
              </span>
              <input className="input" type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
            </label>
            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Note (optional)</span>
              <input className="input" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAdjustFor(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => adjustMutation.mutate()}
                disabled={adjustMutation.isPending || !adjustAmount}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {adjustMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
