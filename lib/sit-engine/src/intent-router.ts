import type { ConversationMemory, Intent, AssistantDecision } from "./types.js";
import { resolveEventSearchFilters } from "./event-filters.js";
import { isPlaceRecommendationRequest } from "./places.js";

export type QueryIntent = Intent;

export function normalizeIntentText(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "");
}

export function isDefinitionQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/\b(tonight|todays?|tomorrows?|this week|this weekend|right now|happening now|what.?s on)\b/.test(normalizeIntentText(t))) return false;
  return /^(what is|what'?s a |what are|who is|who'?s|explain|describe|tell me (what|about)|how does|what do you mean|define)\b/i.test(t);
}

export function isDestinationContextRequest(text: string): boolean {
  const t = normalizeIntentText(text);
  return /\b(buddha day|buddhist holiday|asalha puja|asanha bucha|buddhist lent|khao phansa)\b/.test(t)
    || /\b(alcohol|liquor)\b.{0,50}\b(ban|banned|prohibited|restriction|restricted|sales?)\b/.test(t)
    || /\b(can i buy|can (?:bars?|venues?) sell)\b.{0,30}\b(alcohol|beer|wine|liquor)\b/.test(t);
}

export function isDestinationContextFollowUp(text: string, memory: ConversationMemory): boolean {
  if (memory.lastTopic !== "destination_context" || !memory.lastDestinationContext) return false;
  const t = normalizeIntentText(text).trim();
  return /^(?:and\s+)?(?:is\s+it\s+)?(?:today|tomorrow|now)\??$/.test(t)
    || /^(?:and\s+)?what about tomorrow\??$/.test(t)
    || /\b(until when|how long|can i buy alcohol|are bars open|can bars sell)\b/.test(t);
}

export function isEventQuery(text: string): boolean {
  if (isDefinitionQuestion(text)) return false;
  const t = normalizeIntentText(text);
  const temporal = /\b(tonight|todays?|tomorrows?|this (week|weekend|evening)|right now|happening now|whats on|what is on|whats going on|whats happening|stasera|oggi|domani|gece|gecesi|aksam|akşam|bugun|bugün|yarin|yarın)\b/.test(t) ||
    /\b\d{1,2}\s*(i|ı|si|sı|inci|uncu|üncü|nci)?\b.*\b(night|gece|gecesi|aksam|akşam)\b/.test(t);
  const eventIntent = /\b(event|events|party|parties|on|for|going on|happening|schedule|agenda|live|music|show|fare|facciamo|evento|eventi|serata|serate|musica|spettacolo|parti|muzik|müzik|etkinlik|konser|dj)\b/.test(t);
  const activityIntent = /\b(what (?:can|should|could) (?:i|we) do|what to do|things? to do|plans? for)\b/.test(t);
  return temporal && (eventIntent || activityIntent) || /\b(whats on|what is on|whats for tomorrows?|what is for tomorrows?|any (events|parties|shows) (tonight|today|tomorrows?))\b/.test(t);
}

export function isTomorrowEventQuery(text: string): boolean {
  return /\btomorrows?\b/i.test(normalizeIntentText(text));
}

export function isDirectQuestion(text: string): boolean {
  if (text.includes("?")) return true;
  return /^(what|where|when|how|who|which|is there|are there|can i|do you|is it|tell me about|recommend|suggest|any |does |will |should |could |find me|show me)/i.test(text.trim());
}

export function isLocationRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(?:road|route|ride|drive)\b.{0,80}\b(?:to|from)\b|\b(?:flat|steep|hilly|road condition)\b.{0,40}\broad\b/.test(t)) {
    return true;
  }
  if (/\b(how (do|can|to|do i) (get|reach|find|go)|how far|how long (does it take|to get)|get to|getting to|where is|where'?s|where can i find|directions? (to|from)|send .{0,20}(location|pin)|maps?|google maps|address|taxi|songthaew|scooter (to|from|how)|transport|shuttle|ferry|pier|airport|fly|flight|boat|distance|near|close to|located|from here|from there)\b/.test(t)) {
    return true;
  }
  if (/\blocation\b/.test(t)) return true;
  if (/^(directions?|maps?|where|address|pin|how to get there|how do i get there|get there|navigate|navigation)\??$/.test(t.trim())) return true;
  return /\b(drop (a |the )?pin|share .{0,10}(location|pin)|can you send .{0,20}(location|pin)|what'?s? the (address|pin))\b/.test(t);
}

export function isPlanningRequest(text: string): boolean {
  return /\b(itinerary|day.by.day|day \d|week plan|\d.day plan|build.*(plan|schedule)|create.*(plan|schedule)|write.*(plan|itinerary))\b/i.test(text);
}

export function isPracticalInformationRequest(text: string): boolean {
  const t = normalizeIntentText(text);
  return /\b(opening hours?|opening time|closing time|what time .{0,40}(open|close)|when .{0,40}(open|close)|is .{0,40} open)\b/.test(t) ||
    /\b(reservation|reserve|booking|book ahead|book in advance|walk[ -]?in|need to book)\b/.test(t) ||
    /\b(price|prices|cost|costs|entrance fee|entry fee|admission|how much)\b/.test(t);
}

export function isAdviceRequest(text: string): boolean {
  return /\b(right for me|is it worth|would i (enjoy|like|fit)|for someone like|my situation|should i (come|go|try|visit)|do you think i should)\b/i.test(text);
}

export function isRecommendationRequest(text: string): boolean {
  return /\b(best|recommend|suggest|where should|good place|top|favourite|where can i find|find me)\b/i.test(text);
}

export function isAffirmative(text: string): boolean {
  return /^(yes|yes please|yeah|yep|sure|ok|okay|please|do it|go ahead|evet|olur|tamam|bak|bakalim|bakalım)\.?$/i.test(text.trim());
}

export function isEventNarrowingRequest(text: string): boolean {
  return Boolean(resolveEventSearchFilters(text))
    || /\b(music|wellness|part(y|ies)|live|dj|techno|house|yoga|workshop|müzik|muzik|parti)\b/i.test(text);
}

export function isEventBroadeningRequest(text: string): boolean {
  return /\b(show me everything|show everything|all events|everything happening|full event landscape|broaden (?:it|this|the search))\b/i.test(text);
}

function isEventPreferenceRefinement(text: string, memory: ConversationMemory): boolean {
  const categories = memory.lastEvent?.filters?.categories
    ?? memory.originalRequest?.requestedFilters?.categories;
  if (!categories?.includes("wellness")) return false;
  return /\b(physical health|fitness|taking care of my body|recovery|proper rest|relaxation|spiritual|movement-based|social wellness)\b/i.test(text);
}

export function isEventContextFollowUp(text: string, memory: ConversationMemory): boolean {
  if (memory.lastTopic !== "events") return false;
  return isDateFollowUp(text)
    || isEventNarrowingRequest(text)
    || isEventBroadeningRequest(text)
    || isEventPreferenceRefinement(text, memory);
}

export function isDateFollowUp(text: string): boolean {
  return /\b(todays?|tonight|tomorrows?|this weekend|next weekend)\b/i.test(normalizeIntentText(text)) ||
    /\b(this )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(text) ||
    /\b\d{1,2}\s*(i|ı|si|sı|inci|uncu|üncü|nci)?\b/i.test(text);
}

export function classifyIntent(text: string, memory: ConversationMemory = {}): Intent {
  if (isDestinationContextRequest(text)) return "destination_context";
  if (isDestinationContextFollowUp(text, memory)) return "follow_up";
  if (isDefinitionQuestion(text)) return "definition";
  if (isEventQuery(text)) return "live_event_search";
  if (isPlaceRecommendationRequest(text)) return "place_recommendation";
  if (isLocationRequest(text)) return "location_request";
  if (isPracticalInformationRequest(text)) return "practical_information";
  if (memory.pendingEventFollowUp && isAffirmative(text)) return "follow_up";
  if (isEventContextFollowUp(text, memory)) return "follow_up";
  if (isPlanningRequest(text)) return "planning";
  if (isAdviceRequest(text)) return "advice";
  if (isRecommendationRequest(text)) return "recommendation";
  return "general_chat";
}

export function decideIntent(text: string, memory: ConversationMemory = {}): AssistantDecision {
  const intent = classifyIntent(text, memory);
  const requiredService = intent === "live_event_search"
    ? "events"
    : intent === "destination_context" || (intent === "follow_up" && memory.lastTopic === "destination_context")
      ? "destination_context"
    : intent === "place_recommendation"
      ? "recommendations"
    : intent === "location_request"
      ? "location"
      : intent === "planning"
        ? "plans"
      : intent === "practical_information" || intent === "definition" || intent === "recommendation" || intent === "advice"
        ? "knowledge"
        : "none";

  return {
    intent,
    action: intent === "live_event_search"
      ? "call_live_events"
      : intent === "destination_context" || (intent === "follow_up" && memory.lastTopic === "destination_context")
        ? "resolve_destination_context"
      : intent === "place_recommendation"
        ? "recommend_places"
      : intent === "location_request"
        ? "resolve_location"
        : intent === "planning"
          ? "show_plans"
        : intent === "general_chat"
          ? "continue_onboarding"
          : "retrieve_knowledge",
    answerMode: requiredService === "none" ? "text" : "service",
    requiredService,
    memoryUpdates: {},
    debugReason: `Intent classified as ${intent}`,
  };
}
