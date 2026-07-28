import type {
  ConversationServices,
  EventService,
  KnowledgeService,
  LocationService,
  PlanService,
} from "./types.js";
import type { KBCard } from "./knowledge.js";
import { buildExpertAnswer, searchKBWithScore } from "./knowledge.js";
import { buildLocationAnswer, extractVenueFromText, getVenueByReference } from "./venues.js";

export function createKnowledgeService(kb: KBCard[]): KnowledgeService {
  return {
    async search(query, context) {
      const hits = searchKBWithScore(query, context.purpose, kb, 5);
      return {
        answer: buildExpertAnswer(query, hits, context.purpose),
        references: hits.map(hit => ({
          query,
          purpose: context.purpose,
          cardId: hit.card.id,
          topic: hit.card.topic,
          score: hit.score,
        })),
      };
    },
  };
}

export function createStaticLocationService(): LocationService {
  return {
    async resolve(query, memory) {
      const venueId = extractVenueFromText(query) ?? memory.lastVenue;
      const venue = venueId ? getVenueByReference(venueId) : undefined;
      return {
        answer: buildLocationAnswer(venueId ? `where is ${venueId}` : query),
        venueId,
        area: venue?.area,
      };
    },
  };
}

export function createPlaceholderPlanService(): PlanService {
  return {
    async generate() {
      return {
        message: "Here are a few options:",
        options: ["3-Day Plan", "7-Day Plan", "1-Month Plan"],
      };
    },
  };
}

export function createFallbackEventService(): EventService {
  return {
    async search() {
      return { response: null, fallback: true };
    },
  };
}

export function createConversationServices(overrides: Partial<ConversationServices> & { knowledgeCards?: KBCard[] } = {}): ConversationServices {
  return {
    events: overrides.events ?? createFallbackEventService(),
    knowledge: overrides.knowledge ?? createKnowledgeService(overrides.knowledgeCards ?? []),
    location: overrides.location ?? createStaticLocationService(),
    plans: overrides.plans ?? createPlaceholderPlanService(),
  };
}
