import { useCallback, useState } from "react";
import { useSSE } from "./hooks/useSSE";
import { getSSEUrl } from "./api/client";
import { KafkaStatsPanel } from "./components/panels/KafkaStatsPanel";
import { LiveEventStreamPanel } from "./components/panels/LiveEventStreamPanel";
import { CorrelationFlowPanel } from "./components/panels/CorrelationFlowPanel";
import { RecentScoresPanel } from "./components/panels/RecentScoresPanel";
import { QueryToolPanel } from "./components/panels/QueryToolPanel";
import type {
  SSEMessage,
  SSEKafkaStats,
  SSEScoreComputed,
  LiveEvent,
  CorrelationFlow,
} from "./types";

const MAX_LIVE_EVENTS = 100;
const MAX_SCORES = 20;
const MAX_FLOWS = 10;

export default function App() {
  const [kafkaStats, setKafkaStats] = useState<SSEKafkaStats | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [flows, setFlows] = useState<Map<string, CorrelationFlow>>(new Map());
  const [recentScores, setRecentScores] = useState<SSEScoreComputed[]>([]);
  const [selectedScore, setSelectedScore] = useState<SSEScoreComputed | null>(null);

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.type === "kafka.stats") {
      setKafkaStats(msg as SSEKafkaStats);
    } else if (msg.type === "event.received") {
      const ev = msg as Extract<SSEMessage, { type: "event.received" }>;
      const newEvent: LiveEvent = {
        id: ev.eventId,
        topic: ev.topic,
        eventType: (ev as unknown as Record<string, string>)["type_"] ?? ev.topic,
        correlationId: ev.correlationId,
        receivedAt: ev.receivedAt,
        isDuplicate: false,
        summary: ev.summary,
      };

      setLiveEvents((prev) =>
        [...prev, newEvent].slice(-MAX_LIVE_EVENTS),
      );

      // Update correlation flow
      setFlows((prev) => {
        const next = new Map(prev);
        const existing = next.get(ev.correlationId) ?? {
          correlationId: ev.correlationId,
          lastUpdated: ev.receivedAt,
        };

        const topic = ev.topic;
        const summary = ev.summary as Record<string, unknown>;

        if (topic === "orders.v1") {
          existing.orderReceivedAt = ev.receivedAt;
          existing.orderId = summary["orderId"] as string | undefined;
        } else if (topic === "payments.v1") {
          existing.paymentReceivedAt = ev.receivedAt;
        } else if (topic === "disputes.v1") {
          existing.disputeReceivedAt = ev.receivedAt;
        }

        existing.lastUpdated = ev.receivedAt;
        next.set(ev.correlationId, existing);

        // Keep only the most recent MAX_FLOWS flows
        if (next.size > MAX_FLOWS) {
          const sorted = [...next.entries()].sort(
            ([, a], [, b]) =>
              new Date(b.lastUpdated).getTime() -
              new Date(a.lastUpdated).getTime(),
          );
          return new Map(sorted.slice(0, MAX_FLOWS));
        }

        return next;
      });
    } else if (msg.type === "event.duplicate") {
      const ev = msg as Extract<SSEMessage, { type: "event.duplicate" }>;
      const dupEvent: LiveEvent = {
        id: ev.eventId + "-dup-" + Date.now(),
        topic: ev.topic,
        eventType: ev.topic,
        correlationId: ev.correlationId,
        receivedAt: ev.rejectedAt,
        isDuplicate: true,
        summary: {},
      };
      setLiveEvents((prev) => [...prev, dupEvent].slice(-MAX_LIVE_EVENTS));
    } else if (msg.type === "score.computed") {
      const score = msg as SSEScoreComputed;

      setRecentScores((prev) => [score, ...prev].slice(0, MAX_SCORES));

      // Update correlation flow with score
      setFlows((prev) => {
        const next = new Map(prev);
        const existing = next.get(score.correlationId);
        if (existing) {
          existing.score = score;
          existing.lastUpdated = score.scoredAt;
          next.set(score.correlationId, existing);
        }
        return next;
      });
    }
  }, []);

  const { connectionState } = useSSE({
    url: getSSEUrl(),
    onMessage: handleMessage,
  });

  // Sort flows by most recently updated first
  const sortedFlows = [...flows.values()].sort(
    (a, b) =>
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
  );

  return (
    <div className="h-screen bg-gray-950 text-white overflow-hidden flex flex-col">
      {/* Header */}
      <header className="shrink-0 px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-sm font-semibold text-gray-200 tracking-wide">
            Chargeflow Risk Engine
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            SSE:{" "}
            <span
              className={
                connectionState === "connected"
                  ? "text-green-400"
                  : connectionState === "error"
                    ? "text-red-400"
                    : "text-amber-400"
              }
            >
              {connectionState}
            </span>
          </span>
          <span>Scores computed: {recentScores.length}</span>
          <span>Live events: {liveEvents.length}</span>
        </div>
      </header>

      {/* 3×2 Dashboard Grid */}
      <div
        className="flex-1 grid gap-2 p-2 overflow-hidden"
        style={{
          gridTemplateColumns: "1fr 1.5fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        {/* Row 1, Col 1 — Kafka Stats */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <KafkaStatsPanel
            stats={kafkaStats}
            connectionState={connectionState}
          />
        </div>

        {/* Row 1, Col 2 — Live Event Stream */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <LiveEventStreamPanel events={liveEvents} />
        </div>

        {/* Row 1, Col 3 — Correlation Flow */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <CorrelationFlowPanel flows={sortedFlows} />
        </div>

        {/* Row 2, Col 1+2 — Recent Scores */}
        <div
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-hidden"
          style={{ gridColumn: "1 / 3" }}
        >
          <RecentScoresPanel
            scores={recentScores}
            onSelect={setSelectedScore}
          />
        </div>

        {/* Row 2, Col 3 — Query Tool */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <QueryToolPanel prefill={selectedScore} />
        </div>
      </div>
    </div>
  );
}
