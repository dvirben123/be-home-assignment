import { z } from "zod";

const CloudEventBase = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  specversion: z.literal("1.0"),
  time: z.string().optional(),
  correlationId: z.string(),
});

export const OrderCreatedSchema = CloudEventBase.extend({
  type: z.literal("order.created"),
  data: z.object({
    order_id: z.string(),
    txn_id: z.string().optional(),
    merchant_id: z.string(),
    customer_id: z.string(),
    amt: z.number().positive(),
    currency: z.string().length(3),
    email: z.string().email(),
    billing_country: z.string().length(2),
    ip_address: z.string(),
    device_fingerprint: z.string(),
    ts: z.number().optional(),
  }),
});

export const PaymentAuthorizedSchema = CloudEventBase.extend({
  type: z.literal("payment.authorized"),
  data: z.object({
    orderId: z.string(),
    paymentId: z.string(),
    amount: z.number().positive(),
    currency: z.string().length(3),
    binCountry: z.string().length(2),
    createdAt: z.string(),
  }),
});

export const DisputeOpenedSchema = CloudEventBase.extend({
  type: z.literal("dispute.opened"),
  data: z.object({
    order_id: z.string(),
    reason_code: z.enum(["FRAUD", "NOT_RECEIVED", "DUPLICATE"]),
    amt: z.number().positive(),
    openedAt: z.string(),
    note: z.string().optional(),
  }),
});

export type OrderCreated = z.infer<typeof OrderCreatedSchema>;
export type PaymentAuthorized = z.infer<typeof PaymentAuthorizedSchema>;
export type DisputeOpened = z.infer<typeof DisputeOpenedSchema>;

export type KafkaEventType =
  | "order.created"
  | "payment.authorized"
  | "dispute.opened";
