import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialConversationState,
  type RunConversationTurnOutput,
} from "@workspace/sit-engine";
import {
  buildShadowAgentPrompt,
  runShadowAgentTurn,
  type ShadowAgentPlan,
} from "./shadow-agent";

function canonicalOutput(): RunConversationTurnOutput {
  const state = createInitialConversationState();
  return {
    messages: [{ type: "text", text: "Here are today's wellness events." }],
    updatedState: {
      ...state,
      activeTask: {
        id: "task-1",
        kind: "event_search",
        objective: "Find today's wellness events",
        mode: "information",
        originalMessage: "What's happening today for wellness?",
        status: "refinable",
      },
    },
    decision: {
      intent: "live_event_search",
      action: "call_live_events",
      answerMode: "service",
      requiredService: "events",
      memoryUpdates: {},
      debugReason: "Explicit filtered event request.",
    },
  };
}

function validPlan(): ShadowAgentPlan {
  return {
    mode: "information",
    relationshipToActiveTask: "new_task",
    activeObjective: "Find today's wellness events on Koh Phangan",
    action: "search_events",
    requiredServices: ["EventService"],
    knownConstraints: [
      { name: "date", value: "today", source: "current_message" },
      { name: "category", value: "wellness", source: "current_message" },
    ],
    missingCriticalContext: [],
    questionRequired: false,
    preservedContext: ["today", "wellness"],
    confidence: 0.96,
    decisionSummary: "The traveler already supplied the category and date, so Discovery is unnecessary.",
    proposedResponse: "Here are the wellness experiences happening today.",
    comparison: {
      agreesWithCanonical: true,
      differences: [],
    },
  };
}

test("shadow agent is disabled unless its feature flag is enabled", async () => {
  let called = false;
  const result = await runShadowAgentTurn({
    userMessage: "What's happening today for wellness?",
    channel: "test",
    stateBefore: createInitialConversationState(),
    canonicalOutput: canonicalOutput(),
    devTrace: true,
    env: {},
    fetchImpl: async () => {
      called = true;
      return new Response();
    },
  });

  assert.equal(result.status, "disabled");
  assert.equal(result.disabledReason, "shadow_flag_off");
  assert.equal(called, false);
});

test("shadow agent cannot run outside developer trace mode", async () => {
  const result = await runShadowAgentTurn({
    userMessage: "Where is Arcana?",
    channel: "web",
    stateBefore: createInitialConversationState(),
    canonicalOutput: canonicalOutput(),
    devTrace: false,
    env: {
      SIT_AGENT_SHADOW_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
    },
  });

  assert.equal(result.status, "disabled");
  assert.equal(result.disabledReason, "developer_trace_required");
});

test("shadow prompt preserves explicit context and active task state", () => {
  const state = createInitialConversationState();
  state.activeTask = {
    id: "task-previous",
    kind: "event_search",
    objective: "Find today's wellness events",
    mode: "information",
    originalMessage: "What's happening today for wellness?",
    status: "refinable",
  };
  state.memory.lastTimeLabel = "Today";

  const prompt = buildShadowAgentPrompt({
    userMessage: "Only free ones",
    channel: "web",
    stateBefore: state,
    canonicalOutput: canonicalOutput(),
  });

  assert.match(prompt.finalPrompt, /Only free ones/);
  assert.match(prompt.finalPrompt, /Find today's wellness events/);
  assert.match(prompt.finalPrompt, /lastTimeLabel/);
  assert.match(prompt.systemPrompt, /Only the traveler may replace the active objective/);
  assert.match(prompt.systemPrompt, /Never ask for information already present/);
});

test("shadow agent returns a structured comparison without changing canonical output", async () => {
  const canonical = canonicalOutput();
  let requestBody = "";
  const result = await runShadowAgentTurn({
    userMessage: "What's happening today for wellness?",
    channel: "web",
    stateBefore: createInitialConversationState(),
    canonicalOutput: canonical,
    devTrace: true,
    env: {
      SIT_AGENT_SHADOW_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      SIT_AGENT_MODEL: "test-model",
    },
    fetchImpl: async (_url, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({
        output_text: JSON.stringify(validPlan()),
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.model, "test-model");
  assert.equal(result.plan?.mode, "information");
  assert.deepEqual(result.plan?.preservedContext, ["today", "wellness"]);
  assert.match(requestBody, /Here are today's wellness events/);
  assert.equal(canonical.messages[0]?.text, "Here are today's wellness events.");
});

test("invalid model output is isolated as a shadow error", async () => {
  const result = await runShadowAgentTurn({
    userMessage: "Tomorrow instead",
    channel: "test",
    stateBefore: createInitialConversationState(),
    canonicalOutput: canonicalOutput(),
    devTrace: true,
    env: {
      SIT_AGENT_SHADOW_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
    },
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: "not-json",
    }), { status: 200 }),
  });

  assert.equal(result.status, "error");
  assert.match(result.error ?? "", /no JSON object/);
});
