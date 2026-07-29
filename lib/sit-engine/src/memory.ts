import type { ConversationMemory, MemoryUpdates, VenueReference } from "./types.js";
import { extractVenueFromText } from "./venues.js";
import { isAffirmative, isEventNarrowingRequest, isLocationRequest } from "./intent-router.js";

export const INITIAL_MEMORY: ConversationMemory = {
  currentMode: "discovery",
  onboardingStage: "purpose",
};

export function createInitialMemory(): ConversationMemory {
  return { ...INITIAL_MEMORY };
}

export function applyMemoryUpdates(memory: ConversationMemory, updates: MemoryUpdates): ConversationMemory {
  return {
    ...memory,
    ...Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    ),
  };
}

export function rememberVenueFromAssistantText(memory: ConversationMemory, text: string): ConversationMemory {
  const venue = extractVenueFromText(text);
  if (!venue) return memory;
  return applyMemoryUpdates(memory, { lastVenue: venue });
}

export function resolveVenueReference(text: string, memory: ConversationMemory): VenueReference | undefined {
  const explicitVenue = extractVenueFromText(text);
  if (explicitVenue) {
    return { id: explicitVenue, name: explicitVenue, source: "user" };
  }

  if (memory.lastVenue && isLocationRequest(text)) {
    return { id: memory.lastVenue, name: memory.lastVenue, source: "memory" };
  }

  if (memory.lastVenue && /\b(that one|this one|the first one|first one|that place)\b/i.test(text)) {
    return { id: memory.lastVenue, name: memory.lastVenue, source: "memory" };
  }

  return undefined;
}

export function isEventTomorrowFollowUp(text: string, memory: ConversationMemory): boolean {
  return memory.pendingEventFollowUp === "tomorrow" && isAffirmative(text);
}

export function isEventNarrowFollowUp(text: string, memory: ConversationMemory): boolean {
  return memory.pendingEventFollowUp === "narrow" && isEventNarrowingRequest(text);
}

export function getMemoryTrace(text: string, memory: ConversationMemory): string[] {
  const used: string[] = [];
  if (resolveVenueReference(text, memory)?.source === "memory") used.push("lastVenue");
  if (memory.pendingEventFollowUp) used.push("pendingEventFollowUp");
  if (memory.pendingUserRequest) used.push("pendingUserRequest");
  if (memory.originalRequest) used.push("originalRequest");
  if (memory.onboardingPaused) used.push("onboardingPaused");
  if (memory.lastTopic) used.push("lastTopic");
  if (memory.lastDestinationContext) used.push("lastDestinationContext");
  if (memory.stayingArea) used.push("stayingArea");
  return used;
}
