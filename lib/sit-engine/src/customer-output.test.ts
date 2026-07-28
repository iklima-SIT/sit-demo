import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCustomerFacingText } from "./customer-output.js";

test("customer output removes internal confidence labels and scores", () => {
  assert.equal(
    sanitizeCustomerFacingText("• Yin Yoga — 10:00 AM, Orion · 500 THB · high confidence"),
    "• Yin Yoga — 10:00 AM, Orion · 500 THB",
  );
  assert.equal(
    sanitizeCustomerFacingText("Confidence: 92%\n\nThe event starts at 7 PM."),
    "The event starts at 7 PM.",
  );
  assert.equal(
    sanitizeCustomerFacingText("Source reliability: medium\nThe listing is not fully verified yet."),
    "The listing is not fully verified yet.",
  );
});

test("customer output preserves natural confidence language", () => {
  const text = "This is one of the places I'd confidently recommend.";
  assert.equal(sanitizeCustomerFacingText(text), text);
});
