import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * GET /api/test-exa
 * Diagnostic endpoint — runs a live Exa search for "Koh Phangan events tonight"
 * and returns the raw API response (no fallback, no SIT processing).
 */
router.get("/test-exa", async (req, res): Promise<void> => {
  const apiKey = process.env.EXA_API_KEY;

  const keyStatus = apiKey
    ? `SET (prefix: ${apiKey.slice(0, 8)}...)`
    : "NOT SET — add EXA_API_KEY to environment secrets";

  if (!apiKey) {
    res.json({
      ok: false,
      keyStatus,
      error: "EXA_API_KEY is missing",
    });
    return;
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Bangkok",
  });

  const searchQuery = `Koh Phangan Thailand events and parties happening tonight ${today}. Include event names, venues, start times, and DJ lineups if available.`;

  let rawStatus: number | null = null;
  let rawBody: unknown = null;
  let requestError: string | null = null;

  try {
    const exaRes = await fetch("https://api.exa.ai/answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: searchQuery,
        text: true,
      }),
    });

    rawStatus = exaRes.status;
    rawBody = await exaRes.json();

    req.log.info({ rawStatus, query: searchQuery }, "test-exa diagnostic completed");

    res.json({
      ok: exaRes.ok,
      keyStatus,
      httpStatus: rawStatus,
      queryUsed: searchQuery,
      rawResponse: rawBody,
    });
  } catch (err) {
    requestError = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "test-exa diagnostic failed");
    res.json({
      ok: false,
      keyStatus,
      httpStatus: rawStatus,
      queryUsed: searchQuery,
      error: requestError,
      rawResponse: rawBody,
    });
  }
});

export default router;
