import { healthHandler } from "./handlers/health";
import {
  scoreByOrderHandler,
  scoreByMerchantHandler,
} from "./handlers/scores";
import { eventsHandler } from "./handlers/events";
import { kafkaStatsHandler } from "./handlers/kafka-stats";
import { sseHandler } from "./handlers/sse";
import { dbTablesHandler } from "./handlers/db-tables";

type Handler = (
  req: Request,
  params: Record<string, string>,
) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function route(
  method: string,
  path: string,
  handler: Handler,
): Route {
  // Convert /scores/:orderId → regex + param names
  const paramNames: string[] = [];
  const regexStr = path
    .replace(/:([^/]+)/g, (_: string, name: string) => {
      paramNames.push(name);
      return "([^/?]+)";
    })
    .replace(/\//g, "\\/");
  return {
    method,
    pattern: new RegExp(`^${regexStr}$`),
    paramNames,
    handler,
  };
}

const routes: Route[] = [
  route("GET", "/health", healthHandler),
  route("GET", "/scores/:orderId", scoreByOrderHandler),
  route("GET", "/scores", scoreByMerchantHandler),
  route("GET", "/events", eventsHandler),
  route("GET", "/kafka/stats", kafkaStatsHandler),
  route("GET", "/stream", sseHandler),
  route("GET", "/db/tables", dbTablesHandler),
];

export function router(req: Request): Response | Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const match = r.pattern.exec(pathname);
    if (!match) continue;

    // Extract named params from capture groups
    const params: Record<string, string> = {};
    r.paramNames.forEach((name, i) => {
      params[name] = match[i + 1] ?? "";
    });

    return r.handler(req, params);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
