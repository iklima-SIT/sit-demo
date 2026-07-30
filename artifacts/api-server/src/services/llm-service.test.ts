import assert from "node:assert/strict";
import test from "node:test";
import { startConversation } from "@workspace/sit-engine";
import { enhanceConversationWithLlm, isLlmEnabled } from "./llm-service";

test("LLM is opt-in and requires an API key", () => {
  assert.equal(isLlmEnabled({ SIT_LLM_ENABLED: "true" }), false);
  assert.equal(isLlmEnabled({ OPENAI_API_KEY: "test" }), false);
  assert.equal(isLlmEnabled({ SIT_LLM_ENABLED: "true", OPENAI_API_KEY: "test" }), true);
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

test("enabled LLM rewrites the first text message and preserves state", async () => {
  const output = startConversation();
  let requestBody: Record<string, unknown> | undefined;
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
  });

  assert.equal(result.messages[0]?.text, "A grounded, natural SIT reply.");
  assert.equal(result.updatedState.memory, output.updatedState.memory);
  assert.equal(result.updatedState.turns.at(-1)?.text, "A grounded, natural SIT reply.");
  assert.equal(requestBody?.model, "gpt-5.6-sol");
  assert.deepEqual(requestBody?.reasoning, { effort: "low" });
});
