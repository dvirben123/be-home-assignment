# Solution

## What I built

A **risk-engine** service that consumes order/payment/dispute events from Kafka, correlates them, computes risk scores using 5 provided signal functions, and exposes a REST API. A live React dashboard visualizes the entire flow in real time.

```
event-generator → Kafka (3 topics) → risk-engine → PostgreSQL
                                           │
                                     SSE /stream
                                           │
                                      dashboard (React)
```

---

## Infrastructure fixes (starter rough edges)

Before writing any business logic I fixed three real bugs in the starter:

| Bug | Fix |
|-----|-----|
| `risk-engine` had no `init-kafka` dependency — KafkaJS threw `UnknownTopicOrPartition` on every cold start | Added `condition: service_completed_successfully` |
| Health check used `wget`, which is not in the `oven/bun` image — container was permanently unhealthy | Replaced with `bun -e "fetch(...)"` |
| `@types/node` in devDeps but `Bun` global not recognized — IDE errors and potential runtime confusion | Switched to `@types/bun`, added `tsconfig.json` |

---

## PostgreSQL schema (6 tables)

| Table | Purpose |
|-------|---------|
| `seen_events` | Deduplication gate — `event_id` PRIMARY KEY (CloudEvents `id` field) |
| `raw_events` | Append-only ledger of every accepted event |
| `correlations` | Assembles bundles — nullable columns filled as events arrive |
| `risk_scores` | Computed scores with `expires_at` TTL |
| `customer_ips` | IP history per customer for velocity scoring |
| `customer_devices` | Device fingerprint history per customer |

Migrations are idempotent (`IF NOT EXISTS`) and run at startup — no migration tool needed for this scope.

---

## Event ID: from Kafka, not invented

Every event from the generator includes a CloudEvents `id` field (UUID, created by `uuidv4()` in the generator). This is used as the idempotency key in `seen_events`. The consumer never generates its own IDs — deduplication correctness depends on the producer guaranteeing uniqueness, which is the CloudEvents contract.

---

## Key design decisions

### Deduplication
`INSERT INTO seen_events ON CONFLICT DO NOTHING` — checking `rowCount` tells us whether the event was already seen. DB-level deduplication is correct across restarts and would remain correct if the consumer were horizontally scaled (unlike an in-memory Map).

### Out-of-order correlation
The `correlations` table has nullable columns for each event type. Every event arrival does an upsert that fills in its column. After the upsert, a SELECT checks whether all three are non-null and `scored_at` is null. If so, scoring fires immediately. This handles all 6 possible arrival orderings without timers or sagas.

### Score TTL
TTL is enforced at read time by comparing `expires_at < NOW()`. Expired rows are kept for audit and the API returns HTTP `410 Gone`. No background sweeper needed.

### SSE fan-out
An in-process `Set<ReadableStreamDefaultController>` singleton broadcasts to all connected dashboard clients. No Redis pub/sub needed for a single-instance service — and the architecture makes horizontal scaling straightforward: replace the singleton with a Redis publisher.

### Bun.serve() over Node http
The starter scaffold used `node:http`. Switched to `Bun.serve()` (native fetch-style Request/Response API) for consistency with the Bun runtime. SSE uses `ReadableStream` — no `res.write()` callbacks.

---

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | uptime + timestamp |
| `GET` | `/scores/:orderId` | score by order ID |
| `GET` | `/scores?merchant=&order=` | score by merchant + order |
| `GET` | `/events` | raw event log (`limit`, `topic`, `since` params) |
| `GET` | `/kafka/stats` | topic offsets + consumer group state (8s cache) |
| `GET` | `/stream` | SSE stream |

**Score response statuses:** `found` (200), `pending` (202), `not_found` (404), `expired` (410)

---

## SSE event types

| Event | When |
|-------|------|
| `event.received` | Every accepted (non-duplicate) Kafka message |
| `event.duplicate` | When `event.id` was already in `seen_events` |
| `score.computed` | When all 3 events correlated and score written |
| `kafka.stats` | Every 10s pushed from server (avoids polling) |
| `heartbeat` | Every 15s to keep proxy connections alive |

---

## Dashboard

React + Vite + Tailwind, built with Bun, served via nginx.

nginx proxies `/api/*` → `risk-engine:3001`, which eliminates CORS entirely and avoids baking API URLs into the production build.

**5 panels:**

- **Kafka Stats** — topic offsets and consumer group state
- **Live Event Stream** — real-time feed, duplicates shown with strikethrough
- **Correlation Flow** — `ORDER → PAYMENT → DISPUTE → SCORE` per `correlationId`, boxes fill in as events arrive
- **Recent Scores** — last 20 scored bundles with arc gauge and per-signal bars
- **Query Tool** — search by `merchant` + `order`, shows full breakdown

---

## Potential improvements

### 1. Kafka topic partitioning for horizontal scaling

Currently every topic is created with 1 partition (the Redpanda default — no `--partitions` flag is passed). With a single partition only one consumer instance can be active at a time, so the system cannot scale horizontally.

**Fix:** create topics with N partitions and change the producer's message key from the event UUID to the `correlationId`:

```bash
# docker-compose init-kafka
rpk topic create orders.v1 --partitions 6 --brokers redpanda:29092
```

```typescript
// event-generator: use correlationId, not event id, as the Kafka partition key
messages: [{ value, key: (payload.correlationId ?? payload.id) as string }],
```

Why the key matters: with the current `payload.id` key, an ORDER and its PAYMENT for the same `correlationId` hash to different partitions and can be processed by different consumer instances. Using `correlationId` as the key guarantees all three events for a bundle always land on the same partition → same consumer → ordering preserved, no DB write races per bundle. KafkaJS consumer group assignment handles the rest automatically — running `docker compose up --scale risk-engine=6` would distribute the 6 partitions evenly across 6 instances with zero code changes to the consumer.

---

### 2. Persistent duplicate / suspicious-event log

Right now duplicates are detected via `INSERT ... ON CONFLICT DO NOTHING` on `seen_events` and broadcast as an ephemeral SSE event. If the browser isn't connected, the duplicate is invisible. There is no historical record of when it arrived, what payload it carried, or how often a given `event_id` is being re-sent.

**Why not just add `is_duplicate BOOLEAN` to `raw_events`?**

| Concern | `is_duplicate` column | Separate table |
|---------|-----------------------|----------------|
| Write contention | Duplicates inflate the hot write path; WAL entries + vacuum touches more pages | Separate table; attacks cannot slow down legitimate event writes |
| Query safety | Every caller of `raw_events` must add `WHERE is_duplicate = false` — forgetting it silently returns rejected events (latent bug in correlator, `/events` API, etc.) | No filter needed; `raw_events` only contains accepted events by definition |
| Table bloat | Under a replay attack, `raw_events` grows at the attacker's rate, degrading all correlation lookups | `raw_events` stays lean regardless of attack volume |
| Index shape | Would need a partial index `WHERE is_duplicate = true`; wastes index space on an attribute that belongs on a different concern | Each table gets the indexes it actually needs |
| Retention policy | Cannot have different TTLs for accepted vs. rejected events | Duplicate log can have a different archival/retention policy (e.g., kept for security forensics longer or shorter) |
| Security boundary | Mixing evidence of abuse into the operational event log obscures both | Duplicate log is a distinct artefact; can have separate access controls and alerting rules |

**Proposed `duplicate_events` table:**

```sql
CREATE TABLE IF NOT EXISTS duplicate_events (
  id            BIGSERIAL PRIMARY KEY,
  event_id      TEXT NOT NULL,          -- references seen_events
  topic         TEXT NOT NULL,
  correlation_id TEXT,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ NOT NULL    -- timestamp copied from seen_events
);
CREATE INDEX ON duplicate_events (event_id);
CREATE INDEX ON duplicate_events (correlation_id);
CREATE INDEX ON duplicate_events (received_at DESC);
```

Every time the deduplicator detects a duplicate (`rowCount === 0` after the insert), it would write a row here with the full payload. This enables:

- **Rate analysis** — `SELECT date_trunc('hour', received_at), COUNT(*) FROM duplicate_events GROUP BY 1` to track duplicate rate over time
- **Red-flag detection** — a `correlation_id` with 10+ duplicate events in 60 seconds is a signal of a misbehaving producer or a replay attack
- **Post-incident investigation** — full payload preserved so you can see exactly what was re-sent and when

Beyond exact duplicates, the same pattern applies to other categories worth flagging: events that pass deduplication but fail Zod schema validation (schema-invalid events), events with `correlationId` values that arrive after their bundle was already scored (late arrivals), or events from unknown topics. All of these currently generate a console log and are silently dropped — persisting them to an `anomaly_events` or `rejected_events` table would make the system fully auditable.

---

## Running

```bash
cp env.example .env
docker compose up --build
```

| URL | What |
|-----|------|
| http://localhost:5173 | Dashboard |
| http://localhost:3001/health | risk-engine API |
| http://localhost:8080 | Redpanda Console (Kafka UI) |
