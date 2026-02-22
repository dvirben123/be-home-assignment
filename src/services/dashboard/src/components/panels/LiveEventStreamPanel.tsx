import { useEffect, useRef } from "react";
import type { LiveEvent } from "../../types";

interface Props {
  events: LiveEvent[];
}

const TOPIC_PILL: Record<string, string> = {
  "orders.v1": "bg-blue-900/60 text-blue-300 border-blue-700/50",
  "payments.v1": "bg-green-900/60 text-green-300 border-green-700/50",
  "disputes.v1": "bg-orange-900/60 text-orange-300 border-orange-700/50",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  "order.created": "ORDER",
  "payment.authorized": "PAYMENT",
  "dispute.opened": "DISPUTE",
};

export function LiveEventStreamPanel({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  useEffect(() => {
    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Live Event Stream
        </h2>
        <span className="text-xs text-gray-500">
          {events.length} events
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-1 pr-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          isAtBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Waiting for events…
          </div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className={`flex items-start gap-2 p-2 rounded-lg border text-xs transition-all ${
                ev.isDuplicate
                  ? "bg-gray-900/30 border-gray-800/30 opacity-40"
                  : "bg-gray-800/40 border-gray-700/30"
              }`}
            >
              {/* Topic pill */}
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded border text-xs font-semibold uppercase ${
                  TOPIC_PILL[ev.topic] ?? "bg-gray-800 text-gray-400 border-gray-700"
                }`}
              >
                {EVENT_TYPE_LABEL[ev.eventType] ?? ev.eventType}
              </span>

              {/* Correlation ID */}
              <span className="font-mono text-gray-400 truncate flex-1">
                {ev.correlationId.slice(0, 8)}…
              </span>

              {/* Duplicate badge */}
              {ev.isDuplicate && (
                <span className="shrink-0 text-gray-600 text-xs line-through">
                  DUP
                </span>
              )}

              {/* Timestamp */}
              <span className="shrink-0 text-gray-600">
                {new Date(ev.receivedAt).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
