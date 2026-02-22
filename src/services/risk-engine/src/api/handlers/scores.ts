import { getPool } from "../../db";

const CORS = { "Access-Control-Allow-Origin": "*" };

function buildScoreResponse(
  score: Record<string, unknown>,
  corr: Record<string, unknown>,
): Record<string, unknown> {
  return {
    correlationId: score.correlation_id,
    orderId: score.order_id,
    merchantId: score.merchant_id,
    customerId: score.customer_id,
    totalScore: score.total_score,
    riskLevel: score.risk_level,
    signals: {
      ipVelocity: score.sig_ip_velocity,
      deviceReuse: score.sig_device_reuse,
      emailDomain: score.sig_email_domain,
      binMismatch: score.sig_bin_mismatch,
      chargebackHistory: score.sig_chargeback_history,
    },
    hasDispute: !!corr?.dispute_id,
    disputeReason: corr?.dispute_reason_code ?? null,
    scoredAt: score.scored_at,
    expiresAt: score.expires_at,
  };
}

async function queryScore(orderId: string): Promise<Response> {
  const pool = getPool();

  // Look up score (may be expired)
  const { rows: scoreRows } = await pool.query(
    `SELECT * FROM risk_scores WHERE order_id = $1 ORDER BY scored_at DESC LIMIT 1`,
    [orderId],
  );

  if (scoreRows.length > 0) {
    const score = scoreRows[0];
    const isExpired = new Date(score.expires_at as string) < new Date();

    const { rows: corrRows } = await pool.query(
      `SELECT * FROM correlations WHERE correlation_id = $1`,
      [score.correlation_id],
    );

    if (isExpired) {
      return Response.json(
        {
          status: "expired",
          error: `Score for ${orderId} has expired`,
          expiredAt: score.expires_at,
        },
        { status: 410, headers: CORS },
      );
    }

    return Response.json(
      {
        status: "found",
        data: buildScoreResponse(score, corrRows[0]),
      },
      { headers: CORS },
    );
  }

  // No score yet — check if we've seen the order at all
  const { rows: corrRows } = await pool.query(
    `SELECT * FROM correlations WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );

  if (corrRows.length > 0) {
    const corr = corrRows[0];
    const missing: string[] = [];
    if (!corr.order_payload) missing.push("order");
    if (!corr.payment_payload) missing.push("payment");
    if (!corr.dispute_payload) missing.push("dispute");

    return Response.json(
      {
        status: "pending",
        message: "Order found but scoring is not complete yet",
        receivedAt: corr.created_at,
        missingEvents: missing,
      },
      { status: 202, headers: CORS },
    );
  }

  return Response.json(
    { status: "not_found", error: `No score found for order ${orderId}` },
    { status: 404, headers: CORS },
  );
}

/** GET /scores/:orderId */
export async function scoreByOrderHandler(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const orderId = params["orderId"];
  if (!orderId) {
    return Response.json(
      { error: "Missing orderId" },
      { status: 400, headers: CORS },
    );
  }
  return queryScore(orderId);
}

/** GET /scores?merchant=&order= */
export async function scoreByMerchantHandler(
  req: Request,
): Promise<Response> {
  const url = new URL(req.url);
  const merchant = url.searchParams.get("merchant");
  const order = url.searchParams.get("order");

  if (!merchant || !order) {
    return Response.json(
      {
        error:
          "Both 'merchant' and 'order' query parameters are required",
      },
      { status: 400, headers: CORS },
    );
  }

  // Verify merchant owns the order
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT order_id FROM correlations WHERE order_id = $1 AND merchant_id = $2 LIMIT 1`,
    [order, merchant],
  );

  if (rows.length === 0) {
    return Response.json(
      {
        status: "not_found",
        error: `No order ${order} found for merchant ${merchant}`,
      },
      { status: 404, headers: CORS },
    );
  }

  return queryScore(order);
}
