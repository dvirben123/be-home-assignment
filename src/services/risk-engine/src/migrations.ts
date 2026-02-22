import { getPool } from "./db";

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS seen_events (
    event_id    TEXT        PRIMARY KEY,
    topic       TEXT        NOT NULL,
    event_type  TEXT        NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS raw_events (
    id             BIGSERIAL    PRIMARY KEY,
    event_id       TEXT         NOT NULL REFERENCES seen_events(event_id),
    topic          TEXT         NOT NULL,
    event_type     TEXT         NOT NULL,
    correlation_id TEXT         NOT NULL,
    payload        JSONB        NOT NULL,
    received_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS raw_events_correlation_id_idx ON raw_events (correlation_id)`,
  `CREATE INDEX IF NOT EXISTS raw_events_received_at_idx ON raw_events (received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS raw_events_topic_idx ON raw_events (topic)`,

  `CREATE TABLE IF NOT EXISTS correlations (
    correlation_id       TEXT         PRIMARY KEY,
    order_id             TEXT,
    merchant_id          TEXT,
    customer_id          TEXT,
    order_payload        JSONB,
    payment_id           TEXT,
    bin_country          TEXT,
    payment_payload      JSONB,
    dispute_id           TEXT,
    dispute_reason_code  TEXT,
    dispute_payload      JSONB,
    order_received_at    TIMESTAMPTZ,
    payment_received_at  TIMESTAMPTZ,
    dispute_received_at  TIMESTAMPTZ,
    scored_at            TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS correlations_order_id_idx ON correlations (order_id)`,
  `CREATE INDEX IF NOT EXISTS correlations_merchant_id_idx ON correlations (merchant_id)`,
  `CREATE INDEX IF NOT EXISTS correlations_scored_at_idx ON correlations (scored_at) WHERE scored_at IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS risk_scores (
    id                    BIGSERIAL    PRIMARY KEY,
    correlation_id        TEXT         NOT NULL REFERENCES correlations(correlation_id),
    order_id              TEXT         NOT NULL,
    merchant_id           TEXT         NOT NULL,
    customer_id           TEXT,
    total_score           INTEGER      NOT NULL CHECK (total_score BETWEEN 0 AND 100),
    sig_ip_velocity       INTEGER      NOT NULL,
    sig_device_reuse      INTEGER      NOT NULL,
    sig_email_domain      INTEGER      NOT NULL,
    sig_bin_mismatch      INTEGER      NOT NULL,
    sig_chargeback_history INTEGER     NOT NULL,
    risk_level            TEXT         NOT NULL,
    scored_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at            TIMESTAMPTZ  NOT NULL
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS risk_scores_correlation_id_uidx ON risk_scores (correlation_id)`,
  `CREATE INDEX IF NOT EXISTS risk_scores_order_id_idx ON risk_scores (order_id)`,
  `CREATE INDEX IF NOT EXISTS risk_scores_merchant_id_idx ON risk_scores (merchant_id)`,
  `CREATE INDEX IF NOT EXISTS risk_scores_expires_at_idx ON risk_scores (expires_at)`,
  `CREATE INDEX IF NOT EXISTS risk_scores_scored_at_idx ON risk_scores (scored_at DESC)`,

  `CREATE TABLE IF NOT EXISTS customer_ips (
    id          BIGSERIAL    PRIMARY KEY,
    customer_id TEXT         NOT NULL,
    ip_address  TEXT         NOT NULL,
    seen_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS customer_ips_customer_id_idx ON customer_ips (customer_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customer_ips_customer_ip_uidx ON customer_ips (customer_id, ip_address)`,

  `CREATE TABLE IF NOT EXISTS customer_devices (
    id          BIGSERIAL    PRIMARY KEY,
    customer_id TEXT         NOT NULL,
    fingerprint TEXT         NOT NULL,
    seen_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS customer_devices_customer_id_idx ON customer_devices (customer_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customer_devices_customer_fp_uidx ON customer_devices (customer_id, fingerprint)`,
];

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sql of MIGRATIONS) {
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log("[migrations] schema ready");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
