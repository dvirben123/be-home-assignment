import type { RiskLevel } from "../../types";

interface Props {
  score: number;
  level: RiskLevel;
  size?: "sm" | "md" | "lg";
}

const levelColor: Record<RiskLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const levelBg: Record<RiskLevel, string> = {
  LOW: "bg-green-900/30 text-green-400 border-green-700",
  MEDIUM: "bg-amber-900/30 text-amber-400 border-amber-700",
  HIGH: "bg-orange-900/30 text-orange-400 border-orange-700",
  CRITICAL: "bg-red-900/30 text-red-400 border-red-700",
};

export function ScoreBadge({ score, level, size = "md" }: Props) {
  const radius = size === "sm" ? 20 : size === "lg" ? 36 : 28;
  const stroke = size === "sm" ? 4 : 5;
  const svgSize = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = levelColor[level];

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={svgSize} height={svgSize} className="-rotate-90">
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth={stroke}
        />
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          className="rotate-90"
          style={{
            fontSize: size === "sm" ? 10 : size === "lg" ? 16 : 13,
            fill: color,
            fontWeight: 700,
            transform: `rotate(90deg)`,
            transformOrigin: "center",
          }}
        >
          {score}
        </text>
      </svg>
      <span
        className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase tracking-wide ${levelBg[level]}`}
      >
        {level}
      </span>
    </div>
  );
}
