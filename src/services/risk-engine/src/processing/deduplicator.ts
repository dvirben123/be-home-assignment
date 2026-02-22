import { getPool } from "../db";

/**
 * Attempts to register an event ID as seen.
 * Returns true if the event is a duplicate (already seen), false if new.
 * Uses INSERT ON CONFLICT DO NOTHING — safe under concurrent consumers.
 */
export async function isDuplicate(
  eventId: string,
  topic: string,
  eventType: string,
): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO seen_events (event_id, topic, event_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, topic, eventType],
  );
  // rowCount === 0 means conflict hit → already seen
  return (result.rowCount ?? 0) === 0;
}
