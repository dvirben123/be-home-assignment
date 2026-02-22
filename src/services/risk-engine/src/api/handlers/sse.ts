import { broadcaster } from "../../sse/broadcaster";

/** GET /stream — Server-Sent Events endpoint */
export function sseHandler(): Response {
  const stream = broadcaster.subscribe();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
      "Access-Control-Allow-Origin": "*",
    },
  });
}
