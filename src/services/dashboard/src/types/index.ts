export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Signals {
  ipVelocity: number;
  deviceReuse: number;
  emailDomain: number;
  binMismatch: number;
  chargebackHistory: number;
}

// SSE events from risk-engine
export interface SSEEventReceived {
  type: "event.received";
  eventId: string;
  topic: string;
  type_: string; // event type (order.created etc)
  correlationId: string;
  receivedAt: string;
  summary: Record<string, unknown>;
}

export interface SSEEventDuplicate {
  type: "event.duplicate";
  eventId: string;
  topic: string;
  correlationId: string;
  rejectedAt: string;
}

export interface SSEScoreComputed {
  type: "score.computed";
  correlationId: string;
  orderId: string;
  merchantId: string;
  customerId: string;
  totalScore: number;
  riskLevel: RiskLevel;
  signals: Signals;
  scoredAt: string;
  expiresAt: string;
  flow: {
    orderReceivedAt: string | null;
    paymentReceivedAt: string | null;
    disputeReceivedAt: string | null;
  };
}

export interface KafkaTopicStats {
  name: string;
  partitions: {
    partitionId: number;
    leader: number;
    replicas: number[];
    isr: number[];
    latestOffset: string;
  }[];
}

export interface SSEKafkaStats {
  type: "kafka.stats";
  topics: KafkaTopicStats[];
  consumerGroup: {
    groupId: string;
    state: string;
    members: number;
  } | null;
  fetchedAt: string;
}

export type SSEMessage =
  | SSEEventReceived
  | SSEEventDuplicate
  | SSEScoreComputed
  | SSEKafkaStats
  | { type: "heartbeat"; ts: string }
  | { type: "connected"; ts: string };

// For the live event stream panel
export interface LiveEvent {
  id: string; // eventId
  topic: string;
  eventType: string;
  correlationId: string;
  receivedAt: string;
  isDuplicate: boolean;
  summary: Record<string, unknown>;
}

// For the correlation flow panel
export interface CorrelationFlow {
  correlationId: string;
  orderId?: string;
  orderReceivedAt?: string;
  paymentReceivedAt?: string;
  disputeReceivedAt?: string;
  score?: SSEScoreComputed;
  lastUpdated: string;
}

// API response types
export interface ScoreResponse {
  status: "found" | "pending" | "not_found" | "expired";
  data?: {
    correlationId: string;
    orderId: string;
    merchantId: string;
    customerId: string;
    totalScore: number;
    riskLevel: RiskLevel;
    signals: Signals;
    hasDispute: boolean;
    disputeReason: string | null;
    scoredAt: string;
    expiresAt: string;
  };
  error?: string;
  message?: string;
  receivedAt?: string;
  missingEvents?: string[];
  expiredAt?: string;
}
