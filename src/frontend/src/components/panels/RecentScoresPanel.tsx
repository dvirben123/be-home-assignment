import type { SSEScoreComputed } from "../../types";
import { ScoreBadge } from "../shared/ScoreBadge";
import { SignalBar } from "../shared/SignalBar";

interface Props {
  scores: SSEScoreComputed[];
  onSelect: (score: SSEScoreComputed) => void;
}

export function RecentScoresPanel({ scores, onSelect }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Recent Scores
        </h2>
        <span className="text-xs text-gray-500">{scores.length} computed</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {scores.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Waiting for scored events…
          </div>
        ) : (
          scores.map((score) => (
            <button
              key={score.correlationId}
              onClick={() => onSelect(score)}
              className="w-full text-left bg-gray-800/40 border border-gray-700/40 rounded-lg p-3 hover:bg-gray-700/40 hover:border-gray-600/60 transition-all"
            >
              <div className="flex gap-3">
                {/* Score badge */}
                <div className="shrink-0">
                  <ScoreBadge
                    score={score.totalScore}
                    level={score.riskLevel}
                    size="sm"
                  />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-xs font-mono text-white truncate">
                        {score.orderId}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {score.merchantId} · {score.customerId}
                      </p>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">
                      {new Date(score.scoredAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <SignalBar signals={score.signals} />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
