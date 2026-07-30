import { Router, type IRouter, type Request, type Response } from "express";
import { runConversationTurn, type ConversationChannel } from "@workspace/sit-engine";
import { createApiConversationServices } from "../services/conversation-services";
import { sessionRepository } from "../repositories/session-repository";
import { buildDeveloperConsolePayload, createDeveloperConsoleRecorder } from "../services/developer-console";
import { enhanceConversationWithLlm } from "../services/llm-service";

const router: IRouter = Router();

function asChannel(value: unknown): ConversationChannel {
  return value === "whatsapp" || value === "test" ? value : "web";
}

router.post("/conversation/session", async (req: Request, res: Response): Promise<void> => {
  const channel = asChannel(req.body.channel);
  const userKey = String(req.body.userKey || `${channel}:anonymous`);
  const session = await sessionRepository.loadOrCreate({ userKey, channel });
  res.json({ session });
});

router.post("/conversation/turn", async (req: Request, res: Response): Promise<void> => {
  const channel = asChannel(req.body.channel);
  const userKey = String(req.body.userKey || `${channel}:anonymous`);
  const message = String(req.body.message ?? "");
  const browserTimezone = typeof req.body.browserTimezone === "string"
    ? req.body.browserTimezone
    : undefined;
  const session = req.body.sessionId
    ? await sessionRepository.load(String(req.body.sessionId))
    : await sessionRepository.loadOrCreate({ userKey, channel });

  if (!session) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  const devTrace = process.env.NODE_ENV === "development" || Boolean(req.body.devTrace);
  const baseServices = createApiConversationServices();
  const recorder = devTrace ? createDeveloperConsoleRecorder(baseServices) : undefined;
  const stateBefore = structuredClone(session.state);

  const deterministicOutput = await runConversationTurn({
    message,
    state: session.state,
    channel,
    services: recorder?.services ?? baseServices,
    devTrace,
    clientContext: { browserTimezone },
  });
  const output = await enhanceConversationWithLlm({
    userMessage: message,
    output: deterministicOutput,
  }).catch(error => {
    req.log.warn({ err: error }, "LLM enhancement failed; using deterministic SIT response");
    return deterministicOutput;
  });

  const updatedSession = await sessionRepository.update(session.id, output.updatedState);
  res.json({
    ...output,
    session: updatedSession,
    developerConsole: devTrace && recorder
      ? buildDeveloperConsolePayload({
          userMessage: message,
          stateBefore,
          output,
          services: recorder.getCalls(),
        })
      : undefined,
  });
});

router.post("/conversation/reset", async (req: Request, res: Response): Promise<void> => {
  const sessionId = String(req.body.sessionId || "");
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  try {
    const session = await sessionRepository.reset(sessionId);
    res.json({ session });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Session not found" });
  }
});

export default router;
