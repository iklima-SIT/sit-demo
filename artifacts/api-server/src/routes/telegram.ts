import { Router, type IRouter, type Request, type Response } from "express";
import { runConversationTurn, type RunConversationTurnOutput } from "@workspace/sit-engine";
import { createApiConversationServices } from "../services/conversation-services";
import { sessionRepository } from "../repositories/session-repository";
import { enhanceConversationWithLlm } from "../services/llm-service";

const router: IRouter = Router();
const processedUpdates = new Map<number, number>();
const UPDATE_TTL_MS = 60 * 60 * 1000;
const TELEGRAM_TEXT_LIMIT = 4096;

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number; first_name?: string; username?: string };
  };
}

function cleanProcessedUpdates(now = Date.now()): void {
  for (const [updateId, processedAt] of processedUpdates) {
    if (now - processedAt > UPDATE_TTL_MS) processedUpdates.delete(updateId);
  }
}

export function telegramWebhookSecretMatches(
  provided: string | undefined,
  expected: string | undefined = process.env.TELEGRAM_WEBHOOK_SECRET,
): boolean {
  return Boolean(expected && provided && provided === expected);
}

export function renderTelegramText(output: RunConversationTurnOutput): string {
  const parts = output.messages
    .filter(message => message.type === "text")
    .map(message => message.text.trim())
    .filter(Boolean);

  if (output.suggestions?.length) {
    parts.push(output.suggestions.map(suggestion => `• ${suggestion}`).join("\n"));
  }
  if (output.planOptions?.length) {
    parts.push(output.planOptions.map(option => `• ${option}`).join("\n"));
  }
  return parts.join("\n\n").trim();
}

export function splitTelegramText(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  if (text.length <= limit) return text ? [text] : [];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit);
    const splitAt = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
    const boundary = splitAt > Math.floor(limit * 0.6) ? splitAt : limit;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}`);
  }
}

router.post("/integrations/telegram/webhook", async (req: Request, res: Response): Promise<void> => {
  const providedSecret = req.get("X-Telegram-Bot-Api-Secret-Token");
  if (!telegramWebhookSecretMatches(providedSecret)) {
    res.status(401).json({ ok: false, error: "Invalid Telegram webhook secret" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    req.log.error("TELEGRAM_BOT_TOKEN is not configured");
    res.status(503).json({ ok: false, error: "Telegram integration is not configured" });
    return;
  }

  const update = req.body as TelegramUpdate;
  const updateId = update.update_id;
  cleanProcessedUpdates();
  if (typeof updateId === "number" && processedUpdates.has(updateId)) {
    res.json({ ok: true, duplicate: true });
    return;
  }
  if (typeof updateId === "number") processedUpdates.set(updateId, Date.now());

  const chatId = update.message?.chat?.id;
  const message = update.message?.text?.trim();
  if (typeof chatId !== "number" || !message) {
    res.json({ ok: true, ignored: true });
    return;
  }

  try {
    const userKey = `telegram:${chatId}`;
    const session = await sessionRepository.loadOrCreate({ userKey, channel: "telegram" });
    const deterministicOutput = await runConversationTurn({
      message,
      state: session.state,
      channel: "telegram",
      services: createApiConversationServices(),
      devTrace: process.env.NODE_ENV === "development",
    });
    const output = await enhanceConversationWithLlm({
      userMessage: message,
      output: deterministicOutput,
    }).catch(error => {
      req.log.warn({ err: error }, "Telegram LLM enhancement failed; using deterministic SIT response");
      return deterministicOutput;
    });

    await sessionRepository.update(session.id, output.updatedState);
    const reply = renderTelegramText(output) || "I couldn't prepare a reply just now. Please try again.";
    for (const chunk of splitTelegramText(reply)) {
      await sendTelegramMessage(token, String(chatId), chunk);
    }
    res.json({ ok: true });
  } catch (error) {
    if (typeof updateId === "number") processedUpdates.delete(updateId);
    req.log.error({ err: error, updateId }, "Telegram webhook processing failed");
    res.status(500).json({ ok: false, error: "Telegram message processing failed" });
  }
});

export default router;
