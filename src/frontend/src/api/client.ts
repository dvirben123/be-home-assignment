import type { ScoreResponse } from "../types";

const BASE = "/api";

export async function fetchScoreByOrder(
  orderId: string,
): Promise<ScoreResponse> {
  const res = await fetch(`${BASE}/scores/${encodeURIComponent(orderId)}`);
  return res.json();
}

export async function fetchScoreByMerchant(
  merchant: string,
  order: string,
): Promise<ScoreResponse> {
  const params = new URLSearchParams({ merchant, order });
  const res = await fetch(`${BASE}/scores?${params}`);
  return res.json();
}

export async function fetchRecentEvents(opts?: {
  limit?: number;
  topic?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.topic) params.set("topic", opts.topic);
  const res = await fetch(`${BASE}/events?${params}`);
  return res.json();
}

export function getSSEUrl(): string {
  return `${BASE}/stream`;
}

export async function fetchDbTables(): Promise<{
  tables: Record<string, Record<string, unknown>[]>;
  fetchedAt: string;
}> {
  const res = await fetch(`${BASE}/db/tables`);
  return res.json();
}
