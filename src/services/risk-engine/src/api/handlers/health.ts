const startTime = Date.now();

export async function healthHandler(): Promise<Response> {
  return Response.json({
    status: "ok",
    uptime: (Date.now() - startTime) / 1000,
    timestamp: new Date().toISOString(),
  });
}
