import { runMigrations } from "./migrations";
import { startConsumer, stopConsumer } from "./kafka/consumer";
import { getKafkaStats } from "./kafka/admin";
import { router } from "./api/router";
import { broadcaster } from "./sse/broadcaster";
import { getPool } from "./db";

const port = Number(process.env.PORT ?? "3001");

async function main(): Promise<void> {
  console.log("[risk-engine] starting...");

  // 1. Run DB migrations (idempotent — IF NOT EXISTS throughout)
  await runMigrations();

  // 2. Start Kafka consumer
  await startConsumer();

  // 3. Push kafka.stats via SSE every 10s (avoids client polling)
  setInterval(async () => {
    try {
      const stats = await getKafkaStats();
      broadcaster.publish("kafka.stats", stats);
    } catch (err) {
      console.error("[sse] kafka stats push failed:", err);
    }
  }, 10_000);

  // 4. Heartbeat every 15s — keeps SSE connections alive through proxies
  setInterval(() => {
    broadcaster.publish("heartbeat", { ts: new Date().toISOString() });
  }, 15_000);

  // 5. Start HTTP server with Bun.serve()
  const server = Bun.serve({
    port,
    fetch(req) {
      return router(req);
    },
    error(err) {
      console.error("[server] unhandled error:", err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    },
  });

  console.log(`[risk-engine] listening on http://localhost:${server.port}`);

  // 6. Graceful shutdown
  const shutdown = async () => {
    console.log("[risk-engine] shutting down...");
    server.stop(true);
    await stopConsumer();
    await getPool().end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[risk-engine] fatal startup error:", err);
  process.exit(1);
});
