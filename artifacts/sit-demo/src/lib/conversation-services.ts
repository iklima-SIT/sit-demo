import {
  createConversationServices,
  type ConversationServices,
  type EventSearchRequest,
  type EventSearchResult,
  type KBCard,
} from "@workspace/sit-engine";

async function searchEvents(request: EventSearchRequest): Promise<EventSearchResult> {
  try {
    const res = await fetch("/api/events/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: request.originalText ?? request.queryText,
        browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    if (!res.ok) return { response: null, fallback: true };
    return (await res.json()) as EventSearchResult;
  } catch {
    return { response: null, fallback: true };
  }
}

export function createWebConversationServices(knowledgeBase: KBCard[]): ConversationServices {
  return createConversationServices({
    knowledgeCards: knowledgeBase,
    events: {
      search: searchEvents,
    },
  });
}
