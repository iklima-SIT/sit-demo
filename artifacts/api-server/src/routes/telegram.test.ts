import assert from "node:assert/strict";
import test from "node:test";
import { createInitialConversationState, type RunConversationTurnOutput } from "@workspace/sit-engine";
import { renderTelegramText, splitTelegramText, telegramWebhookSecretMatches } from "./telegram";

test("Telegram webhook secret must be present and match", () => {
  assert.equal(telegramWebhookSecretMatches("secret", "secret"), true);
  assert.equal(telegramWebhookSecretMatches("wrong", "secret"), false);
  assert.equal(telegramWebhookSecretMatches(undefined, "secret"), false);
  assert.equal(telegramWebhookSecretMatches("secret", undefined), false);
});

test("Telegram output includes grounded messages and suggestions", () => {
  const output = {
    messages: [{ type: "text", text: "Here are two options." }],
    suggestions: ["Beach", "Food"],
    updatedState: createInitialConversationState(),
  } as RunConversationTurnOutput;
  assert.equal(renderTelegramText(output), "Here are two options.\n\n• Beach\n• Food");
});

test("Telegram replies are split below the API text limit", () => {
  const chunks = splitTelegramText(`${"a".repeat(80)}\n\n${"b".repeat(80)}`, 100);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every(chunk => chunk.length <= 100));
  assert.equal(chunks.join("").replace(/\s/g, ""), `${"a".repeat(80)}${"b".repeat(80)}`);
});
