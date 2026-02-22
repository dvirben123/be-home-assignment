import {
  ipVelocityScore,
  deviceReuseScore,
  emailDomainReputationScore,
  binCountryMismatchScore,
  chargebackHistoryScore,
} from "@chargeflow/risk-signals";
import { getPool } from "../db";
import { broadcaster } from "../sse/broadcaster";

const SCORE_TTL_HOURS = Number(process.env.SCORE_TTL_HOURS ?? "24");

function riskLevel(
  total: number,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (total >= 80) return "CRITICAL";
  if (total >= 60) return "HIGH";
  if (total >= 30) return "MEDIUM";
  return "LOW";
}

/**
 * Computes risk score for a fully-correlated bundle.
 * Fetches historical context from DB, writes score, updates customer history.
 */
export async function scoreCorrelation(correlationId: string): Promise<void> {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT * FROM correlations WHERE correlation_id = $1`,
    [correlationId],
  );
  const corr = rows[0];
  if (!corr) return;

  const orderData = corr.order_payload.data;
  const paymentData = corr.payment_payload.data;

  // Fetch historical IP and device lists for this customer
  const [{ rows: ipRows }, { rows: deviceRows }] = await Promise.all([
    pool.query(
      `SELECT ip_address FROM customer_ips WHERE customer_id = $1`,
      [corr.customer_id],
    ),
    pool.query(
      `SELECT fingerprint FROM customer_devices WHERE customer_id = $1`,
      [corr.customer_id],
    ),
  ]);

  const recentIps = ipRows.map((r: { ip_address: string }) => r.ip_address);
  const knownDevices = deviceRows.map(
    (r: { fingerprint: string }) => r.fingerprint,
  );

  // Compute individual signals (each 0–20)
  const sigIpVelocity = ipVelocityScore(orderData.ip_address, recentIps);
  const sigDeviceReuse = deviceReuseScore(
    orderData.device_fingerprint,
    knownDevices,
  );
  const sigEmailDomain = emailDomainReputationScore(orderData.email);
  const sigBinMismatch = binCountryMismatchScore(
    paymentData.binCountry,
    orderData.billing_country,
  );
  const sigChargebackHistory = chargebackHistoryScore(
    corr.merchant_id,
    corr.customer_id,
  );

  const totalScore =
    sigIpVelocity +
    sigDeviceReuse +
    sigEmailDomain +
    sigBinMismatch +
    sigChargebackHistory;
  const level = riskLevel(totalScore);
  const scoredAt = new Date();
  const expiresAt = new Date(
    scoredAt.getTime() + SCORE_TTL_HOURS * 60 * 60 * 1000,
  );

  // Upsert score — safe to re-score if called again
  await pool.query(
    `INSERT INTO risk_scores
      (correlation_id, order_id, merchant_id, customer_id, total_score,
       sig_ip_velocity, sig_device_reuse, sig_email_domain, sig_bin_mismatch,
       sig_chargeback_history, risk_level, scored_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (correlation_id) DO UPDATE SET
       total_score           = EXCLUDED.total_score,
       sig_ip_velocity       = EXCLUDED.sig_ip_velocity,
       sig_device_reuse      = EXCLUDED.sig_device_reuse,
       sig_email_domain      = EXCLUDED.sig_email_domain,
       sig_bin_mismatch      = EXCLUDED.sig_bin_mismatch,
       sig_chargeback_history = EXCLUDED.sig_chargeback_history,
       risk_level            = EXCLUDED.risk_level,
       scored_at             = EXCLUDED.scored_at,
       expires_at            = EXCLUDED.expires_at`,
    [
      correlationId,
      corr.order_id,
      corr.merchant_id,
      corr.customer_id,
      totalScore,
      sigIpVelocity,
      sigDeviceReuse,
      sigEmailDomain,
      sigBinMismatch,
      sigChargebackHistory,
      level,
      scoredAt.toISOString(),
      expiresAt.toISOString(),
    ],
  );

  // Mark correlation as scored
  await pool.query(
    `UPDATE correlations SET scored_at = $1, updated_at = NOW() WHERE correlation_id = $2`,
    [scoredAt.toISOString(), correlationId],
  );

  // Update customer history (ON CONFLICT DO NOTHING prevents inflation from dups)
  await Promise.all([
    pool.query(
      `INSERT INTO customer_ips (customer_id, ip_address) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [corr.customer_id, orderData.ip_address],
    ),
    pool.query(
      `INSERT INTO customer_devices (customer_id, fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [corr.customer_id, orderData.device_fingerprint],
    ),
  ]);

  console.log(
    `[scorer] ${corr.order_id} → score=${totalScore} (${level}) corr=${correlationId}`,
  );

  // Broadcast score to dashboard
  broadcaster.publish("score.computed", {
    correlationId,
    orderId: corr.order_id,
    merchantId: corr.merchant_id,
    customerId: corr.customer_id,
    totalScore,
    riskLevel: level,
    signals: {
      ipVelocity: sigIpVelocity,
      deviceReuse: sigDeviceReuse,
      emailDomain: sigEmailDomain,
      binMismatch: sigBinMismatch,
      chargebackHistory: sigChargebackHistory,
    },
    scoredAt: scoredAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    flow: {
      orderReceivedAt: corr.order_received_at,
      paymentReceivedAt: corr.payment_received_at,
      disputeReceivedAt: corr.dispute_received_at,
    },
  });
}
