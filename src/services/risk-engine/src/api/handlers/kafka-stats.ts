import { getKafkaStats } from "../../kafka/admin";

const CORS = { "Access-Control-Allow-Origin": "*" };

/** GET /kafka/stats */
export async function kafkaStatsHandler(): Promise<Response> {
  try {
    const stats = await getKafkaStats();
    return Response.json(stats, { headers: CORS });
  } catch (err) {
    console.error("[kafka-stats] error:", err);
    return Response.json(
      { error: "Failed to fetch Kafka stats" },
      { status: 503, headers: CORS },
    );
  }
}
