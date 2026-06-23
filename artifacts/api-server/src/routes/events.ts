import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/events/search", async (req, res): Promise<void> => {
  const { query } = req.body as { query?: string };

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    res.json({ response: null, fallback: true });
    return;
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const searchQuery = `Koh Phangan Thailand events and parties happening tonight on ${today}. ${query}. Include: ecstatic dance, yoga events, live music, jungle parties, beach events, community gatherings. List event names, venues, and times if available.`;

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

    if (!exaRes.ok) {
      req.log.warn({ status: exaRes.status }, "Exa API non-OK response");
      res.json({ response: null, fallback: true });
      return;
    }

    const data = (await exaRes.json()) as {
      answer?: string;
      citations?: Array<{ url: string; title?: string }>;
    };

    const answer = data.answer?.trim() ?? null;
    const sources = data.citations?.map(c => c.url) ?? [];

    req.log.info({ sources: sources.length }, "Exa event search completed");
    res.json({ response: answer, fallback: !answer, sources });
  } catch (err) {
    req.log.error({ err }, "Exa API request failed");
    res.json({ response: null, fallback: true });
  }
});

export default router;
