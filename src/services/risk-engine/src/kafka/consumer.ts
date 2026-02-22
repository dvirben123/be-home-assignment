import { Kafka } from "kafkajs";
import {
  OrderCreatedSchema,
  PaymentAuthorizedSchema,
  DisputeOpenedSchema,
} from "./schemas";
import { isDuplicate } from "../processing/deduplicator";
import { correlateEvent } from "../processing/correlator";
import { broadcaster } from "../sse/broadcaster";
import { getPool } from "../db";

const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");

export const kafka = new Kafka({
  clientId: "risk-engine",
  brokers,
  retry: { retries: 8, initialRetryTime: 300 },
});

const consumer = kafka.consumer({
  groupId: "risk-engine-consumer",
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

type TopicConfig = {
  topic: string;
  eventType: "order.created" | "payment.authorized" | "dispute.opened";
  schema:
    | typeof OrderCreatedSchema
    | typeof PaymentAuthorizedSchema
    | typeof DisputeOpenedSchema;
};

const TOPICS: TopicConfig[] = [
  {
    topic: process.env.TOPIC_ORDERS ?? "orders.v1",
    eventType: "order.created",
    schema: OrderCreatedSchema,
  },
  {
    topic: process.env.TOPIC_PAYMENTS ?? "payments.v1",
    eventType: "payment.authorized",
    schema: PaymentAuthorizedSchema,
  },
  {
    topic: process.env.TOPIC_DISPUTES ?? "disputes.v1",
    eventType: "dispute.opened",
    schema: DisputeOpenedSchema,
  },
];

async function handleMessage(
  topic: string,
  rawValue: string | undefined,
): Promise<void> {
  if (!rawValue) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    console.warn(`[consumer] invalid JSON on ${topic}`);
    return;
  }

  const config = TOPICS.find((t) => t.topic === topic);
  if (!config) return;

  const validated = config.schema.safeParse(parsed);
  if (!validated.success) {
    console.warn(
      `[consumer] validation failed on ${topic}:`,
      validated.error.flatten().fieldErrors,
    );
    return;
  }

  const event = validated.data;
  const receivedAt = new Date();

  // Deduplication check — first DB write
  const dup = await isDuplicate(event.id, topic, event.type);

  if (dup) {
    console.debug(`[consumer] duplicate ${event.id} on ${topic}`);
    broadcaster.publish("event.duplicate", {
      eventId: event.id,
      topic,
      type: event.type,
      correlationId: event.correlationId,
      rejectedAt: receivedAt.toISOString(),
    });
    return;
  }

  // Persist to raw_events log
  const pool = getPool();
  await pool.query(
    `INSERT INTO raw_events (event_id, topic, event_type, correlation_id, payload, received_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.id,
      topic,
      event.type,
      event.correlationId,
      JSON.stringify(parsed),
      receivedAt,
    ],
  );

  // Build a lean summary for the SSE event
  const summary: Record<string, unknown> = {};
  if (event.type === "order.created") {
    const d = (event as { data: Record<string, unknown> }).data;
    Object.assign(summary, {
      orderId: d.order_id,
      merchantId: d.merchant_id,
      customerId: d.customer_id,
      amount: d.amt,
      currency: d.currency,
      email: d.email,
      billingCountry: d.billing_country,
    });
  } else if (event.type === "payment.authorized") {
    const d = (event as { data: Record<string, unknown> }).data;
    Object.assign(summary, {
      orderId: d.orderId,
      paymentId: d.paymentId,
      amount: d.amount,
      binCountry: d.binCountry,
    });
  } else {
    const d = (event as { data: Record<string, unknown> }).data;
    Object.assign(summary, {
      orderId: d.order_id,
      reasonCode: d.reason_code,
      amount: d.amt,
    });
  }

  broadcaster.publish("event.received", {
    eventId: event.id,
    topic,
    type: event.type,
    correlationId: event.correlationId,
    receivedAt: receivedAt.toISOString(),
    summary,
  });

  // Correlate — may trigger scoring if bundle is now complete
  await correlateEvent(
    event.type as "order.created" | "payment.authorized" | "dispute.opened",
    event.correlationId,
    parsed,
    receivedAt,
  );
}

export async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({
    topics: TOPICS.map((t) => t.topic),
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const value = message.value?.toString();
      try {
        await handleMessage(topic, value);
      } catch (err) {
        console.error(`[consumer] error processing message on ${topic}:`, err);
      }
    },
  });

  console.log(
    "[consumer] started, subscribed to",
    TOPICS.map((t) => t.topic),
  );
}

export async function stopConsumer(): Promise<void> {
  await consumer.disconnect();
}
