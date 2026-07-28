import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import XLSX from "xlsx";
import { createInitialConversationState, normalizeKnowledgeRows, runConversationTurn, type ConversationServices } from "@workspace/sit-engine";
import { importKnowledgeWorkbook } from "./services/knowledge-importer";
import { InMemoryKnowledgeRepository, type KnowledgeRepository } from "./repositories/knowledge-repository";
import { InMemorySessionRepository } from "./repositories/session-repository";
import { createApiConversationServices } from "./services/conversation-services";
import { buildDeveloperConsolePayload, createDeveloperConsoleRecorder } from "./services/developer-console";

function makeWorkbook(rows: unknown[][]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sit-kb-test-"));
  const filePath = path.join(dir, "kb.xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "V10_Master_Knowledge_Graph");
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

function makeServices(repository: KnowledgeRepository): ConversationServices {
  return {
    ...createApiConversationServices(repository),
    events: {
      async search(request) {
        return {
          response: `Events for ${request.queryText}`,
          fallback: false,
          sources: ["test"],
        };
      },
    },
  };
}

test("workbook import creates canonical knowledge cards and metadata", () => {
  const workbookPath = makeWorkbook([
    ["Card ID", "Category", "Topic", "Myth", "Reality", "Deep Local Insight", "Priority Score V10", "Confidence"],
    ["K1", "Wellness", "Ecstatic dance", "It is a party", "It is sober movement", "Go for the container, not the spectacle", 9, "high"],
  ]);

  const result = importKnowledgeWorkbook(workbookPath, {
    version: "test-version",
    importedAt: "2026-07-11T00:00:00.000Z",
  });

  assert.equal(result.bundle.cards.length, 1);
  assert.equal(result.bundle.metadata.version, "test-version");
  assert.equal(result.bundle.cards[0]!.topic, "Ecstatic dance");
  assert.equal(result.bundle.cards[0]!.deepLocalInsight, "Go for the container, not the spectacle");
});

test("invalid rows are rejected with useful errors", () => {
  const result = normalizeKnowledgeRows({
    sheetName: "V10_Master_Knowledge_Graph",
    sourceWorkbook: "bad.xlsx",
    version: "bad-version",
    importedAt: "2026-07-11T00:00:00.000Z",
    rows: [
      ["Card ID", "Category", "Topic"],
      ["BAD1", "", ""],
    ],
  });

  assert.equal(result.bundle.cards.length, 0);
  assert.equal(result.report.invalidRows.length, 1);
  assert.match(result.report.invalidRows[0]!.errors.join(" "), /category/);
  assert.match(result.report.invalidRows[0]!.errors.join(" "), /topic/);
});

test("knowledge repository exposes versioning", async () => {
  const normalized = normalizeKnowledgeRows({
    sheetName: "Iklima",
    sourceWorkbook: "kb.xlsx",
    version: "repo-version",
    importedAt: "2026-07-11T00:00:00.000Z",
    rows: [
      ["Card ID", "Category", "Topic", "Description"],
      ["K1", "Music", "Jungle parties", "Midweek nights are often stronger than obvious tourist nights."],
    ],
  });
  const repository = new InMemoryKnowledgeRepository(normalized.bundle);

  assert.equal(await repository.getVersion(), "repo-version");
  assert.equal((await repository.getImportMetadata()).cardCount, 1);
});

test("web and WhatsApp receive the same KB answer from the server repository", async () => {
  const normalized = normalizeKnowledgeRows({
    sheetName: "Iklima",
    sourceWorkbook: "kb.xlsx",
    version: "parity-version",
    importedAt: "2026-07-11T00:00:00.000Z",
    rows: [
      ["Card ID", "Category", "Topic", "Reality", "Deep Local Insight", "Priority Score V10"],
      ["K1", "Wellness", "Ecstatic dance", "Sober movement", "Ecstatic dance is about the container, not nightlife.", 10],
    ],
  });
  const repository = new InMemoryKnowledgeRepository(normalized.bundle);
  const services = makeServices(repository);

  const web = await runConversationTurn({
    message: "What is ecstatic dance?",
    state: createInitialConversationState(),
    channel: "web",
    services,
    devTrace: true,
  });
  const whatsapp = await runConversationTurn({
    message: "What is ecstatic dance?",
    state: createInitialConversationState(),
    channel: "whatsapp",
    services,
    devTrace: true,
  });

  assert.equal(web.decision?.intent, whatsapp.decision?.intent);
  assert.equal(web.decision?.requiredService, "knowledge");
  assert.equal(web.messages[0]!.text, whatsapp.messages[0]!.text);
  assert.equal(web.knowledge?.version, "parity-version");
  assert.equal(web.knowledge?.references[0]!.cardId, "K1");
});

test("persistent follow-up memory survives separate requests", async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ userKey: "u1", channel: "web" });
  const services = makeServices(new InMemoryKnowledgeRepository());

  const first = await runConversationTurn({
    message: "What parties are happening tonight?",
    state: session.state,
    channel: "web",
    services,
  });
  await sessions.update(session.id, first.updatedState);

  const loaded = await sessions.load(session.id);
  assert.equal(loaded?.state.memory.pendingEventFollowUp, "tomorrow");

  const second = await runConversationTurn({
    message: "yes",
    state: loaded!.state,
    channel: "web",
    services,
  });

  assert.equal(second.decision?.requiredService, "events");
  assert.equal(second.updatedState.memory.lastEvent?.scope, "tomorrow");
});

test("session reset returns a fresh conversation state", async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ userKey: "u1", channel: "web" });
  const updated = await sessions.update(session.id, {
    ...session.state,
    memory: { ...session.state.memory, lastVenue: "lighthouse" },
  });
  assert.equal(updated.state.memory.lastVenue, "lighthouse");

  const reset = await sessions.reset(session.id);
  assert.equal(reset.state.memory.lastVenue, undefined);
  assert.equal(reset.state.memory.onboardingStage, "purpose");
});

test("expired sessions are not loaded", async () => {
  const sessions = new InMemorySessionRepository(1);
  const session = await sessions.create({ userKey: "u1", channel: "web" });
  await sessions.expire(session.id);
  assert.equal(await sessions.load(session.id), undefined);
});

test("direct question overrides onboarding after session reload", async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ userKey: "u1", channel: "web" });
  await sessions.update(session.id, {
    ...session.state,
    memory: { ...session.state.memory, onboardingStage: "purpose" },
  });
  const loaded = await sessions.load(session.id);
  const output = await runConversationTurn({
    message: "What is ecstatic dance?",
    state: loaded!.state,
    channel: "web",
    services: makeServices(new InMemoryKnowledgeRepository()),
    devTrace: true,
  });

  assert.equal(output.decision?.intent, "definition");
  assert.equal(output.trace?.onboardingTriggered, false);
});

test("developer console records services, memory, knowledge, and state transitions without chain of thought", async () => {
  const normalized = normalizeKnowledgeRows({
    sheetName: "Iklima",
    sourceWorkbook: "kb.xlsx",
    version: "dev-console-version",
    importedAt: "2026-07-11T00:00:00.000Z",
    rows: [
      ["Card ID", "Category", "Topic", "Reality", "Deep Local Insight", "Priority Score V10"],
      ["K1", "Wellness", "Ecstatic dance", "Sober movement", "Ecstatic dance is a sober movement format.", 10],
      ["K2", "Music", "Jungle parties", "Late-night music", "Jungle parties are not the same as ecstatic dance.", 5],
    ],
  });
  const services = makeServices(new InMemoryKnowledgeRepository(normalized.bundle));
  const recorder = createDeveloperConsoleRecorder(services);
  const stateBefore = createInitialConversationState();
  const output = await runConversationTurn({
    message: "What is ecstatic dance?",
    state: stateBefore,
    channel: "web",
    services: recorder.services,
    devTrace: true,
  });

  const payload = buildDeveloperConsolePayload({
    userMessage: "What is ecstatic dance?",
    stateBefore,
    output,
    services: recorder.getCalls(),
  });

  assert.equal(payload.detectedIntent.intent, "definition");
  assert.equal(payload.detectedIntent.confidence, 1);
  assert.equal(payload.services.find(service => service.service === "KnowledgeService")?.called, true);
  assert.equal(payload.services.find(service => service.service === "EventService")?.status, "skipped");
  assert.deepEqual(payload.timeTrace.rejectedCandidates, []);
  assert.equal(payload.knowledgeRetrieval.cardsUsed[0]?.cardId, "K1");
  assert.ok(payload.knowledgeRetrieval.cardsRejected.length >= 1);
  assert.deepEqual(payload.decisionTrace, ["User", "Intent", "Memory", "Services", "Knowledge", "LLM", "Final Response"]);
  assert.match(payload.promptInspector.finalPrompt, /No LLM prompt/);
});

test("developer console exposes destination clock, browser timezone, cutoff, and filter reasons", async () => {
  const base = makeServices(new InMemoryKnowledgeRepository());
  const services: ConversationServices = {
    ...base,
    events: {
      async search(request) {
        return {
          response: "• Afternoon Breathwork — 4:00 PM, Ethos Shala",
          fallback: false,
          timeWindow: request.timeWindow,
          diagnostics: {
            destination: request.clock.destination,
            destinationTimezone: request.clock.timezone,
            destinationCurrentTime: request.clock.destinationCurrentTime,
            browserTimezone: request.clock.browserTimezone,
            filteringCutoff: request.clock.filteringCutoff,
            filterDecisions: [{
              event: "Afternoon Breathwork at Ethos Shala",
              included: true,
              reason: "Included because it matches wellness and remains active after the destination cutoff.",
            }],
          },
        };
      },
    },
  };
  const recorder = createDeveloperConsoleRecorder(services);
  const stateBefore = createInitialConversationState();
  const output = await runConversationTurn({
    message: "What's happening today for wellness?",
    state: stateBefore,
    channel: "web",
    services: recorder.services,
    devTrace: true,
    clientContext: { browserTimezone: "Europe/Rome" },
  });
  const payload = buildDeveloperConsolePayload({
    userMessage: "What's happening today for wellness?",
    stateBefore,
    output,
    services: recorder.getCalls(),
  });

  assert.equal(payload.timeTrace.destination, "Koh Phangan");
  assert.equal(payload.timeTrace.destinationTimezone, "Asia/Bangkok");
  assert.equal(payload.timeTrace.browserTimezone, "Europe/Rome");
  assert.match(payload.timeTrace.destinationCurrentTime ?? "", /\+07:00$/);
  assert.match(payload.timeTrace.filteringCutoff ?? "", /\+07:00$/);
  assert.match(payload.timeTrace.filterDecisions?.[0]?.reason ?? "", /matches wellness/);
});
