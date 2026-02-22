type SSEEventType =
  | "event.received"
  | "event.duplicate"
  | "score.computed"
  | "kafka.stats"
  | "heartbeat"
  | "connected";

class SSEBroadcaster {
  private clients = new Set<ReadableStreamDefaultController>();

  /**
   * Creates a new SSE stream for a connecting client.
   * The stream is automatically cleaned up when the client disconnects.
   */
  subscribe(): ReadableStream {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    let ctrl: ReadableStreamDefaultController;

    const stream = new ReadableStream({
      start(controller) {
        ctrl = controller;
        self.clients.add(controller);
        // Send initial connection confirmation
        const msg = `event: connected\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`;
        controller.enqueue(new TextEncoder().encode(msg));
      },
      cancel() {
        self.clients.delete(ctrl);
      },
    });

    return stream;
  }

  /**
   * Broadcast an SSE event to all connected clients.
   * Dead clients are silently removed.
   */
  publish(event: SSEEventType, data: Record<string, unknown>): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoded = new TextEncoder().encode(msg);

    for (const ctrl of this.clients) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        // Client closed — remove from set
        this.clients.delete(ctrl);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

// Singleton — imported by consumer, scorer, and SSE handler
export const broadcaster = new SSEBroadcaster();
