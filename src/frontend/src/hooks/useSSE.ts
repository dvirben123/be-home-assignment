import { useEffect, useRef, useState, useCallback } from "react";
import type { SSEMessage } from "../types";

export type ConnectionState = "connecting" | "connected" | "error";

interface UseSSEOptions {
  url: string;
  onMessage: (msg: SSEMessage) => void;
}

export function useSSE({ url, onMessage }: UseSSEOptions) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(1000);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setState("connected");
      backoffRef.current = 1000;
    };

    es.onerror = () => {
      setState("error");
      es.close();
      const delay = Math.min(backoffRef.current, 30_000);
      backoffRef.current = Math.min(delay * 2, 30_000);
      setTimeout(connect, delay);
    };

    const EVENT_TYPES = [
      "event.received",
      "event.duplicate",
      "score.computed",
      "kafka.stats",
      "heartbeat",
      "connected",
    ];

    EVENT_TYPES.forEach((eventType) => {
      es.addEventListener(eventType, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          onMessageRef.current({ ...data, type: eventType } as SSEMessage);
        } catch {
          // malformed SSE data — skip
        }
      });
    });
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);

  return { connectionState: state };
}
