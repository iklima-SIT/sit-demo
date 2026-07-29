import type {
  ConversationServices,
  EventService,
  KnowledgeService,
  LocationService,
  PlanService,
} from "./types.js";
import type { KBCard } from "./knowledge.js";
import { buildExpertAnswer, searchKBWithScore } from "./knowledge.js";
import {
  buildLocationAnswer,
  buildVenueGoogleMapsSearchUrl,
  extractLocationSubject,
  extractVenueFromText,
  findVenueLocationReference,
  formatVenueLocationReference,
  formatVenueRouteAnswer,
  formatVenueSearchLocation,
  formatVenueCard,
  getVenueByReference,
  isVenueRouteQuestion,
} from "./venues.js";

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
      const explicitVenueId = extractVenueFromText(query);
      const explicitSubject = extractLocationSubject(query, true);
      const venueId = explicitVenueId ?? (explicitSubject ? undefined : memory.lastVenue);
      const venue = venueId ? getVenueByReference(venueId) : undefined;
      if (venue) {
        const routeNote = /\b(?:thong\s*sala|tongsala)\b/i.test(query)
          ? [venue.transportNotes.fromThongSala, venue.transportNotes.walkNote].filter(Boolean).join(" ")
          : /\b(?:sri\s*thanu|srithanu)\b/i.test(query)
            ? [venue.transportNotes.fromSrithanu, venue.transportNotes.walkNote].filter(Boolean).join(" ")
            : venue.transportNotes.walkNote;
        return {
          answer: isVenueRouteQuestion(query)
            ? formatVenueRouteAnswer(venue.name, query, routeNote, venue.transportNotes.routeOptions)
            : formatVenueCard(venue),
          outcome: "resolved",
          venueId: venue.id,
          venueName: venue.name,
          area: venue.area,
          googleMapsUrl: venue.googleMapsUrl,
        };
      }

      const eventVenueReferences = memory.lastEvent?.availableVenueReferences
        ?? memory.lastEvent?.venueReferences
        ?? [];
      const recentVenueReferences = memory.lastVenueReference
        ? [memory.lastVenueReference, ...eventVenueReferences]
        : eventVenueReferences;
      const eventVenue = findVenueLocationReference(explicitSubject ?? venueId ?? query, recentVenueReferences);
      if (eventVenue) {
        return {
          answer: isVenueRouteQuestion(query)
            ? formatVenueRouteAnswer(eventVenue.name, query)
            : formatVenueLocationReference(eventVenue),
          outcome: "resolved",
          venueId: eventVenue.id,
          venueName: eventVenue.name,
          area: eventVenue.area,
          googleMapsUrl: eventVenue.googleMapsUrl,
        };
      }

      const subject = explicitSubject;
      if (subject) {
        const dynamicId = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const googleMapsUrl = buildVenueGoogleMapsSearchUrl(subject);
        return {
          answer: formatVenueSearchLocation(subject),
          outcome: "resolved",
          venueId: dynamicId || undefined,
          venueName: subject,
          googleMapsUrl,
        };
      }

      return {
        answer: buildLocationAnswer(venueId ? `where is ${venueId}` : query),
        outcome: "needs_clarification",
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
