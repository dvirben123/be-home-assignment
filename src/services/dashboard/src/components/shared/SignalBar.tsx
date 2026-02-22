import type { Signals } from "../../types";

interface Props {
  signals: Signals;
}

const SIGNAL_LABELS: { key: keyof Signals; label: string }[] = [
  { key: "ipVelocity", label: "IP Vel" },
  { key: "deviceReuse", label: "Device" },
  { key: "emailDomain", label: "Email" },
  { key: "binMismatch", label: "BIN" },
  { key: "chargebackHistory", label: "CB Hist" },
];

function barColor(value: number): string {
  if (value >= 16) return "bg-red-500";
  if (value >= 10) return "bg-orange-500";
  if (value >= 5) return "bg-amber-500";
  return "bg-green-500";
}

export function SignalBar({ signals }: Props) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {SIGNAL_LABELS.map(({ key, label }) => {
        const val = signals[key];
        const pct = (val / 20) * 100;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-14 shrink-0 text-right">
              {label}
            </span>
            <div className="flex-1 bg-gray-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${barColor(val)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-5 text-right">{val}</span>
          </div>
        );
      })}
    </div>
  );
}
