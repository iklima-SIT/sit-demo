import { Router, type IRouter, type Request, type Response } from "express";
import {
  runConversationTurn,
  type SITBrief,
} from "@workspace/sit-engine";
import { createApiConversationServices } from "../services/conversation-services";
import { sessionRepository } from "../repositories/session-repository";

const router: IRouter = Router();

function twiml(body: string): string {
  const safe = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${safe}</Message>\n</Response>`;
}

function formatBriefForWhatsApp(brief: SITBrief): string {
  const lines: string[] = [
    "── YOUR SIT BRIEF ──",
    "",
    "*What I think you're looking for*",
    brief.lookingFor,
    "",
    "*What I'd avoid*",
    ...brief.avoid.map((a: string) => `– ${a}`),
    "",
    "*Where I'd suggest staying*",
    brief.stayArea,
    "",
    "*Experiences I'd prioritize*",
    ...brief.experiences.map((e: string) => `– ${e}`),
    "",
    "*One local insight*",
    brief.localInsight,
  ];
  return lines.join("\n");
}

function renderWhatsAppBody(output: Awaited<ReturnType<typeof runConversationTurn>>): string {
  const parts: string[] = [];

  if (output.brief && output.messages.length >= 2) {
    parts.push(output.messages[0]!.text);
    parts.push(formatBriefForWhatsApp(output.brief));
    parts.push(output.messages[1]!.text);
    parts.push(...output.messages.slice(2).map(message => message.text));
  } else {
    parts.push(...output.messages.map(message => message.text));
  }

  if (output.suggestions?.length) {
    parts.push(output.suggestions.join("  ·  "));
  }

  if (output.planOptions?.length) {
    parts.push(output.planOptions.map(option => `* ${option}`).join("\n"));
  }

  return parts.filter(Boolean).join("\n\n");
}

router.post("/whatsapp", async (req: Request, res: Response): Promise<void> => {
  const rawBody: string = String(req.body.Body ?? "").trim();
  const from: string = String(req.body.From ?? "unknown");

  req.log.info({ from, bodyLength: rawBody.length }, "WhatsApp message received");

  const session = await sessionRepository.loadOrCreate({ userKey: from, channel: "whatsapp" });
  const output = await runConversationTurn({
    message: rawBody,
    state: session.state,
    channel: "whatsapp",
    services: createApiConversationServices(),
    devTrace: process.env.NODE_ENV === "development",
  });

  await sessionRepository.update(session.id, output.updatedState);

  req.log.info({
    from,
    intent: output.decision?.intent,
    exchangeCount: output.updatedState.context.exchangeCount,
  }, "SIT WhatsApp reply sent");

  res.setHeader("Content-Type", "text/xml");
  res.send(twiml(renderWhatsAppBody(output)));
});

export default router;
