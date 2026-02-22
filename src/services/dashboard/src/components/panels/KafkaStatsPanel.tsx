import type { SSEKafkaStats } from "../../types";

interface Props {
  stats: SSEKafkaStats | null;
  connectionState: "connecting" | "connected" | "error";
}

const TOPIC_COLORS: Record<string, string> = {
  "orders.v1": "bg-blue-500",
  "payments.v1": "bg-green-500",
  "disputes.v1": "bg-orange-500",
};

const TOPIC_TEXT: Record<string, string> = {
  "orders.v1": "text-blue-400",
  "payments.v1": "text-green-400",
  "disputes.v1": "text-orange-400",
};

export function KafkaStatsPanel({ stats, connectionState }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Kafka Topics
        </h2>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            connectionState === "connected"
              ? "bg-green-900/50 text-green-400"
              : connectionState === "error"
                ? "bg-red-900/50 text-red-400"
                : "bg-gray-700 text-gray-400"
          }`}
        >
          {connectionState}
        </span>
      </div>

      {!stats ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Waiting for stats…
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 overflow-auto">
          {stats.topics.map((topic) => {
            const totalOffset = topic.partitions.reduce(
              (sum, p) => sum + Number(p.latestOffset),
              0,
            );
            return (
              <div
                key={topic.name}
                className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${TOPIC_COLORS[topic.name] ?? "bg-gray-500"}`}
                    />
                    <span
                      className={`text-sm font-mono font-medium ${TOPIC_TEXT[topic.name] ?? "text-gray-300"}`}
                    >
                      {topic.name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {topic.partitions.length} partition
                    {topic.partitions.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Latest offset</span>
                  <span className="text-lg font-mono font-bold text-white">
                    {totalOffset.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}

          {stats.consumerGroup && (
            <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/30 mt-auto">
              <p className="text-xs text-gray-500 mb-1">Consumer Group</p>
              <p className="text-xs font-mono text-gray-300">
                {stats.consumerGroup.groupId}
              </p>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-gray-500">
                  State:{" "}
                  <span className="text-green-400">
                    {stats.consumerGroup.state}
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  Members:{" "}
                  <span className="text-white">
                    {stats.consumerGroup.members}
                  </span>
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600 text-right">
            Updated {new Date(stats.fetchedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}
