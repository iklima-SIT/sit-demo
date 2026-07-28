import { Router, type IRouter } from "express";
import { createLiveEventSearchInput, searchLiveEvents } from "../services/event-service";

const router: IRouter = Router();

router.post("/events/search", async (req, res): Promise<void> => {
  const { query, browserTimezone } = req.body as { query?: string; browserTimezone?: string };

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    res.json({ response: null, fallback: true, sources: [] });
    return;
  }

  try {
    const result = await searchLiveEvents(createLiveEventSearchInput(query, new Date(), browserTimezone), apiKey);
    req.log.info({ sources: result.sources.length, timeWindow: result.timeWindow }, "Exa event search completed");
    res.json({
      response: result.response,
      fallback: result.fallback,
      sources: result.sources,
      timeWindow: result.timeWindow,
    });
  } catch (err) {
    req.log.error({ err }, "Exa API request failed");
    res.json({ response: null, fallback: true, sources: [] });
  }
});

export default router;
