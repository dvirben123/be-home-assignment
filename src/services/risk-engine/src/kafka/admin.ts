import { kafka } from "./consumer";

const admin = kafka.admin();
let adminConnected = false;

interface StatsCache {
  data: Record<string, unknown> | null;
  fetchedAt: number;
}

const cache: StatsCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 8_000;

const TOPICS = [
  process.env.TOPIC_ORDERS ?? "orders.v1",
  process.env.TOPIC_PAYMENTS ?? "payments.v1",
  process.env.TOPIC_DISPUTES ?? "disputes.v1",
];

export async function getKafkaStats(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  if (!adminConnected) {
    await admin.connect();
    adminConnected = true;
  }

  const [metadata, groupDescriptions] = await Promise.all([
    admin.fetchTopicMetadata({ topics: TOPICS }),
    admin
      .describeGroups(["risk-engine-consumer"])
      .catch(() => ({ groups: [] })),
  ]);

  // Fetch latest offsets per topic
  const offsetsPerTopic = await Promise.all(
    TOPICS.map((t) => admin.fetchTopicOffsets(t).catch(() => [])),
  );

  const topicStats = metadata.topics.map((t, i) => ({
    name: t.name,
    partitions: t.partitions.map((p) => {
      const offsetInfo = offsetsPerTopic[i]?.find(
        (o) => o.partition === p.partitionId,
      );
      return {
        partitionId: p.partitionId,
        leader: p.leader,
        replicas: p.replicas,
        isr: p.isr,
        latestOffset: offsetInfo?.offset ?? "0",
      };
    }),
  }));

  const group = groupDescriptions.groups[0] ?? null;

  const result: Record<string, unknown> = {
    topics: topicStats,
    consumerGroup: group
      ? {
          groupId: group.groupId,
          state: group.state,
          members: group.members?.length ?? 0,
        }
      : null,
    fetchedAt: new Date().toISOString(),
  };

  cache.data = result;
  cache.fetchedAt = now;
  return result;
}
