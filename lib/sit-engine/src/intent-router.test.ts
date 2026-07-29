import test from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_CTX,
  classifyIntent,
  decideAssistantAction,
  decideIntent,
  resolveVenueReference,
  type ConversationMemory,
} from "./index.js";

test("direct question overrides onboarding", () => {
  const decision = decideAssistantAction({
    userMessage: "Where should I stay?",
    context: INITIAL_CTX,
    memory: {},
  });

  assert.equal(decision.action, "retrieve_knowledge");
  assert.notEqual(decision.action, "continue_onboarding");
  assert.match(decision.debugReason, /Direct user question/);
});

test("location follow-up resolves last venue", () => {
  const memory: ConversationMemory = { lastVenue: "secret mountain" };
  const ref = resolveVenueReference("send location", memory);
  const decision = decideAssistantAction({
    userMessage: "send location",
    context: INITIAL_CTX,
    memory,
  });

  assert.equal(ref?.id, "secret mountain");
  assert.equal(ref?.source, "memory");
  assert.equal(decision.intent, "location_request");
  assert.equal(decision.requiredService, "location");
});

test("definition does not trigger event search", () => {
  assert.equal(classifyIntent("What is Full Moon party?"), "definition");
  const decision = decideAssistantAction({
    userMessage: "What is Full Moon party?",
    context: INITIAL_CTX,
    memory: {},
  });

  assert.equal(decision.intent, "definition");
  assert.notEqual(decision.requiredService, "events");
});

test("live event question triggers event service", () => {
  const decision = decideAssistantAction({
    userMessage: "what is happening tonight on the island?",
    context: INITIAL_CTX,
    memory: {},
  });

  assert.equal(decision.intent, "live_event_search");
  assert.equal(decision.action, "call_live_events");
  assert.equal(decision.requiredService, "events");
});

test("opening hours and reservation questions are practical information", () => {
  assert.equal(classifyIntent("What time does Ethos Cafe open?"), "practical_information");
  assert.equal(classifyIntent("Do I need a reservation at Ethos Cafe?"), "practical_information");
  assert.equal(decideIntent("How much is a class at Ethos?").requiredService, "knowledge");
});

test("repeated venue name does not restart onboarding", () => {
  const decision = decideAssistantAction({
    userMessage: "Secret Mountain",
    context: INITIAL_CTX,
    memory: {},
  });

  assert.equal(decision.intent, "location_request");
  assert.equal(decision.action, "resolve_location");
  assert.notEqual(decision.action, "continue_onboarding");
});

test("web and WhatsApp adapters can receive the same engine decision", () => {
  const input = {
    userMessage: "where is it?",
    context: INITIAL_CTX,
    memory: { lastVenue: "haad rin" } satisfies ConversationMemory,
  };

  const webDecision = decideAssistantAction(input);
  const whatsappDecision = decideAssistantAction(input);

  assert.deepEqual(webDecision, whatsappDecision);
  assert.equal(webDecision.requiredService, "location");
});

test("developer trace includes decision reason without changing the decision", () => {
  const decision = decideAssistantAction({
    userMessage: "what's on tonight?",
    context: INITIAL_CTX,
    memory: {},
    devTrace: true,
  });

  assert.equal(decision.trace?.detectedIntent, "live_event_search");
  assert.equal(decision.trace?.serviceSelected, "events");
  assert.equal(decision.trace?.onboardingTriggered, false);
});

test("Buddha Day is current destination context, not generic knowledge", () => {
  const decision = decideAssistantAction({
    userMessage: "Is it Buddha Day?",
    context: INITIAL_CTX,
    memory: {},
  });

  assert.equal(decision.intent, "destination_context");
  assert.equal(decision.action, "resolve_destination_context");
  assert.equal(decision.requiredService, "destination_context");
  assert.notEqual(decision.action, "continue_onboarding");
});

test("short date confirmation follows the active destination context", () => {
  const memory: ConversationMemory = {
    lastTopic: "destination_context",
    lastDestinationContext: {
      id: "th-2026-asalha-puja",
      destination: "Koh Phangan",
      timezone: "Asia/Bangkok",
      localDate: "2026-07-29",
      name: "Asalha Puja Day (Asanha Bucha)",
      aliases: ["Buddha Day"],
      type: "religious_holiday",
      sources: [],
      verifiedAt: "2026-07-29",
    },
  };

  const decision = decideAssistantAction({
    userMessage: "Is it today?",
    context: INITIAL_CTX,
    memory,
  });

  assert.equal(decision.intent, "follow_up");
  assert.equal(decision.requiredService, "destination_context");
});

test("an explicit itinerary request selects PlanService", () => {
  const decision = decideAssistantAction({
    userMessage: "Build me a 3-day plan",
    context: INITIAL_CTX,
    memory: {},
  });

  assert.equal(decision.intent, "planning");
  assert.equal(decision.action, "show_plans");
  assert.equal(decision.requiredService, "plans");
});
