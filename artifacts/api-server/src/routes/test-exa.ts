import { Router, type IRouter } from "express";
import { createLiveEventSearchInput, searchLiveEvents } from "../services/event-service";

const router: IRouter = Router();

/**
 * GET /api/test-exa
 * Diagnostic endpoint — runs the same live event service used by production.
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

  try {
    const result = await searchLiveEvents(createLiveEventSearchInput("Koh Phangan events tonight"), apiKey);
    req.log.info({ httpStatus: result.httpStatus, query: result.queryUsed }, "test-exa diagnostic completed");

    res.json({
      ok: !result.fallback,
      keyStatus,
      httpStatus: result.httpStatus,
      queryUsed: result.queryUsed,
      timeWindow: result.timeWindow,
      rawResponse: result.rawResponse,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "test-exa diagnostic failed");
    res.json({
      ok: false,
      keyStatus,
      error,
    });
  }
});

export default router;
