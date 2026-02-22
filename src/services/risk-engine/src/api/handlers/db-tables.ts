import { getPool } from "../../db";

const CORS = { "Access-Control-Allow-Origin": "*" };

const QUERIES: Record<string, string> = {
  seen_events: `
    SELECT event_id, topic, event_type, received_at
    FROM seen_events
    ORDER BY received_at DESC
    LIMIT 20`,

  raw_events: `
    SELECT id, event_id, topic, event_type, correlation_id, received_at
    FROM raw_events
    ORDER BY received_at DESC
    LIMIT 20`,

  correlations: `
    SELECT
      correlation_id, order_id, merchant_id, customer_id,
      payment_id, bin_country, dispute_id, dispute_reason_code,
      order_received_at, payment_received_at, dispute_received_at,
      scored_at, created_at, updated_at,
      (order_payload IS NOT NULL)   AS has_order,
      (payment_payload IS NOT NULL) AS has_payment,
      (dispute_payload IS NOT NULL) AS has_dispute
    FROM correlations
    ORDER BY updated_at DESC
    LIMIT 20`,

  risk_scores: `
    SELECT
      id, correlation_id, order_id, merchant_id, customer_id,
      total_score, risk_level,
      sig_ip_velocity, sig_device_reuse, sig_email_domain,
      sig_bin_mismatch, sig_chargeback_history,
      scored_at, expires_at
    FROM risk_scores
    ORDER BY scored_at DESC
    LIMIT 20`,

  customer_ips: `
    SELECT id, customer_id, ip_address, seen_at
    FROM customer_ips
    ORDER BY seen_at DESC
    LIMIT 20`,

  customer_devices: `
    SELECT id, customer_id, fingerprint, seen_at
    FROM customer_devices
    ORDER BY seen_at DESC
    LIMIT 20`,
};

/** GET /db/tables — returns last 20 rows from each of the 6 schema tables */
export async function dbTablesHandler(): Promise<Response> {
  const pool = getPool();

  try {
    const entries = await Promise.all(
      Object.entries(QUERIES).map(async ([table, sql]) => {
        const { rows } = await pool.query(sql);
        return [table, rows] as [string, unknown[]];
      }),
    );

    return Response.json(
      {
        tables: Object.fromEntries(entries),
        fetchedAt: new Date().toISOString(),
      },
      { headers: CORS },
    );
  } catch (err) {
    console.error("[db-tables] query error:", err);
    return Response.json(
      { error: "Failed to query tables" },
      { status: 500, headers: CORS },
    );
  }
}
