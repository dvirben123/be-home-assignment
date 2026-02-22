import { useEffect, useRef, useState } from "react";
import { fetchDbTables } from "../api/client";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// FK relationships: which columns in a table link to another table
type FKDef = { column: string; targetTable: string; targetColumn: string };

const FK_MAP: Record<string, FKDef[]> = {
  raw_events: [
    { column: "event_id",       targetTable: "seen_events",     targetColumn: "event_id" },
    { column: "correlation_id", targetTable: "correlations",    targetColumn: "correlation_id" },
  ],
  risk_scores: [
    { column: "correlation_id", targetTable: "correlations",    targetColumn: "correlation_id" },
  ],
  customer_ips: [
    { column: "customer_id",    targetTable: "correlations",    targetColumn: "customer_id" },
  ],
  customer_devices: [
    { column: "customer_id",    targetTable: "correlations",    targetColumn: "customer_id" },
  ],
};

const TABLE_ORDER = [
  "seen_events",
  "raw_events",
  "correlations",
  "risk_scores",
  "customer_ips",
  "customer_devices",
] as const;

const TABLE_LABELS: Record<string, string> = {
  seen_events:      "seen_events",
  raw_events:       "raw_events",
  correlations:     "correlations",
  risk_scores:      "risk_scores",
  customer_ips:     "customer_ips",
  customer_devices: "customer_devices",
};

function truncate(val: unknown, max = 24): string {
  const str = val === null || val === undefined ? "—" : String(val);
  if (typeof val === "object" && val !== null) return "{…}";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") return "{…}";
  const str = String(val);
  // Timestamps — show only time part
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return new Date(str).toLocaleTimeString();
  }
  return truncate(str, 20);
}

interface CellProps {
  col: string;
  val: unknown;
  tableName: string;
  highlightKey: string | null;
  onFKClick: (targetTable: string, targetColumn: string, value: string) => void;
}

function Cell({ col, val, tableName, highlightKey, onFKClick }: CellProps) {
  const fkDef = FK_MAP[tableName]?.find((f) => f.column === col);
  const strVal = val === null || val === undefined ? "" : String(val);
  const isHighlighted = highlightKey !== null && strVal === highlightKey;

  const base = "px-3 py-1.5 text-xs font-mono whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis";

  if (fkDef && strVal) {
    return (
      <td className={`${base} ${isHighlighted ? "bg-indigo-900/60 text-indigo-200" : ""}`}>
        <button
          title={`→ ${fkDef.targetTable}.${fkDef.targetColumn}`}
          onClick={() => onFKClick(fkDef.targetTable, fkDef.targetColumn, strVal)}
          className="text-indigo-400 hover:text-indigo-200 hover:underline cursor-pointer"
        >
          {formatCell(val)}
        </button>
      </td>
    );
  }

  return (
    <td
      className={`${base} text-gray-300 ${isHighlighted ? "bg-indigo-900/60 text-indigo-200" : ""}`}
      title={strVal}
    >
      {formatCell(val)}
    </td>
  );
}

interface TableViewProps {
  tableName: string;
  rows: Row[];
  highlightColumn: string | null;
  highlightKey: string | null;
  onFKClick: (targetTable: string, targetColumn: string, value: string) => void;
}

function TableView({ tableName, rows, highlightColumn, highlightKey, onFKClick }: TableViewProps) {
  const highlightRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightKey]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
        No rows yet
      </div>
    );
  }

  const columns = Object.keys(rows[0]);

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr>
            {columns.map((col) => {
              const isFk = FK_MAP[tableName]?.some((f) => f.column === col);
              const isHighCol = col === highlightColumn;
              return (
                <th
                  key={col}
                  className={`px-3 py-2 text-left font-semibold uppercase tracking-wide border-b border-gray-700 whitespace-nowrap
                    ${isHighCol ? "text-indigo-400 border-indigo-700" : "text-gray-400"}
                    ${isFk ? "text-indigo-400" : ""}`}
                >
                  {col}
                  {isFk && <span className="ml-1 text-indigo-600">↗</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowKey = String(
              row["event_id"] ?? row["correlation_id"] ?? row["id"] ?? i,
            );
            const isHighlightedRow =
              highlightKey !== null &&
              highlightColumn !== null &&
              String(row[highlightColumn]) === highlightKey;

            return (
              <tr
                key={rowKey}
                ref={isHighlightedRow ? highlightRowRef : undefined}
                className={`border-b border-gray-800/50 transition-colors
                  ${isHighlightedRow
                    ? "bg-indigo-900/30 border-indigo-700/50"
                    : i % 2 === 0 ? "bg-gray-900" : "bg-gray-800/20"
                  } hover:bg-gray-700/30`}
              >
                {columns.map((col) => (
                  <Cell
                    key={col}
                    col={col}
                    val={row[col]}
                    tableName={tableName}
                    highlightKey={isHighlightedRow ? String(row[col]) : null}
                    onFKClick={onFKClick}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DatabaseView() {
  const [tables, setTables] = useState<Tables>({});
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<string>("seen_events");
  const [highlight, setHighlight] = useState<{
    column: string;
    value: string;
  } | null>(null);

  async function load() {
    try {
      const data = await fetchDbTables();
      setTables(data.tables);
      setFetchedAt(data.fetchedAt);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 5s
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  function handleFKClick(targetTable: string, targetColumn: string, value: string) {
    setActiveTable(targetTable);
    setHighlight({ column: targetColumn, value });
    // Clear highlight after 3s
    setTimeout(() => setHighlight(null), 3000);
  }

  const rowCounts: Record<string, number> = {};
  for (const t of TABLE_ORDER) {
    rowCounts[t] = tables[t]?.length ?? 0;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table tab bar */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {TABLE_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTable(t); setHighlight(null); }}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors
              ${activeTable === t
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
          >
            {TABLE_LABELS[t]}
            <span className={`ml-1.5 ${activeTable === t ? "text-indigo-200" : "text-gray-600"}`}>
              {rowCounts[t]}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-gray-600">
              Updated {new Date(fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* FK legend */}
      {FK_MAP[activeTable] && (
        <div className="flex gap-3 mb-2 flex-wrap">
          {FK_MAP[activeTable].map((fk) => (
            <span key={fk.column} className="text-xs text-indigo-500">
              <span className="text-indigo-400 font-mono">{fk.column}</span>
              {" "}↗{" "}
              <span className="text-gray-500">{fk.targetTable}.{fk.targetColumn}</span>
            </span>
          ))}
        </div>
      )}

      {/* Highlight indicator */}
      {highlight && (
        <div className="mb-2 px-3 py-1.5 bg-indigo-900/40 border border-indigo-700/50 rounded text-xs text-indigo-300 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Highlighting rows where <span className="font-mono text-indigo-200 mx-1">{highlight.column}</span>
          = <span className="font-mono text-indigo-200 ml-1 truncate max-w-[240px]">{highlight.value}</span>
        </div>
      )}

      {/* Table content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-600 text-sm">
          Loading tables…
        </div>
      ) : (
        <TableView
          tableName={activeTable}
          rows={tables[activeTable] ?? []}
          highlightColumn={highlight?.column ?? null}
          highlightKey={highlight?.value ?? null}
          onFKClick={handleFKClick}
        />
      )}
    </div>
  );
}
