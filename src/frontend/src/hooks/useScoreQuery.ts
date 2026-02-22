import { useState } from "react";
import { fetchScoreByMerchant } from "../api/client";
import type { ScoreResponse } from "../types";

interface QueryEntry {
  merchant: string;
  order: string;
  result: ScoreResponse;
  queriedAt: string;
}

export function useScoreQuery() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QueryEntry[]>([]);

  async function query(
    merchant: string,
    order: string,
  ): Promise<ScoreResponse> {
    setLoading(true);
    try {
      const result = await fetchScoreByMerchant(merchant, order);
      setHistory((prev) =>
        [{ merchant, order, result, queriedAt: new Date().toISOString() }, ...prev].slice(0, 5),
      );
      return result;
    } finally {
      setLoading(false);
    }
  }

  return { query, loading, history };
}
