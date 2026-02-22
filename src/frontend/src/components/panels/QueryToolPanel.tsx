import { useState } from "react";
import { useScoreQuery } from "../../hooks/useScoreQuery";
import { ScoreBadge } from "../shared/ScoreBadge";
import { SignalBar } from "../shared/SignalBar";
import type { SSEScoreComputed } from "../../types";

interface Props {
  prefill?: SSEScoreComputed | null;
}

const STATUS_STYLES: Record<string, string> = {
  found: "text-green-400 bg-green-900/30 border-green-700/50",
  pending: "text-amber-400 bg-amber-900/30 border-amber-700/50",
  not_found: "text-gray-400 bg-gray-800/30 border-gray-700/50",
  expired: "text-red-400 bg-red-900/30 border-red-700/50",
};

export function QueryToolPanel({ prefill }: Props) {
  const [merchant, setMerchant] = useState(prefill?.merchantId ?? "");
  const [order, setOrder] = useState(prefill?.orderId ?? "");
  const { query, loading, history } = useScoreQuery();

  // Update fields when a score row is clicked in RecentScoresPanel
  if (prefill && prefill.merchantId !== merchant && prefill.orderId !== order) {
    setMerchant(prefill.merchantId);
    setOrder(prefill.orderId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant.trim() || !order.trim()) return;
    await query(merchant.trim(), order.trim());
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
        Query Score
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 mb-3">
        <input
          type="text"
          placeholder="Merchant ID (e.g. merch_acme_store)"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
        />
        <input
          type="text"
          placeholder="Order ID (e.g. ord_abc12345)"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
        />
        <button
          type="submit"
          disabled={loading || !merchant || !order}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded py-2 transition-colors"
        >
          {loading ? "Querying…" : "Query Risk Score"}
        </button>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {history.map((entry, i) => (
          <div
            key={i}
            className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400 truncate">
                {entry.order}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${
                  STATUS_STYLES[entry.result.status] ??
                  "text-gray-400 bg-gray-800 border-gray-700"
                }`}
              >
                {entry.result.status}
              </span>
            </div>

            {entry.result.status === "found" && entry.result.data && (
              <div className="flex gap-3">
                <ScoreBadge
                  score={entry.result.data.totalScore}
                  level={entry.result.data.riskLevel}
                  size="sm"
                />
                <div className="flex-1">
                  <SignalBar signals={entry.result.data.signals} />
                  <p className="text-xs text-gray-600 mt-1">
                    Expires{" "}
                    {new Date(entry.result.data.expiresAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {entry.result.status === "pending" && (
              <p className="text-xs text-amber-400">
                Missing: {entry.result.missingEvents?.join(", ")}
              </p>
            )}

            {(entry.result.status === "not_found" ||
              entry.result.status === "expired") && (
              <p className="text-xs text-gray-500">{entry.result.error}</p>
            )}
          </div>
        ))}

        {history.length === 0 && (
          <div className="text-center text-gray-600 text-xs pt-4">
            Query results appear here
          </div>
        )}
      </div>
    </div>
  );
}
