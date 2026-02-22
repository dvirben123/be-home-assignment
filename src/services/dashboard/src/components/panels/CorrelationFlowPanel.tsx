import type { CorrelationFlow, RiskLevel } from "../../types";

interface Props {
  flows: CorrelationFlow[];
}

const LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: "border-green-500 text-green-400 bg-green-900/20",
  MEDIUM: "border-amber-500 text-amber-400 bg-amber-900/20",
  HIGH: "border-orange-500 text-orange-400 bg-orange-900/20",
  CRITICAL: "border-red-500 text-red-400 bg-red-900/20",
};

function Step({
  label,
  done,
  time,
}: {
  label: string;
  done: boolean;
  time?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-16 h-8 rounded flex items-center justify-center text-xs font-semibold border transition-all ${
          done
            ? "bg-indigo-900/40 border-indigo-500 text-indigo-300"
            : "bg-gray-900/40 border-gray-700 text-gray-600 border-dashed"
        }`}
      >
        {label}
      </div>
      {done && time && (
        <span className="text-gray-600 text-xs">
          {new Date(time).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

function Arrow({ active }: { active: boolean }) {
  return (
    <div
      className={`text-lg leading-none mt-1 transition-colors ${active ? "text-indigo-500" : "text-gray-700"}`}
    >
      →
    </div>
  );
}

export function CorrelationFlowPanel({ flows }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Correlation Flow
        </h2>
        <span className="text-xs text-gray-500">{flows.length} active</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {flows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Waiting for events…
          </div>
        ) : (
          flows.map((flow) => {
            const hasOrder = !!flow.orderReceivedAt;
            const hasPayment = !!flow.paymentReceivedAt;
            const hasDispute = !!flow.disputeReceivedAt;
            const hasScore = !!flow.score;

            return (
              <div
                key={flow.correlationId}
                className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-2"
              >
                {/* Correlation ID */}
                <p className="text-xs font-mono text-gray-500 mb-2 truncate">
                  {flow.correlationId.slice(0, 16)}…
                  {flow.orderId && (
                    <span className="text-gray-400 ml-1">
                      · {flow.orderId}
                    </span>
                  )}
                </p>

                {/* Flow steps */}
                <div className="flex items-start gap-1 flex-wrap">
                  <Step
                    label="ORDER"
                    done={hasOrder}
                    time={flow.orderReceivedAt}
                  />
                  <Arrow active={hasOrder} />
                  <Step
                    label="PAYMENT"
                    done={hasPayment}
                    time={flow.paymentReceivedAt}
                  />
                  <Arrow active={hasPayment} />
                  <Step
                    label="DISPUTE"
                    done={hasDispute}
                    time={flow.disputeReceivedAt}
                  />
                  <Arrow active={hasDispute} />

                  {/* Score box */}
                  {hasScore && flow.score ? (
                    <div
                      className={`w-16 h-8 rounded flex items-center justify-center text-xs font-bold border transition-all ${LEVEL_COLOR[flow.score.riskLevel]}`}
                    >
                      {flow.score.totalScore}
                    </div>
                  ) : (
                    <div className="w-16 h-8 rounded flex items-center justify-center text-xs font-semibold border border-dashed border-gray-700 text-gray-600">
                      SCORE
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
