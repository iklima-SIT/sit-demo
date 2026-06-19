/**
 * POST /api/whatsapp
 *
 * Twilio WhatsApp webhook endpoint.
 *
 * Configure this URL in your Twilio console:
 *   Messaging → Senders → WhatsApp → Sandbox (or approved number)
 *   → "When a message comes in" → https://<your-domain>/api/whatsapp
 *   → HTTP POST
 *
 * Twilio sends URL-encoded form data. The fields used here are:
 *   Body  — the raw text of the incoming WhatsApp message
 *   From  — the sender's WhatsApp number, e.g. "whatsapp:+1234567890"
 *
 * Responses must be TwiML XML. For WhatsApp, only <Message> inside
 * <Response> is needed — no <Say> or <Dial>.
 *
 * Signature validation (TWILIO_AUTH_TOKEN env var) is commented out below.
 * Enable it in production to reject spoofed requests.
 */

import { Router, type IRouter, type Request, type Response } from "express";

// ── SIT conversation engine ────────────────────────────────────────────────
// Shared logic imported from @workspace/sit-engine.
// The same processMessage() and buildBrief() functions drive the web demo at
// artifacts/sit-demo/src/pages/chat.tsx — this webhook is a second consumer
// of the same engine, no logic duplication needed.
import {
  processMessage,  // parses user message, updates context, returns SIT's reply
  buildBrief,      // generates the personalized SIT Brief once context is rich enough
  type UserContext,
  type SITBrief,
  INITIAL_CTX,
} from "@workspace/sit-engine";

const router: IRouter = Router();

// ── Per-user session store ─────────────────────────────────────────────────
// Keyed by the WhatsApp "From" number (e.g. "whatsapp:+66812345678").
// Each session holds a UserContext that persists across messages in the same
// conversation — mirrors how the frontend accumulates state across turns.
//
// TTL: sessions older than SESSION_TTL_MS are reset automatically so
// memory doesn't grow unbounded on a long-running server.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const sessions = new Map<string, UserContext>();

function getSession(from: string): UserContext {
  const existing = sessions.get(from);
  if (existing && Date.now() - existing.lastActiveAt < SESSION_TTL_MS) {
    return existing;
  }
  // New session or expired — start fresh
  return { ...INITIAL_CTX, lastActiveAt: Date.now() };
}

// ── TwiML helpers ──────────────────────────────────────────────────────────

/** Wraps a plain-text reply in a TwiML <Response><Message> envelope. */
function twiml(body: string): string {
  // Escape XML special characters so the response is always valid XML
  const safe = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${safe}</Message>\n</Response>`;
}

/**
 * Formats a SITBrief as readable WhatsApp text.
 *
 * WhatsApp renders *text* as bold and supports line breaks, so we use
 * simple formatting rather than markdown or HTML.
 */
function formatBriefForWhatsApp(brief: SITBrief): string {
  const lines: string[] = [
    "── YOUR SIT BRIEF ──",
    "",
    "*What I think you're looking for*",
    brief.lookingFor,
    "",
    "*What I'd avoid*",
    ...brief.avoid.map(a => `– ${a}`),
    "",
    "*Where I'd suggest staying*",
    brief.stayArea,
    "",
    "*Experiences I'd prioritize*",
    ...brief.experiences.map(e => `– ${e}`),
    "",
    "*One local insight*",
    brief.localInsight,
    "",
    "──────────────────────",
    "Want me to build your plan? Reply:",
    "  *3* → 3-day plan",
    "  *7* → 7-day plan",
    "  *30* → 1-month stay",
  ];
  return lines.join("\n");
}

/** Short plan placeholder responses — in a real integration these would
 *  trigger a full itinerary generation step. */
function planResponse(duration: "3" | "7" | "30"): string {
  const map = {
    "3":  "A 3-day SIT plan is designed for depth, not coverage. I'd focus you on one area and a handful of the right experiences. Full plan coming soon.",
    "7":  "A week is enough to find your rhythm here. I'd structure it so the first half is exploration and the second is intentional. Full plan coming soon.",
    "30": "A month changes things. The first two weeks will still feel like a trip. After that, real life starts. I'd plan your month in two phases. Full itinerary coming soon.",
  };
  return map[duration];
}

// ── Webhook handler ────────────────────────────────────────────────────────

router.post("/whatsapp", (req: Request, res: Response) => {
  // Twilio sends URL-encoded form data (handled by express.urlencoded in app.ts)
  const rawBody: string = String(req.body.Body ?? "").trim();
  const from: string = String(req.body.From ?? "unknown");

  req.log.info({ from, bodyLength: rawBody.length }, "WhatsApp message received");

  // ── Handle empty messages ────────────────────────────────────────────────
  if (!rawBody) {
    res.setHeader("Content-Type", "text/xml");
    res.send(twiml("Hey, I didn't catch that. What brings you to Koh Phangan?"));
    return;
  }

  // ── Handle plan selection shortcuts ─────────────────────────────────────
  // After the brief is shown, users reply with "3", "7", or "30" to pick a plan.
  if (rawBody === "3" || rawBody === "7" || rawBody === "30") {
    res.setHeader("Content-Type", "text/xml");
    res.send(twiml(planResponse(rawBody as "3" | "7" | "30")));
    return;
  }

  // ── Retrieve (or create) the session for this WhatsApp number ───────────
  const ctx = getSession(from);

  // ── Call the SIT conversation engine ────────────────────────────────────
  // processMessage() is imported from @workspace/sit-engine.
  // It parses the user's message for signals (purpose, duration, scooter, etc.),
  // advances the conversation state machine, and returns SIT's next reply.
  const response = processMessage(rawBody, ctx);

  // Persist the updated context back into the session store
  sessions.set(from, response.updatedContext);

  // ── Check if we have enough context to generate the SIT Brief ───────────
  if (response.briefReady) {
    // First send the transition message ("I think I have a clear enough picture...")
    // then immediately follow with the brief.
    // On WhatsApp, multi-message replies require two separate TwiML responses,
    // so we combine both into a single message body for simplicity.

    // ── Generate the SIT Brief ─────────────────────────────────────────────
    // buildBrief() is imported from @workspace/sit-engine.
    // It uses the accumulated UserContext to produce a personalized SIT Brief.
    // On the web demo this renders as a rich card; here it becomes plain text.
    const brief: SITBrief = buildBrief(response.updatedContext);
    const briefText = formatBriefForWhatsApp(brief);

    req.log.info({ from, purpose: response.updatedContext.purpose }, "SIT Brief generated");

    res.setHeader("Content-Type", "text/xml");
    res.send(twiml(briefText));
    return;
  }

  // ── Standard reply ───────────────────────────────────────────────────────
  // Append suggestion chips as a hint when they exist (WhatsApp has no buttons
  // in the Sandbox, so we render them as inline text hints).
  let replyText = response.message;
  if (response.suggestions && response.suggestions.length > 0) {
    replyText += "\n\n" + response.suggestions.join("  ·  ");
  }

  req.log.info({ from, exchangeCount: response.updatedContext.exchangeCount }, "SIT reply sent");

  res.setHeader("Content-Type", "text/xml");
  res.send(twiml(replyText));
});

export default router;
