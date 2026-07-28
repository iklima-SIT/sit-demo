import type { AssistantMessage } from "./types.js";

const CONFIDENCE_LABEL = /(?:very\s+high|medium[-\s]+high|high|medium|low)\s+confidence/gi;
const CONFIDENCE_SCORE = /(?:source\s+)?confidence(?:\s+score)?\s*[:=]\s*\d+(?:\.\d+)?%?/gi;
const SOURCE_RELIABILITY_LABEL = /source\s+(?:reliability|quality)\s*[:=]\s*(?:very\s+high|high|medium|low)/gi;

export function sanitizeCustomerFacingText(text: string): string {
  return text
    .replace(new RegExp(`\\s*[·|]\\s*(?:${CONFIDENCE_LABEL.source}|${CONFIDENCE_SCORE.source}|${SOURCE_RELIABILITY_LABEL.source})`, "gi"), "")
    .replace(new RegExp(`^\\s*(?:${CONFIDENCE_LABEL.source}|${CONFIDENCE_SCORE.source}|${SOURCE_RELIABILITY_LABEL.source})\\s*[:.-]?\\s*$`, "gim"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeAssistantMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.map(message => ({
    ...message,
    text: sanitizeCustomerFacingText(message.text),
  }));
}
