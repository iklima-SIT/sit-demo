import assert from "node:assert/strict";
import test from "node:test";
import { startConversation } from "@workspace/sit-engine";
import {
  decideLlmRouting,
  enhanceConversationWithLlm,
  isLlmEnabled,
} from "./llm-service";

test("LLM activates with an API key and can be explicitly disabled", () => {
  assert.equal(isLlmEnabled({ SIT_LLM_ENABLED: "true" }), false);
  assert.equal(isLlmEnabled({ OPENAI_API_KEY: "test" }), true);
  assert.equal(isLlmEnabled({ SIT_LLM_ENABLED: "true", OPENAI_API_KEY: "test" }), true);
  assert.equal(isLlmEnabled({ SIT_LLM_ENABLED: "false", OPENAI_API_KEY: "test" }), false);
});

test("disabled LLM returns the deterministic output unchanged", async () => {
  const output = startConversation();
  const result = await enhanceConversationWithLlm({
    userMessage: "What should I do tonight?",
    output,
    env: {},
  });
  assert.equal(result, output);
});

test("enabled LLM composes the final response and preserves canonical state", async () => {
  const output = startConversation();
  let requestBody: Record<string, unknown> | undefined;
  let traceStatus: string | undefined;
  const fetchImpl: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ output_text: "A grounded, natural SIT reply." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await enhanceConversationWithLlm({
    userMessage: "What should I do tonight?",
    output,
    env: {
      SIT_LLM_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6-sol",
    },
    fetchImpl,
    onTrace: trace => {
      traceStatus = trace.status;
    },
  });

  assert.equal(result.messages[0]?.text, "A grounded, natural SIT reply.");
  assert.equal(result.updatedState.memory, output.updatedState.memory);
  assert.equal(result.updatedState.turns.at(-1)?.text, "A grounded, natural SIT reply.");
  assert.equal(requestBody?.model, "gpt-5.6-sol");
  assert.deepEqual(requestBody?.reasoning, { effort: "none" });
  assert.equal(requestBody?.max_output_tokens, 500);
  assert.equal(requestBody?.store, false);
  assert.equal(traceStatus, "success");

  const input = requestBody?.input as Array<{ content: Array<{ text: string }> }>;
  assert.match(input[0]!.content[0]!.text, /current explicit objective has priority/i);
  assert.match(input[1]!.content[0]!.text, /Canonical SIT state and verified evidence/);
});

test("LLM failure emits a safe developer trace before falling back", async () => {
  const output = startConversation();
  let capturedError: string | undefined;

  await assert.rejects(() => enhanceConversationWithLlm({
    userMessage: "What should I do tomorrow?",
    output,
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
    onTrace: trace => {
      capturedError = trace.error;
    },
  }), /status 429/);

  assert.match(capturedError ?? "", /status 429/);
});

test("cost control skips OpenAI for exact location answers", async () => {
  const base = startConversation();
  const output = {
    ...base,
    decision: {
      intent: "location_request" as const,
      action: "resolve_location" as const,
      answerMode: "service" as const,
      requiredService: "location" as const,
      memoryUpdates: {},
      debugReason: "Exact location request",
    },
  };
  let fetchCalled = false;
  let disabledReason: string | undefined;

  const result = await enhanceConversationWithLlm({
    userMessage: "Where is Arcana?",
    output,
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("OpenAI should not be called");
    },
    onTrace: trace => {
      disabledReason = trace.disabledReason;
    },
  });

  assert.equal(fetchCalled, false);
  assert.equal(result, output);
  assert.equal(disabledReason, "cost_control");
  assert.equal(decideLlmRouting(output).tier, "none");
});

test("premium judgment routes planning to Sol with a bounded response", async () => {
  const base = startConversation();
  const output = {
    ...base,
    decision: {
      intent: "planning" as const,
      action: "show_plans" as const,
      answerMode: "service" as const,
      requiredService: "plans" as const,
      memoryUpdates: {},
      debugReason: "Personal itinerary request",
    },
  };
  let requestBody: Record<string, unknown> | undefined;

  await enhanceConversationWithLlm({
    userMessage: "Build the best three-day plan for me.",
    output,
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6-luna",
      OPENAI_PREMIUM_MODEL: "gpt-5.6-sol",
      OPENAI_PREMIUM_REASONING_EFFORT: "low",
      OPENAI_PREMIUM_MAX_OUTPUT_TOKENS: "800",
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: "A concise personal plan." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(requestBody?.model, "gpt-5.6-sol");
  assert.deepEqual(requestBody?.reasoning, { effort: "low" });
  assert.equal(requestBody?.max_output_tokens, 800);
  assert.equal(decideLlmRouting(output).tier, "premium");
});

test("event grounding excludes bulk diagnostics and caps event context", async () => {
  const base = startConversation();
  const events = Array.from({ length: 30 }, (_, index) => ({
    id: `event-${index}`,
    title: index === 8 ? "TITLE_08_SHOULD_NOT_APPEAR" : `Event ${index}`,
    venue: `Venue ${index}`,
    startTime: "2026-08-05T18:00:00+07:00",
    endTime: "2026-08-05T19:00:00+07:00",
  }));
  const output = {
    ...base,
    updatedState: {
      ...base.updatedState,
      memory: {
        ...base.updatedState.memory,
        lastEvent: {
          scope: "tonight" as const,
          query: "events tonight",
          events,
          availableEvents: events,
        },
      },
    },
    event: {
      diagnostics: {
        requestMode: "information" as const,
        resultState: "verified_results" as const,
        filterDecisions: Array.from({ length: 100 }, (_, index) => ({
          event: `Rejected ${index}`,
          included: false,
          reason: "Large debug-only explanation",
        })),
      },
    },
  };
  let requestBody: Record<string, unknown> | undefined;
  let estimatedInputTokens: number | undefined;

  await enhanceConversationWithLlm({
    userMessage: "What is happening tonight?",
    output,
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-5.6-luna" },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: "A short event summary." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    onTrace: trace => {
      estimatedInputTokens = trace.estimatedInputTokens;
    },
  });

  const input = requestBody?.input as Array<{ content: Array<{ text: string }> }>;
  const prompt = input[1]!.content[0]!.text;
  assert.match(prompt, /Event 7/);
  assert.doesNotMatch(prompt, /TITLE_08_SHOULD_NOT_APPEAR/);
  assert.doesNotMatch(prompt, /filterDecisions/);
  assert.ok((estimatedInputTokens ?? Infinity) < 5_000);
  assert.equal(requestBody?.model, "gpt-5.6-luna");
});

test("LLM context uses compact profile memory and retrieves relevant older turns", async () => {
  const base = startConversation();
  const output = {
    ...base,
    messages: [{ type: "text" as const, text: "Here is a grounded yoga suggestion." }],
    updatedState: {
      ...base.updatedState,
      context: {
        ...base.updatedState.context,
        firstName: "Maya",
        duration: "3 days",
        purpose: "wellness",
      },
      turns: [
        { role: "user" as const, text: "I loved YOGA_MEMORY at Sabai Yin Yoga Shala." },
        { role: "assistant" as const, text: "I will remember that yoga experience." },
        { role: "user" as const, text: "UNRELATED_OLD restaurant question." },
        { role: "assistant" as const, text: "An unrelated old answer." },
        { role: "user" as const, text: "Tell me about a beach." },
        { role: "assistant" as const, text: "Here is a beach." },
        { role: "user" as const, text: "What is the weather?" },
        { role: "assistant" as const, text: "It is warm." },
        { role: "user" as const, text: "Can you suggest yoga again?" },
        { role: "assistant" as const, text: "Here is a grounded yoga suggestion." },
      ],
    },
  };
  let requestBody: Record<string, unknown> | undefined;

  await enhanceConversationWithLlm({
    userMessage: "Can you suggest yoga again?",
    output,
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-5.6-luna" },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: "A concise remembered recommendation." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const input = requestBody?.input as Array<{ content: Array<{ text: string }> }>;
  const prompt = input[1]!.content[0]!.text;
  assert.match(prompt, /"firstName": "Maya"/);
  assert.match(prompt, /"tripDuration": "3 days"/);
  assert.match(prompt, /YOGA_MEMORY/);
  assert.doesNotMatch(prompt, /UNRELATED_OLD/);
  assert.doesNotMatch(prompt, /firstNameAsked/);
});

test("LLM cannot replace concrete listed options with a generic follow-up", async () => {
  const output = startConversation();
  output.messages = [{
    type: "text",
    text: [
      "You still have three solid plans:",
      "• Relaxed sunset: Alcove or Cintamani in Hinkong.",
      "• Flexible evening: dinner in Thong Sala and live music nearby.",
      "• Quiet option: a sunset picnic on Hinkong beach.",
    ].join("\n"),
  }];

  await assert.rejects(
    enhanceConversationWithLlm({
      userMessage: "What can I do tonight in Koh Phangan?",
      output,
      env: { SIT_LLM_ENABLED: "true", OPENAI_API_KEY: "test-key" },
      fetchImpl: async () => new Response(JSON.stringify({
        output_text: "I don't have reliable listings. Are you looking for nightlife or wellness?",
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    }),
    /omitted concrete options/,
  );
});
