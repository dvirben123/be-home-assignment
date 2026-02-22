import { getPool } from "../../db";

const CORS = { "Access-Control-Allow-Origin": "*" };
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** GET /events?limit=&topic=&since= */
export async function eventsHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const topic = url.searchParams.get("topic");
  const since = url.searchParams.get("since");

  const pool = getPool();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (topic) {
    params.push(topic);
    conditions.push(`topic = $${params.length}`);
  }
  if (since) {
    params.push(since);
    conditions.push(`received_at >= $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT id, event_id, topic, event_type, correlation_id, payload, received_at
     FROM raw_events
     ${where}
     ORDER BY received_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return Response.json(
    {
      count: rows.length,
      data: rows.map((r) => ({
        id: r.id,
        eventId: r.event_id,
        topic: r.topic,
        type: r.event_type,
        correlationId: r.correlation_id,
        receivedAt: r.received_at,
        payload: r.payload,
      })),
    },
    { headers: CORS },
  );
}
