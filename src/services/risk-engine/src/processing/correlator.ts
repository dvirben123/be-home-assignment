import { getPool } from "../db";
import { scoreCorrelation } from "./scorer";
import type { KafkaEventType } from "../kafka/schemas";

/**
 * Upserts the relevant columns in the correlations table for each event type.
 * After upsert, checks if all 3 parts have arrived → triggers scoring.
 * This handles any arrival order (payment before order, etc.)
 */
export async function correlateEvent(
  eventType: KafkaEventType,
  correlationId: string,
  payload: Record<string, unknown>,
  receivedAt: Date,
): Promise<void> {
  const pool = getPool();
  const d = payload.data as Record<string, unknown>;

  if (eventType === "order.created") {
    await pool.query(
      `INSERT INTO correlations
         (correlation_id, order_id, merchant_id, customer_id,
          order_payload, order_received_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (correlation_id) DO UPDATE SET
         order_id           = EXCLUDED.order_id,
         merchant_id        = EXCLUDED.merchant_id,
         customer_id        = EXCLUDED.customer_id,
         order_payload      = EXCLUDED.order_payload,
         order_received_at  = EXCLUDED.order_received_at,
         updated_at         = NOW()`,
      [
        correlationId,
        d.order_id,
        d.merchant_id,
        d.customer_id,
        JSON.stringify(payload),
        receivedAt,
      ],
    );
  } else if (eventType === "payment.authorized") {
    await pool.query(
      `INSERT INTO correlations
         (correlation_id, payment_id, bin_country,
          payment_payload, payment_received_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (correlation_id) DO UPDATE SET
         payment_id          = EXCLUDED.payment_id,
         bin_country         = EXCLUDED.bin_country,
         payment_payload     = EXCLUDED.payment_payload,
         payment_received_at = EXCLUDED.payment_received_at,
         updated_at          = NOW()`,
      [
        correlationId,
        d.paymentId,
        d.binCountry,
        JSON.stringify(payload),
        receivedAt,
      ],
    );
  } else {
    // dispute.opened
    await pool.query(
      `INSERT INTO correlations
         (correlation_id, dispute_id, dispute_reason_code,
          dispute_payload, dispute_received_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (correlation_id) DO UPDATE SET
         dispute_id          = EXCLUDED.dispute_id,
         dispute_reason_code = EXCLUDED.dispute_reason_code,
         dispute_payload     = EXCLUDED.dispute_payload,
         dispute_received_at = EXCLUDED.dispute_received_at,
         updated_at          = NOW()`,
      [
        correlationId,
        `dispute_${correlationId.slice(0, 8)}`,
        d.reason_code,
        JSON.stringify(payload),
        receivedAt,
      ],
    );
  }

  // Check if all 3 parts are now present and scoring hasn't happened yet
  const { rows } = await pool.query(
    `SELECT order_payload, payment_payload, dispute_payload, scored_at
     FROM correlations WHERE correlation_id = $1`,
    [correlationId],
  );
  const corr = rows[0];

  if (
    corr?.order_payload &&
    corr?.payment_payload &&
    corr?.dispute_payload &&
    !corr?.scored_at
  ) {
    await scoreCorrelation(correlationId);
  }
}
