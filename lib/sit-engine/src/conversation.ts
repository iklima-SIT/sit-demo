/**
 * SIT conversation engine — pure TypeScript, no framework dependencies.
 *
 * This module is the single source of truth for SIT's conversational logic.
 * It is imported by both browser and WhatsApp adapters.
 */

import type {
  ActiveConversationTask,
  AssistantDecision,
  ConversationMemory,
  ConversationState,
  DeveloperTrace,
  EventListingReference,
  EventReference,
  EventSearchResult,
  MemoryUpdates,
  RunConversationTurnInput,
  RunConversationTurnOutput,
  UserRequestContext,
  UserRequestMode,
  UserContext,
  VenueLocationReference,
  SITResponse,
  SITBrief,
} from "./types.js";
import { INITIAL_CTX } from "./types.js";
import { classifyIntent, isDateFollowUp, isDirectQuestion, isEventBroadeningRequest, isTomorrowEventQuery } from "./intent-router.js";
import { applyMemoryUpdates, getMemoryTrace, isEventNarrowFollowUp, isEventTomorrowFollowUp, rememberVenueFromAssistantText, resolveVenueReference } from "./memory.js";
import { buildEventFallback, buildHonestFallback } from "./knowledge.js";
import { KOH_PHANGAN_TIME_ZONE, createEventSearchRequest, hasExplicitEventTimeExpression, resolveEventFilteringCutoff, type EventSearchRequest } from "./time-resolver.js";
import type { EventSearchFilters } from "./event-filters.js";
import { sanitizeAssistantMessages } from "./customer-output.js";
import { extractLocationSubject, extractVenueFromText, findVenueLocationReference, venueNamesMatch } from "./venues.js";
import { resolvePlanDuration } from "./plans.js";
import { buildPlaceAreaQuestion, extractKohPhanganArea, inferPlaceCategory } from "./places.js";

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function toDisplayName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function detectFirstName(raw: string): string | undefined {
  const cleaned = raw
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/^(my name is|i am|i'm|im|call me|it's|its)\s+/i, "")
    .trim();
  if (!cleaned || cleaned.length > 40) return undefined;
  if (/[?]/.test(raw)) return undefined;
  if (/^(where|what|when|how|who|which|do|does|is|are|can|could|should|would|send|show|find|recommend|book|reserve)\b/i.test(cleaned)) return undefined;
  if (/\b(cafe|café|bar|restaurant|hotel|hostel|resort|beach|club|studio|shala|centre|center|school)\b/i.test(cleaned)) return undefined;
  if (detectPurpose(cleaned.toLowerCase()) || detectDuration(cleaned.toLowerCase())) return undefined;
  if (!/^[a-zA-Z][a-zA-Z' -]*$/.test(cleaned)) return undefined;
  return toDisplayName(cleaned);
}

function detectEmbeddedFirstName(raw: string): string | undefined {
  const match = raw.match(/\b(?:my name is|i am|i['’]m|im|call me)\s+([a-zA-Z][a-zA-Z' -]{0,39}?)(?=[,.!?\n]|$)/i);
  return match?.[1] ? detectFirstName(match[1]) : undefined;
}

export function detectAge(t: string): number | undefined {
  const match = t.match(/\b(?:i(?:'m| am)\s*)?([1-9][0-9])(?:\s*(?:years?\s*old|yo))?\b/);
  if (!match?.[1]) return undefined;
  const age = Number(match[1]);
  return age >= 13 && age <= 99 ? age : undefined;
}

export function detectGenderIdentity(raw: string): string | undefined {
  const t = raw.toLowerCase().trim();
  if (/prefer not|rather not|skip|not say|no need|private/.test(t)) return "not-shared";
  if (/\b(woman|female|girl|she\/her|she her)\b/.test(t)) return "woman";
  if (/\b(man|male|guy|he\/him|he him)\b/.test(t)) return "man";
  if (/\b(non.?binary|nonbinary|they\/them|they them|genderqueer|trans)\b/.test(t)) return "non-binary";
  const cleaned = raw.trim().replace(/[.!?]+$/g, "");
  if (cleaned.length > 0 && cleaned.length <= 40 && !/[?]/.test(cleaned)) return cleaned;
  return undefined;
}

export function detectPurpose(t: string): string | undefined {
  if (/wellness|yoga|health|spiritual|retreat|meditation|healing|detox|cleanse|mindful|ceremony/.test(t)) return "wellness";
  if (/music|party|parties|dance|dj|full.?moon|nightlife|rave|festival|electronic/.test(t)) return "music";
  if (/work|remote|laptop|productivity|cowork|startup|digital.?nomad|freelan|build/.test(t)) return "remote-work";
  if (/romance|partner|love|honeymoon|couple|girlfriend|boyfriend|romantic/.test(t)) return "romance";
  if (/community|friends|belong|connect|tribe/.test(t)) return "community";
  if (/nature|jungle|beach|swim|hike|outdoor|island|waterfall|adventure/.test(t)) return "nature";
  if (/move|relocate|live here|settle|expat|emigrat|permanent/.test(t)) return "moving";
  if (/not.?sure|unsure|don.?t know|open|flexible|reset|escape|break|burnout|tired|overwhelm|change/.test(t)) return "unsure";
  return undefined;
}

export function detectPurposeDetail(t: string, purpose?: string, existing?: string): string | undefined {
  if (/human connection|genuine connection|connection|belong|friends|meet people/.test(t)) return "human-connection";
  if (/through part|nightlife|club|dj|dancefloor|rave/.test(t)) return "connection-nightlife";
  if (/music venue|through music|live music|jam|open mic/.test(t)) return "connection-music";
  if (/wellness center|through wellness|healing center/.test(t)) return "connection-wellness";
  if (/through yoga|yoga class/.test(t)) return "connection-yoga";
  if (/workshop|class|learning/.test(t)) return purpose === "community" ? "connection-workshops" : "workshops";
  if (/volunteer|volunteering|help out/.test(t)) return "connection-volunteering";
  if (/cowork|co.?working|network|entrepreneur|founder|business/.test(t)) return "connection-networking";
  if (/sport|volleyball|climb|acro|movement/.test(t)) return "connection-sports";
  if (/beach gathering|sunset|beach/.test(t)) return "connection-beach";
  if (/conscious community|circle|men.?s circle|women.?s circle|intimate|deep conversation/.test(t)) return "connection-conscious";

  if (/rest|relax|nervous system|sleep|recover|recovery|burnout/.test(t)) return "wellness-rest";
  if (/spiritual|spirituality/.test(t)) return "spirituality";
  if (/personal growth|growth|inner work|transform/.test(t)) return "wellness-growth";
  if (/physical health|fitness|body|strong|stretch/.test(t)) return "wellness-physical";
  if (/\bmix\b|all of it|bit of everything/.test(t)) return existing ?? "mixed";

  if (/house|techno|minimal|psytrance|trance|reggae|commercial|ecstatic dance|live music/.test(t)) return "music-style";
  if (/great music|serious music|good music/.test(t)) return "music-broad";
  if (/social energy/.test(t)) return "music-social";
  if (/all.?night|all night|late/.test(t)) return "music-intense";

  if (/creative|creativity|art|artist|maker/.test(t)) return "creativity";
  if (/active|hiking|swimming|adventure/.test(t)) return "nature-active";
  if (/contemplative|quiet|sunset|calm/.test(t)) return "nature-quiet";
  if (/partner|couple|together/.test(t)) return "romance-partner";
  if (/solo/.test(t)) return "romance-solo";
  return undefined;
}

function shouldUpdatePurposeDetail(existing: string | undefined, detected: string): boolean {
  if (!existing) return true;
  if (existing === detected) return false;
  if (existing === "human-connection" && detected.startsWith("connection-")) return true;
  return needsSecondLayerDiscovery({ ...INITIAL_CTX, purposeDetail: existing });
}

function needsSecondLayerDiscovery(ctx: UserContext): boolean {
  const detail = ctx.purposeDetail;
  if (!detail || ctx.purposeDetailAsked) return false;
  return [
    "human-connection",
    "spirituality",
    "music-broad",
    "music-social",
    "creativity",
    "mixed",
  ].includes(detail);
}

function secondLayerFollowUp(ctx: UserContext): { message: string; suggestions?: string[] } {
  const detail = ctx.purposeDetail;
  if (detail === "human-connection") {
    return {
      message: "What kind of connection are you hoping to find — more social, more conscious, more creative, or more everyday island life?",
      suggestions: ["Parties", "Music venues", "Wellness centers", "Yoga", "Workshops", "Sports", "Beach gatherings", "Deep conversations"],
    };
  }
  if (detail === "spirituality") {
    return {
      message: "Do you mean a gentle spiritual atmosphere, a regular practice, or deeper ceremonies and containers?",
      suggestions: ["Gentle atmosphere", "Yoga or meditation", "Sound healing", "Ceremony", "Not sure yet"],
    };
  }
  if (detail === "music-broad" || detail === "music-social") {
    return {
      message: "What kind of music night usually works for you — proper sound, easy social energy, live music, or something more ecstatic?",
      suggestions: ["House / techno", "Psytrance", "Live music", "Ecstatic dance", "Easy social", "No strong preference"],
    };
  }
  if (detail === "creativity") {
    return {
      message: "Do you want creativity through making things, performing, meeting artists, or just being around that scene?",
      suggestions: ["Art workshops", "Music / performance", "Meet artists", "Creative community", "A bit of all"],
    };
  }
  return {
    message: "Which version of that feels closest to what you want?",
    suggestions: ["Social", "Wellness", "Creative", "Active", "Quiet", "Not sure yet"],
  };
}

export function detectDuration(t: string): string | undefined {
  if (/\b[345]\s*days?|\bfew days\b|long.?weekend/.test(t)) return "short";
  if (/\b(6|7|8|9|10)\s*days?|\bone\s*week|\b1\s*week/.test(t)) return "week";
  if (/\b(2|3|4)\s*weeks?|couple.?of?.?weeks|fortnight|10.?days/.test(t)) return "few-weeks";
  if (/\b(1|2|3)\s*months?|30.?days|60.?days/.test(t)) return "months";
  if (/long.?term|indefinite|moving|settling|permanent/.test(t)) return "long-term";
  return undefined;
}

export function detectScooter(t: string): string | undefined {
  if (/\byes\b|\bi do\b|i ride|i drive|can ride|comfortable|no problem|definitely/.test(t)) return "yes";
  if (/\bno\b|can.?t|don.?t ride|not comfortable|never ridden|afraid|too risky/.test(t)) return "no";
  if (/learn|trying|beginner|not confident|getting there/.test(t)) return "learning";
  if (/prefer not|taxi|grab|songthaew|rather not|avoid it/.test(t)) return "prefer-not";
  return undefined;
}

export function detectSociability(t: string): string | undefined {
  if (/alone|solo|myself|introvert|quiet|private|mostly.?alone|own.?pace/.test(t)) return "alone";
  if (/balanc|mix|both|middle|sometimes|depends|flexible/.test(t)) return "balanced";
  if (/social|people|meet|outgoing|extrovert|very.?social|love.?people|lots.?of/.test(t)) return "social";
  return undefined;
}

export function detectGroupComposition(t: string): string | undefined {
  if (/\b(solo|alone|myself|on my own)\b/.test(t)) return "solo";
  if (/\b(couple|partner|girlfriend|boyfriend|wife|husband|with my girl|with my guy)\b/.test(t)) return "couple";
  if (/\b(friend|friends|mate|mates)\b/.test(t)) return "friends";
  if (/\b(group|crew|team)\b/.test(t)) return "group";
  if (/\b(family|kids|children|child|parents)\b/.test(t)) return "family";
  return undefined;
}

function applyExplicitContextSignals(userMessage: string, ctx: UserContext, allowBarePurpose: boolean, allowPendingAnswers: boolean): UserContext {
  const t = userMessage.toLowerCase();
  const c = { ...ctx, lastActiveAt: Date.now() };
  if (!c.firstName) {
    c.firstName = detectEmbeddedFirstName(userMessage)
      ?? (allowPendingAnswers && c.firstNameAsked ? detectFirstName(userMessage) : undefined);
  }
  if (allowPendingAnswers && !c.age && c.ageAsked) c.age = detectAge(t);
  if (allowPendingAnswers && !c.genderIdentity && c.genderIdentityAsked) c.genderIdentity = detectGenderIdentity(userMessage);

  const containsPersonalNeed = /\b(i want|i need|i(?:'m| am) looking|i came|i(?:'m| am) here|hoping for|my focus)\b/.test(t);
  if (!c.purpose && (allowBarePurpose || containsPersonalNeed)) c.purpose = detectPurpose(t);
  const detectedDetail = c.purpose ? detectPurposeDetail(t, c.purpose, c.purposeDetail) : undefined;
  if (detectedDetail && shouldUpdatePurposeDetail(c.purposeDetail, detectedDetail)) {
    c.purposeDetail = detectedDetail;
  }
  if (!c.duration) c.duration = detectDuration(t);
  if (allowPendingAnswers && !c.scooter) c.scooter = detectScooter(t);
  if (allowPendingAnswers && !c.sociability) c.sociability = detectSociability(t);
  if (allowPendingAnswers && !c.groupComposition) c.groupComposition = detectGroupComposition(t);
  const routeOriginText = userMessage.match(/\bfrom\s+(.+?)\s+to\s+/i)?.[1];
  const statedStay = /\b(?:i(?:'m| am)\s+)?(?:staying|based|living)\s+in\b/i.test(userMessage);
  const explicitArea = extractKohPhanganArea(routeOriginText ?? (statedStay ? userMessage : ""));
  if (explicitArea) c.stayingArea = explicitArea;
  return c;
}

function hydrateContextFromProfile(context: UserContext, profile: Partial<UserContext> | undefined): UserContext {
  if (!profile) return context;
  return {
    ...context,
    firstName: context.firstName ?? profile.firstName,
    age: context.age ?? profile.age,
    genderIdentity: context.genderIdentity ?? profile.genderIdentity,
    purpose: context.purpose ?? profile.purpose,
    purposeDetail: context.purposeDetail ?? profile.purposeDetail,
    groupComposition: context.groupComposition ?? profile.groupComposition,
    stayingArea: context.stayingArea ?? profile.stayingArea,
    duration: context.duration ?? profile.duration,
    scooter: context.scooter ?? profile.scooter,
    sociability: context.sociability ?? profile.sociability,
  };
}

function isHumanConnectionContext(ctx: UserContext): boolean {
  return ctx.purpose === "community"
    && typeof ctx.purposeDetail === "string"
    && (ctx.purposeDetail === "human-connection" || ctx.purposeDetail.startsWith("connection-"));
}

function needsGroupCompositionQuestion(ctx: UserContext): boolean {
  return isHumanConnectionContext(ctx)
    && !needsSecondLayerDiscovery(ctx)
    && !ctx.groupComposition
    && !ctx.groupCompositionAsked;
}

// ─── Acknowledgments ──────────────────────────────────────────────────────────

function ack(purpose: string): string {
  const map: Record<string, string> = {
    wellness: "A lot of people come here for exactly that.",
    music: "You've picked the right island for it.",
    "remote-work": "Smart call — the infrastructure here has gotten serious.",
    romance: "Koh Phangan delivers on that one, when you know where to look.",
    community: "This island is unusually good at building that kind of thing.",
    nature: "There's more of it than the Instagram version lets on.",
    moving: "Interesting. A few thousand people have made exactly that move.",
    unsure: "Honestly, that's a valid way to arrive. Sometimes the island decides for you.",
  };
  return map[purpose] ?? "Good to know.";
}

export interface DecisionInput {
  userMessage: string;
  context: UserContext;
  memory: ConversationMemory;
  isPostBrief?: boolean;
  plansVisible?: boolean;
  devTrace?: boolean;
}

function buildTrace(
  userMessage: string,
  memory: ConversationMemory,
  decision: Omit<AssistantDecision, "trace">,
  onboardingTriggered: boolean,
): DeveloperTrace {
  return {
    detectedIntent: decision.intent,
    activeTopic: memory.lastTopic,
    memoryUsed: getMemoryTrace(userMessage, memory),
    serviceSelected: decision.requiredService,
    onboardingTriggered,
    reason: decision.debugReason,
  };
}

export function decideAssistantAction(input: DecisionInput): AssistantDecision {
  const trimmed = input.userMessage.trim();
  const venueRef = resolveVenueReference(trimmed, input.memory);
  const detectedIntent = classifyIntent(trimmed, input.memory);
  const onboardingIncomplete = !input.context.briefGenerated && input.memory.onboardingStage !== "complete";
  const informationModeUpdates = (): MemoryUpdates => ({
    currentMode: "information",
    onboardingPaused: onboardingIncomplete,
  });
  const bareVenueReference = Boolean(venueRef?.source === "user" && !isDirectQuestion(trimmed) && trimmed.split(/\s+/).length <= 4);

  let decision: Omit<AssistantDecision, "trace">;

  if (isEventTomorrowFollowUp(trimmed, input.memory)) {
    decision = {
      intent: "follow_up",
      action: "call_live_events",
      answerMode: "service",
      requiredService: "events",
      memoryUpdates: { pendingEventFollowUp: undefined, lastTopic: "events", ...informationModeUpdates() },
      debugReason: "Resolved affirmative reply against pending tomorrow event follow-up.",
    };
  } else if (detectedIntent === "follow_up" && isEventNarrowFollowUp(trimmed, input.memory)) {
    decision = {
      intent: "follow_up",
      action: "call_live_events",
      answerMode: "service",
      requiredService: "events",
      memoryUpdates: { pendingEventFollowUp: undefined, lastTopic: "events", ...informationModeUpdates() },
      debugReason: "Resolved category reply against pending event narrowing follow-up.",
    };
  } else if (venueRef && (
    detectedIntent === "location_request"
    || venueRef.source === "memory"
    || (bareVenueReference && detectedIntent !== "follow_up")
  )) {
    decision = {
      intent: "location_request",
      action: "resolve_location",
      answerMode: "service",
      requiredService: "location",
      memoryUpdates: { lastVenue: venueRef.id, ...informationModeUpdates() },
      debugReason: venueRef.source === "memory"
        ? "Resolved location request using lastVenue memory."
        : "Resolved location request from explicit venue reference.",
    };
  } else {
    const intent = detectedIntent;
    const direct = isDirectQuestion(trimmed);

    if (intent === "destination_context" || (intent === "follow_up" && input.memory.lastTopic === "destination_context")) {
      decision = {
        intent,
        action: "resolve_destination_context",
        answerMode: "service",
        requiredService: "destination_context",
        memoryUpdates: { lastTopic: "destination_context", ...informationModeUpdates() },
        debugReason: intent === "follow_up"
          ? "Resolved the short follow-up against the active destination holiday context."
          : "Current destination calendar request takes priority over onboarding and static knowledge.",
      };
    } else if (intent === "live_event_search") {
      decision = {
        intent,
        action: "call_live_events",
        answerMode: "service",
        requiredService: "events",
        memoryUpdates: { lastTopic: "events", ...informationModeUpdates() },
        debugReason: "Direct live event request takes priority over onboarding.",
      };
    } else if (intent === "place_recommendation") {
      decision = {
        intent,
        action: "recommend_places",
        answerMode: "service",
        requiredService: "recommendations",
        memoryUpdates: {
          lastTopic: "place_recommendation",
          currentMode: "local_expert",
          onboardingPaused: onboardingIncomplete,
        },
        debugReason: "A nearby-place request selected contextual area discovery before recommendation.",
      };
    } else if (intent === "follow_up" && input.memory.lastTopic === "events") {
      decision = {
        intent,
        action: "call_live_events",
        answerMode: "service",
        requiredService: "events",
        memoryUpdates: { lastTopic: "events", ...informationModeUpdates() },
        debugReason: "Resolved event-related follow-up from conversation memory.",
      };
    } else if (intent === "location_request") {
      decision = {
        intent,
        action: "resolve_location",
        answerMode: "service",
        requiredService: "location",
        memoryUpdates: { ...(venueRef ? { lastVenue: venueRef.id } : {}), ...informationModeUpdates() },
        debugReason: "Direct location request takes priority over onboarding.",
      };
    } else if (intent === "planning" || (input.isPostBrief && !input.plansVisible && /\b(plan|itinerary|schedule|day.by.day|show me (a |the )?plan|put together (a )?plan|yes (please|i (would|want))|yes.*(plan|itinerary)|i('d| would) (love|like) (a |that )?plan)\b/i.test(trimmed))) {
      decision = {
        intent: "planning",
        action: "show_plans",
        answerMode: "service",
        requiredService: "plans",
        memoryUpdates: { lastTopic: "planning", pendingFollowUp: undefined },
        debugReason: "Post-brief planning request selected the canonical PlanService.",
      };
    } else if (input.isPostBrief || direct || intent === "practical_information" || intent === "definition" || intent === "recommendation" || intent === "advice") {
      decision = {
        intent,
        action: "retrieve_knowledge",
        answerMode: "service",
        requiredService: "knowledge",
        memoryUpdates: direct || intent === "practical_information" || intent === "definition"
          ? informationModeUpdates()
          : {},
        debugReason: direct
          ? "Direct user question takes priority over onboarding."
          : "Post-brief or expert intent selected knowledge mode.",
      };
    } else {
      decision = {
        intent: "onboarding",
        action: "continue_onboarding",
        answerMode: "text",
        requiredService: "none",
        memoryUpdates: {
          currentMode: input.context.briefGenerated ? "local_expert" : "discovery",
          onboardingPaused: false,
        },
        debugReason: "No direct request detected; continue onboarding state machine.",
      };
    }
  }

  const fullDecision: AssistantDecision = { ...decision };
  if (input.devTrace) {
    fullDecision.trace = buildTrace(trimmed, input.memory, decision, decision.action === "continue_onboarding");
  }
  return fullDecision;
}

export function createInitialConversationState(): ConversationState {
  return {
    context: { ...INITIAL_CTX, lastActiveAt: Date.now() },
    memory: {
      currentMode: "discovery",
      onboardingStage: "purpose",
      onboardingPaused: false,
    },
    turns: [],
  };
}

export function startConversation(state: ConversationState = createInitialConversationState()): RunConversationTurnOutput {
  const messages = sanitizeAssistantMessages([
    { type: "text" as const, text: "Hey, I'm SIT. I help people make better calls on Koh Phangan, the kind a good local friend would make." },
    { type: "text" as const, text: "I'm glad you're here. What should I call you?" },
  ]);
  return {
    messages,
    updatedState: {
      ...state,
      context: {
        ...state.context,
        firstNameAsked: true,
      },
      memory: {
        ...state.memory,
        currentMode: "discovery",
        onboardingStage: "purpose",
      },
      turns: [
        ...state.turns,
        ...messages.map(message => ({
          role: "assistant" as const,
          text: message.text,
          timestamp: Date.now(),
        })),
      ],
    },
  };
}

function appendAssistantMessages(state: ConversationState, messages: Array<{ type: "text"; text: string }>, decision?: AssistantDecision): ConversationState {
  return {
    ...state,
    turns: [
      ...state.turns,
      ...messages.map(message => ({
        role: "assistant" as const,
        text: message.text,
        timestamp: Date.now(),
        decision,
      })),
    ],
  };
}

function appendUserTurn(state: ConversationState, text: string): ConversationState {
  return {
    ...state,
    turns: [
      ...state.turns,
      {
        role: "user",
        text,
        timestamp: Date.now(),
      },
    ],
  };
}

function applyAssistantTextMemory(state: ConversationState, messages: Array<{ type: "text"; text: string }>): ConversationState {
  return messages.reduce(
    (nextState, message) => ({
      ...nextState,
      memory: rememberVenueFromAssistantText(nextState.memory, message.text),
    }),
    state,
  );
}

function compactEventFilters(filters: EventSearchFilters): EventSearchFilters | undefined {
  if (!filters.categories?.length && !filters.audience && !filters.area && !filters.venue) return undefined;
  return filters;
}

function mergeEventFilters(
  previous: EventSearchFilters | undefined,
  explicit: EventSearchFilters | undefined,
  broadenCategories: boolean,
): EventSearchFilters | undefined {
  const venue = explicit?.venue ?? previous?.venue;
  return compactEventFilters({
    categories: broadenCategories ? undefined : explicit?.categories ?? previous?.categories,
    audience: explicit?.audience ?? previous?.audience,
    area: explicit?.area ?? previous?.area,
    ...(venue ? { venue } : {}),
  });
}

function buildUserRequestContext(message: string, request: EventSearchRequest): UserRequestContext {
  return {
    type: "event_search",
    originalMessage: message,
    requestMode: /\b(recommend|best|should i|right for me)\b/i.test(message) ? "decision" : "information",
    requestedDate: request.timeWindow.sourceExpression,
    requestedTimeWindow: request.timeWindow,
    requestedCategory: request.filters?.categories?.[0],
    requestedArea: request.filters?.area,
    requestedVenue: request.filters?.venue,
    requestedScope: request.filters?.venue ? "venue" : request.filters?.area ? "area" : "island-wide",
    requestedFilters: request.filters,
    unresolvedAmbiguities: request.timeWindow.clarificationNeeded ? ["time_window"] : [],
  };
}

function formatEventReferenceTime(event: EventListingReference): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: KOH_PHANGAN_TIME_ZONE,
  });
  return `${formatter.format(new Date(event.startTime))}-${formatter.format(new Date(event.endTime))}`;
}

function formatCachedVenueEvents(events: EventListingReference[], venue: string, label: string): string {
  const lines = [`At ${venue} ${label.toLowerCase()}:`, ""];
  for (const event of events) {
    const price = event.price ? ` · ${event.price}` : "";
    lines.push(`• ${event.title} — ${formatEventReferenceTime(event)}${price}`);
  }
  return lines.join("\n");
}

function sameTimeWindow(left: EventReference["timeWindow"], right: EventSearchRequest["timeWindow"]): boolean {
  return Boolean(left && left.startTime === right.startTime && left.endTime === right.endTime);
}

function mergeAvailableEvents(
  previous: EventListingReference[] | undefined,
  current: EventListingReference[] | undefined,
): EventListingReference[] | undefined {
  if (!previous?.length) return current;
  if (!current?.length) return previous;
  const eventKey = (event: EventListingReference) => [event.title, event.venue, event.startTime]
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, " ")
    .trim();
  return [...new Map([...previous, ...current].map(event => [eventKey(event), event])).values()];
}

function mergeAvailableVenueReferences(
  previous: VenueLocationReference[] | undefined,
  current: VenueLocationReference[] | undefined,
): VenueLocationReference[] | undefined {
  if (!previous?.length) return current;
  if (!current?.length) return previous;
  return [...new Map([...previous, ...current].map(reference => [reference.id, reference])).values()];
}

function clearPendingUserRequest(memory: ConversationMemory): ConversationMemory {
  const { pendingUserRequest: _pendingUserRequest, ...rest } = memory;
  return rest;
}

function createActiveTask(
  state: ConversationState,
  kind: ActiveConversationTask["kind"],
  mode: UserRequestMode,
  originalMessage: string,
  objective: string,
  status: ActiveConversationTask["status"],
): ActiveConversationTask {
  const userTurnCount = state.turns.filter(turn => turn.role === "user").length;
  return {
    id: `task-${userTurnCount}-${kind}`,
    kind,
    mode,
    originalMessage,
    objective,
    status,
  };
}

function isContractDecline(text: string): boolean {
  return /^(?:i\s+)?(?:don'?t know|do not know|not sure|never mind|nevermind|cancel|skip|no idea)[.!]?$/i.test(text.trim());
}

function canFulfilVenueContract(text: string): boolean {
  if (isContractDecline(text) || isDateFollowUp(text)) return false;
  if (/^(?:yes|no|okay|ok|sure|please|thanks?|thank you)[.!]?$/i.test(text.trim())) return false;
  return Boolean(extractLocationSubject(text, true));
}

function resolveActiveContract(
  message: string,
  state: ConversationState,
  devTrace: boolean | undefined,
): AssistantDecision | undefined {
  const task = state.activeTask;
  const contract = task?.contract;
  if (!task || !contract) return undefined;

  const globalIntent = classifyIntent(message, state.memory);
  const compatibleContractIntent = contract.expectedAnswer === "venue" && globalIntent === "location_request";
  const startsNewObjective = globalIntent !== "general_chat" && !compatibleContractIntent;
  if (startsNewObjective) return undefined;

  if (isContractDecline(message)) {
    const decision: AssistantDecision = {
      intent: "follow_up",
      action: "acknowledge",
      answerMode: "text",
      requiredService: "none",
      memoryUpdates: {},
      debugReason: `Traveler declined the active ${contract.expectedAnswer} conversation contract.`,
    };
    if (devTrace) {
      decision.trace = {
        ...buildTrace(message, state.memory, decision, false),
        memoryUsed: [...getMemoryTrace(message, state.memory), "activeTask.contract"],
      };
    }
    return decision;
  }

  if (contract.expectedAnswer === "venue" && canFulfilVenueContract(message)) {
    const onboardingIncomplete = !state.context.briefGenerated && state.memory.onboardingStage !== "complete";
    const decision: AssistantDecision = {
      intent: "location_request",
      action: "resolve_location",
      answerMode: "service",
      requiredService: "location",
      memoryUpdates: {
        currentMode: "information",
        onboardingPaused: onboardingIncomplete,
      },
      debugReason: "Consumed the message as the venue answer required by the active location contract.",
    };
    if (devTrace) {
      decision.trace = {
        ...buildTrace(message, state.memory, decision, false),
        memoryUsed: [...getMemoryTrace(message, state.memory), "activeTask.contract"],
      };
    }
    return decision;
  }

  if (contract.expectedAnswer === "venue") {
    const onboardingIncomplete = !state.context.briefGenerated && state.memory.onboardingStage !== "complete";
    const decision: AssistantDecision = {
      intent: "location_request",
      action: "resolve_location",
      answerMode: "service",
      requiredService: "location",
      memoryUpdates: {
        currentMode: "information",
        onboardingPaused: onboardingIncomplete,
      },
      debugReason: "Kept the active venue contract open because the reply did not identify a venue or start a new objective.",
    };
    if (devTrace) {
      decision.trace = {
        ...buildTrace(message, state.memory, decision, false),
        memoryUsed: [...getMemoryTrace(message, state.memory), "activeTask.contract"],
      };
    }
    return decision;
  }

  if (contract.expectedAnswer === "area") {
    const area = extractKohPhanganArea(message);
    const onboardingIncomplete = !state.context.briefGenerated && state.memory.onboardingStage !== "complete";
    const decision: AssistantDecision = {
      intent: "follow_up",
      action: "recommend_places",
      answerMode: area ? "service" : "text",
      requiredService: "recommendations",
      memoryUpdates: {
        ...(area ? { stayingArea: area, lastArea: area } : {}),
        lastTopic: "place_recommendation",
        currentMode: "local_expert",
        onboardingPaused: onboardingIncomplete,
      },
      debugReason: area
        ? "Consumed the area required by the active nearby-place recommendation contract."
        : "Kept the nearby-place recommendation contract open because no island area was identified.",
    };
    if (devTrace) {
      decision.trace = {
        ...buildTrace(message, state.memory, decision, false),
        memoryUsed: [...getMemoryTrace(message, state.memory), "activeTask.contract"],
      };
    }
    return decision;
  }

  return undefined;
}

function resolveActiveLocationRefinement(
  message: string,
  state: ConversationState,
  devTrace: boolean | undefined,
): AssistantDecision | undefined {
  if (state.activeTask?.kind !== "location" || state.activeTask.contract) return undefined;
  if (classifyIntent(message, state.memory) !== "general_chat") return undefined;

  const eventVenueReferences = state.memory.lastEvent?.availableVenueReferences
    ?? state.memory.lastEvent?.venueReferences
    ?? [];
  const recentVenueReferences = state.memory.lastVenueReference
    ? [state.memory.lastVenueReference, ...eventVenueReferences]
    : eventVenueReferences;
  const knownVenue = extractVenueFromText(message);
  const eventVenue = findVenueLocationReference(message, recentVenueReferences);
  const isCorrection = /\b(?:not asking|i mean|i meant|instead)\b/i.test(message);
  if (!knownVenue && !eventVenue && !isCorrection) return undefined;
  if (!extractLocationSubject(message, true)) return undefined;

  const onboardingIncomplete = !state.context.briefGenerated && state.memory.onboardingStage !== "complete";
  const decision: AssistantDecision = {
    intent: "location_request",
    action: "resolve_location",
    answerMode: "service",
    requiredService: "location",
    memoryUpdates: {
      currentMode: "information",
      onboardingPaused: onboardingIncomplete,
    },
    debugReason: "Resolved the message as an explicit venue correction within the active location task.",
  };
  if (devTrace) {
    decision.trace = {
      ...buildTrace(message, state.memory, decision, false),
      memoryUsed: [...getMemoryTrace(message, state.memory), "activeTask"],
    };
  }
  return decision;
}

export async function runConversationTurn(input: RunConversationTurnInput): Promise<RunConversationTurnOutput> {
  const trimmed = input.message.trim();
  if (!trimmed && input.state.turns.length === 0) {
    return startConversation(input.state);
  }

  let workingState = appendUserTurn(input.state, trimmed);
  const rememberedContext = hydrateContextFromProfile(workingState.context, workingState.memory.userProfile);
  const explicitContext = applyExplicitContextSignals(trimmed, rememberedContext, false, false);
  workingState = {
    ...workingState,
    context: explicitContext,
    memory: {
      ...workingState.memory,
      stayingArea: explicitContext.stayingArea ?? workingState.memory.stayingArea,
      userProfile: {
        ...workingState.memory.userProfile,
        firstName: explicitContext.firstName,
        age: explicitContext.age,
        genderIdentity: explicitContext.genderIdentity,
        purpose: explicitContext.purpose,
        purposeDetail: explicitContext.purposeDetail,
        groupComposition: explicitContext.groupComposition,
        stayingArea: explicitContext.stayingArea,
        duration: explicitContext.duration,
        scooter: explicitContext.scooter,
        sociability: explicitContext.sociability,
      },
    },
  };
  const confirmedTomorrowFollowUp = isEventTomorrowFollowUp(trimmed, workingState.memory);
  const broadensEventSearch = isEventBroadeningRequest(trimmed);
  const contractDecision = resolveActiveContract(trimmed, workingState, input.devTrace);
  const locationRefinementDecision = contractDecision
    ? undefined
    : resolveActiveLocationRefinement(trimmed, workingState, input.devTrace);
  const decision = contractDecision ?? locationRefinementDecision ?? decideAssistantAction({
    userMessage: trimmed,
    context: workingState.context,
    memory: workingState.memory,
    isPostBrief: workingState.context.briefGenerated,
    devTrace: input.devTrace,
  });

  workingState = {
    ...workingState,
    memory: applyMemoryUpdates(workingState.memory, decision.memoryUpdates),
  };

  if (decision.action === "acknowledge") {
    const messages = sanitizeAssistantMessages([{
      type: "text" as const,
      text: "No problem. Tell me the venue whenever you have it.",
    }]);
    workingState = {
      ...workingState,
      activeTask: workingState.activeTask
        ? { ...workingState.activeTask, status: "abandoned", contract: undefined }
        : undefined,
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    return {
      messages,
      updatedState: workingState,
      trace: decision.trace,
      decision,
    };
  }

  if (decision.action === "show_plans") {
    workingState = {
      ...workingState,
      activeTask: createActiveTask(
        workingState,
        "planning",
        "decision",
        trimmed,
        "Build a plan for the traveler",
        "gathering_evidence",
      ),
    };
    const requestedDuration = resolvePlanDuration(trimmed) ?? workingState.context.duration;
    const plan = await input.services.plans.generate(workingState.context, requestedDuration);
    const messages = sanitizeAssistantMessages([{ type: "text" as const, text: plan.message }]);
    workingState = {
      ...workingState,
      activeTask: workingState.activeTask
        ? { ...workingState.activeTask, status: "refinable" }
        : undefined,
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    return {
      messages,
      planOptions: plan.options,
      updatedState: workingState,
      trace: decision.trace,
      decision,
    };
  }

  if (decision.action === "resolve_destination_context") {
    const destinationTask = createActiveTask(
      workingState,
      "destination_context",
      "information",
      trimmed,
      "Answer a current destination calendar or operating-context question",
      "gathering_evidence",
    );
    workingState = { ...workingState, activeTask: destinationTask };
    const destinationContext = await input.services.destinationContext.resolve(trimmed, {
      state: workingState,
      now: input.now ?? new Date(),
    });
    const messages = sanitizeAssistantMessages([{ type: "text" as const, text: destinationContext.answer }]);
    workingState = {
      ...workingState,
      activeTask: { ...destinationTask, status: "refinable" },
      memory: {
        ...workingState.memory,
        lastTopic: "destination_context",
        lastDestinationContext: destinationContext.reference ?? workingState.memory.lastDestinationContext,
      },
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    return {
      messages,
      updatedState: workingState,
      trace: decision.trace,
      decision,
      destinationContext: {
        reference: destinationContext.reference,
        destinationLocalTime: destinationContext.destinationLocalTime,
        matchedFromMemory: destinationContext.matchedFromMemory,
      },
    };
  }

  if (decision.action === "recommend_places") {
    const activeRecommendationTask = workingState.activeTask?.kind === "place_recommendation"
      ? workingState.activeTask
      : undefined;
    const originalQuery = activeRecommendationTask?.originalMessage ?? trimmed;
    const category = inferPlaceCategory(originalQuery);
    const area = extractKohPhanganArea(trimmed)
      ?? workingState.memory.stayingArea
      ?? workingState.context.stayingArea;

    if (!area) {
      const recommendationTask = activeRecommendationTask ?? createActiveTask(
        workingState,
        "place_recommendation",
        "decision",
        trimmed,
        "Recommend nearby places without sending the traveler across the island",
        "awaiting_clarification",
      );
      const messages = sanitizeAssistantMessages([{
        type: "text" as const,
        text: buildPlaceAreaQuestion(category),
      }]);
      workingState = {
        ...workingState,
        activeTask: {
          ...recommendationTask,
          status: "awaiting_clarification",
          contract: {
            expectedAnswer: "area",
            reason: "The traveler's staying area materially changes nearby place recommendations.",
            mode: "decision",
            createdFromAction: "recommend_places",
          },
        },
      };
      workingState = appendAssistantMessages(workingState, messages, decision);
      return {
        messages,
        suggestions: ["Sri Thanu", "Thong Sala", "Hinkong", "Baan Tai", "Haad Rin", "North coast"],
        updatedState: workingState,
        trace: decision.trace,
        decision,
      };
    }

    const recommendationTask = activeRecommendationTask ?? createActiveTask(
      workingState,
      "place_recommendation",
      "decision",
      originalQuery,
      "Recommend nearby places without sending the traveler across the island",
      "gathering_evidence",
    );
    workingState = { ...workingState, activeTask: recommendationTask };
    const recommendation = await input.services.recommendations.recommend({
      query: originalQuery,
      area,
      category,
    }, workingState);
    const messages = sanitizeAssistantMessages([{ type: "text" as const, text: recommendation.answer }]);
    const userProfile = { ...workingState.memory.userProfile, stayingArea: recommendation.area };
    workingState = {
      ...workingState,
      context: { ...workingState.context, stayingArea: recommendation.area },
      activeTask: { ...recommendationTask, status: "refinable", contract: undefined },
      memory: {
        ...workingState.memory,
        stayingArea: recommendation.area,
        lastArea: recommendation.area,
        lastTopic: "place_recommendation",
        userProfile,
      },
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    return {
      messages,
      updatedState: workingState,
      trace: decision.trace,
      decision,
      recommendation: {
        area: recommendation.area,
        category: recommendation.category,
        googleMapsUrls: recommendation.googleMapsUrls,
      },
    };
  }

  if (decision.action === "resolve_location") {
    const locationTask = contractDecision && workingState.activeTask?.kind === "location"
      ? workingState.activeTask
      : createActiveTask(
          workingState,
          "location",
          "information",
          trimmed,
          "Provide a venue location",
          "gathering_evidence",
        );
    workingState = { ...workingState, activeTask: locationTask };
    const location = await input.services.location.resolve(trimmed, workingState.memory);
    const messages = sanitizeAssistantMessages([{ type: "text" as const, text: location.answer }]);
    const needsClarification = location.outcome === "needs_clarification";
    const lastVenueReference = !needsClarification && location.venueId && location.venueName && location.googleMapsUrl
      ? {
          id: location.venueId,
          name: location.venueName,
          aliases: [location.venueName],
          area: location.area,
          googleMapsUrl: location.googleMapsUrl,
        }
      : workingState.memory.lastVenueReference;
    workingState = {
      ...workingState,
      activeTask: {
        ...locationTask,
        status: needsClarification ? "awaiting_clarification" : "refinable",
        contract: needsClarification
          ? {
              expectedAnswer: "venue",
              reason: "A venue name is required before SIT can provide a location.",
              mode: "information",
              createdFromAction: "resolve_location",
            }
          : undefined,
      },
      memory: {
        ...workingState.memory,
        lastVenue: location.venueId ?? workingState.memory.lastVenue,
        lastVenueReference,
        lastArea: location.area ?? workingState.memory.lastArea,
      },
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    return {
      messages,
      updatedState: workingState,
      trace: decision.trace,
      decision,
    };
  }

  if (decision.action === "call_live_events") {
    const now = input.now ?? new Date();
    const eventQuery = confirmedTomorrowFollowUp ? "tomorrow events on Koh Phangan" : trimmed;
    const resolvedEventRequest = createEventSearchRequest(eventQuery, now, {
      browserTimezone: input.clientContext?.browserTimezone,
    });
    const previousEvent = workingState.memory.lastEvent;
    const originalRequest = workingState.memory.originalRequest;
    const previousWindow = previousEvent?.timeWindow ?? originalRequest?.requestedTimeWindow;
    const shouldPreserveWindow = decision.intent === "follow_up"
      && !confirmedTomorrowFollowUp
      && !hasExplicitEventTimeExpression(trimmed)
      && Boolean(previousWindow);
    const timeWindow = shouldPreserveWindow ? previousWindow! : resolvedEventRequest.timeWindow;
    const previousFilters = previousEvent?.filters ?? originalRequest?.requestedFilters;
    const mergedFilters = decision.intent === "follow_up"
      ? mergeEventFilters(previousFilters, resolvedEventRequest.filters, broadensEventSearch)
      : resolvedEventRequest.filters;
    const previousAvailableVenueReferences = previousEvent?.availableVenueReferences
      ?? previousEvent?.venueReferences;
    const previousAvailableEvents = previousEvent?.availableEvents
      ?? previousEvent?.events;
    const matchingVenueReference = mergedFilters?.venue
      ? findVenueLocationReference(mergedFilters.venue, previousAvailableVenueReferences)
      : undefined;
    const filters = mergedFilters?.venue && matchingVenueReference
      ? { ...mergedFilters, venue: matchingVenueReference.name }
      : mergedFilters;
    const eventRequest = {
      ...resolvedEventRequest,
      timeWindow,
      clock: {
        ...resolvedEventRequest.clock,
        filteringCutoff: resolveEventFilteringCutoff(timeWindow, now),
      },
      filters,
      userContext: workingState.context,
    };
    const requestContext = buildUserRequestContext(trimmed, eventRequest);
    const storedOriginalRequest = decision.intent === "live_event_search"
      ? requestContext
      : workingState.memory.originalRequest ?? requestContext;
    workingState = {
      ...workingState,
      activeTask: decision.intent === "follow_up" && workingState.activeTask?.kind === "event_search"
        ? { ...workingState.activeTask, status: "gathering_evidence", contract: undefined }
        : createActiveTask(
            workingState,
            "event_search",
            requestContext.requestMode,
            trimmed,
            "Find events matching the traveler's explicit constraints",
            "gathering_evidence",
          ),
      memory: {
        ...workingState.memory,
        originalRequest: storedOriginalRequest,
        pendingUserRequest: requestContext,
      },
    };
    const scope = isTomorrowEventQuery(eventQuery)
      ? "tomorrow"
      : decision.intent === "follow_up"
        ? "narrow"
        : "tonight";
    const canUseActiveVenueResults = Boolean(
      filters?.venue
      && !filters.categories?.length
      && !filters.audience
      && !filters.area
      && previousAvailableEvents?.length
      && sameTimeWindow(previousEvent?.timeWindow, eventRequest.timeWindow),
    );
    const activeVenueEvents = canUseActiveVenueResults
      ? previousAvailableEvents!.filter(event => venueNamesMatch(event.venue, filters!.venue!))
      : [];
    const eventResult: EventSearchResult = activeVenueEvents.length > 0
      ? {
          response: formatCachedVenueEvents(activeVenueEvents, matchingVenueReference?.name ?? filters!.venue!, eventRequest.timeWindow.label),
          fallback: false,
          events: activeVenueEvents,
          venueReferences: previousAvailableVenueReferences?.filter(reference => venueNamesMatch(reference.name, filters!.venue!)),
          sources: activeVenueEvents.map(event => event.sourceUrl).filter((source): source is string => Boolean(source)),
          timeWindow: eventRequest.timeWindow,
        }
      : await input.services.events.search(eventRequest, { state: workingState, scope });
    const text = eventResult.fallback || !eventResult.response
      ? eventResult.fallbackMessage ?? buildEventFallback(scope)
      : eventResult.response;
    const messages = sanitizeAssistantMessages([{ type: "text" as const, text }]);
    const activeEventVenueReference = eventRequest.filters?.venue
      ? eventResult.venueReferences?.find(reference => venueNamesMatch(reference.name, eventRequest.filters!.venue!))
      : undefined;
    const preservesAvailableResults = sameTimeWindow(previousEvent?.timeWindow, eventRequest.timeWindow);
    const availableEvents = preservesAvailableResults
      ? mergeAvailableEvents(previousAvailableEvents, eventResult.events)
      : eventResult.events;
    const availableVenueReferences = preservesAvailableResults
      ? mergeAvailableVenueReferences(previousAvailableVenueReferences, eventResult.venueReferences)
      : eventResult.venueReferences;
    workingState = {
      ...workingState,
      activeTask: workingState.activeTask
        ? { ...workingState.activeTask, status: "refinable", contract: undefined }
        : undefined,
      memory: {
        ...clearPendingUserRequest(workingState.memory),
        lastTopic: "events",
        lastVenue: activeEventVenueReference?.id ?? workingState.memory.lastVenue,
        lastVenueReference: activeEventVenueReference ?? workingState.memory.lastVenueReference,
        lastArea: eventRequest.filters?.area ?? workingState.memory.lastArea,
        lastTimeWindow: eventRequest.timeWindow,
        lastTimeLabel: eventRequest.timeWindow.label,
        lastTemporalExpression: eventRequest.timeWindow.sourceExpression,
        pendingEventFollowUp: eventResult.fallback || !eventResult.response
          ? scope === "tonight" ? "tomorrow" : undefined
          : scope === "tomorrow" ? "narrow" : "tomorrow",
        lastEvent: {
          scope,
          query: eventRequest.queryText,
          timeWindow: eventRequest.timeWindow,
          filters: eventRequest.filters,
          events: eventResult.events,
          availableEvents,
          venueReferences: eventResult.venueReferences,
          availableVenueReferences,
        },
      },
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    return {
      messages,
      updatedState: workingState,
      trace: decision.trace,
      decision,
      event: {
        timeWindow: eventResult.timeWindow ?? eventRequest.timeWindow,
        originalTemporalText: eventRequest.timeWindow.sourceExpression,
        providerQueryWindow: `${eventRequest.timeWindow.startTime} -> ${eventRequest.timeWindow.endTime} (${eventRequest.timeWindow.timezone})`,
        rejectedCandidates: eventResult.rejectedCandidates,
        diagnostics: eventResult.diagnostics,
      },
    };
  }

  if (decision.action === "retrieve_knowledge") {
    const knowledgeMode: UserRequestMode = decision.intent === "recommendation" || decision.intent === "advice"
      ? "decision"
      : "information";
    workingState = {
      ...workingState,
      activeTask: createActiveTask(
        workingState,
        "knowledge",
        knowledgeMode,
        trimmed,
        knowledgeMode === "decision" ? "Help the traveler make a decision" : "Answer the traveler's factual question",
        "gathering_evidence",
      ),
    };
    const knowledge = await input.services.knowledge.search(trimmed, {
      state: workingState,
      purpose: workingState.context.purpose,
    });
    const messages = sanitizeAssistantMessages([{
      type: "text" as const,
      text: knowledge.answer ?? buildHonestFallback(trimmed),
    }]);
    workingState = {
      ...workingState,
      activeTask: workingState.activeTask
        ? { ...workingState.activeTask, status: "completed", contract: undefined }
        : undefined,
    };
    workingState = appendAssistantMessages(workingState, messages, decision);
    workingState = applyAssistantTextMemory(workingState, messages);
    return {
      messages,
      updatedState: workingState,
      trace: decision.trace,
      decision,
      knowledge: knowledge.references?.length || knowledge.version || knowledge.importedAt
        ? {
            references: knowledge.references ?? [],
            version: knowledge.version,
            importedAt: knowledge.importedAt,
          }
        : undefined,
    };
  }

  const response = processMessage(trimmed, workingState.context);
  workingState = {
    ...workingState,
    context: response.updatedContext,
    memory: {
      ...workingState.memory,
      currentMode: response.updatedContext.briefGenerated ? "local_expert" : "discovery",
      onboardingStage: response.briefReady
        ? "brief"
        : response.updatedContext.sociabilityAsked
          ? "sociability"
          : response.updatedContext.scooterAsked
            ? "scooter"
            : response.updatedContext.purposeFollowUpAsked
              ? "purpose_follow_up"
              : "purpose",
    },
  };

  const messages = sanitizeAssistantMessages(response.briefReady
    ? [
        { type: "text" as const, text: response.message },
        { type: "text" as const, text: "Want me to put together a plan for your stay?" },
      ]
    : [{ type: "text" as const, text: response.message }]);
  workingState = response.briefReady
    ? {
        ...workingState,
        memory: {
          ...workingState.memory,
          pendingFollowUp: "plan",
          currentMode: "local_expert",
          onboardingStage: "complete",
        },
      }
    : workingState;
  workingState = appendAssistantMessages(workingState, messages, decision);

  return {
    messages,
    suggestions: response.suggestions,
    brief: response.briefReady ? buildBrief(response.updatedContext) : undefined,
    updatedState: workingState,
    trace: decision.trace,
    decision,
  };
}

// ─── Core conversation function ───────────────────────────────────────────────

/**
 * processMessage — given a raw user message and the current conversation
 * context, returns SIT's next response and the updated context.
 *
 * This is the primary entry point called by both the WhatsApp webhook and
 * the frontend chat engine.
 */
export function processMessage(userMessage: string, ctx: UserContext): SITResponse {
  const c = applyExplicitContextSignals(userMessage, ctx, true, true);

  c.exchangeCount++;

  // ── Step 0: Personal opening ───────────────────────────────────────────────
  if (!c.firstName) {
    c.firstNameAsked = true;
    return {
      message: "I'm glad you're here. What should I call you?",
      updatedContext: c,
    };
  }

  if (!c.age && !c.ageAsked) {
    c.ageAsked = true;
    return {
      message: `Nice to meet you, ${c.firstName}. Roughly how old are you? It helps me avoid the wrong kind of recommendation.`,
      updatedContext: c,
    };
  }

  if (!c.genderIdentity && !c.genderIdentityAsked) {
    c.genderIdentityAsked = true;
    return {
      message: "And only if you're comfortable sharing: how do you identify? It can help me suggest spaces that feel like the right fit.",
      suggestions: ["Woman", "Man", "Non-binary", "Prefer not to say"],
      updatedContext: c,
    };
  }

  // ── Step 1: Establish purpose ──────────────────────────────────────────────
  if (!c.purpose) {
    return {
      message: "So tell me, what are you hoping this island gives you?",
      suggestions: ["Wellness", "Music & parties", "Remote work", "Romance", "Community", "Nature", "Moving here", "Not sure yet"],
      updatedContext: c,
    };
  }

  // ── Step 2: Purpose-specific follow-up (asked once) ───────────────────────
  if (!c.purposeFollowUpAsked && !c.purposeDetail) {
    c.purposeFollowUpAsked = true;
    const a = ack(c.purpose);
    const followUps: Record<string, { message: string; suggestions?: string[] }> = {
      wellness: {
        message: `${a} Is it more about proper rest, spirituality, personal growth, or taking care of your body?`,
        suggestions: ["Rest", "Spirituality", "Personal growth", "Physical health", "A mix"],
      },
      music: {
        message: `${a} Are you chasing the music, the people, or the all-night part of it?`,
        suggestions: ["Great music", "Social energy", "All-night parties", "All of it"],
      },
      "remote-work": {
        message: `${a} Are you already in a good work rhythm, or hoping the island helps you find one?`,
        suggestions: ["Already productive", "Need a better routine", "Bit of both"],
      },
      romance: {
        message: `${a} Are you here with someone, or is this more of a solo chapter?`,
        suggestions: ["With a partner", "Solo"],
      },
      community: {
        message: `${a} What kind of circle are you hoping to find — creative, spiritual, wellness, entrepreneurial, or just genuine connection?`,
        suggestions: ["Creative", "Spiritual", "Wellness", "Entrepreneurial", "Human connection"],
      },
      nature: {
        message: `${a} Do you want to be active in it, or more quiet and contemplative with it?`,
        suggestions: ["Active", "Contemplative", "Both"],
      },
      moving: {
        message: `${a} What would need to feel different in your life for the move to make sense?`,
      },
      unsure: {
        message: `${a} Does it feel more like you need real rest, or like you're hoping something opens up here?`,
        suggestions: ["Genuine rest", "Looking for something", "Somewhere between"],
      },
    };
    return { ...(followUps[c.purpose] ?? { message: "Tell me a little more." }), updatedContext: c };
  }

  if (c.purposeDetail && !c.purposeFollowUpAsked) c.purposeFollowUpAsked = true;

  // ── Step 2b: Clarify broad umbrella needs only when still not actionable ───
  if (needsSecondLayerDiscovery(c)) {
    c.purposeDetailAsked = true;
    return { ...secondLayerFollowUp(c), updatedContext: c };
  }

  // ── Step 2c: Context-dependent Discovery ──────────────────────────────────
  if (needsGroupCompositionQuestion(c)) {
    c.groupCompositionAsked = true;
    return {
      message: "For that kind of connection, it matters who you're moving through the island with. Are you here solo, with a partner, with friends, or as a group?",
      suggestions: ["Solo", "Couple", "Friends", "Group", "Family"],
      updatedContext: c,
    };
  }

  // ── Step 3: Scooter ────────────────────────────────────────────────────────
  if (!c.scooter && !c.scooterAsked) {
    c.scooterAsked = true;
    return {
      message: "Practical island question: do you ride a scooter, or should I keep things easier to reach?",
      suggestions: ["Yes", "No", "Still learning", "I'd rather not"],
      updatedContext: c,
    };
  }

  // ── Step 4: Sociability ────────────────────────────────────────────────────
  if (!c.sociability && !c.sociabilityAsked) {
    c.sociabilityAsked = true;
    return {
      message: "Last thing for now: do you want this trip mostly quiet, very social, or somewhere in the middle?",
      suggestions: ["Mostly on my own", "Balanced", "Very social"],
      updatedContext: c,
    };
  }

  // ── Step 5: Generate the SIT Brief ────────────────────────────────────────
  // Triggered after enough practical context is established.
  // buildBrief() uses the accumulated context to generate the personalized brief.
  if (c.purpose && !needsSecondLayerDiscovery(c) && (c.scooter || c.sociability) && c.exchangeCount >= 3 && !c.briefGenerated) {
    c.briefGenerated = true;
    return {
      message: "Okay, that's enough to be useful. I'll put together your SIT Brief.",
      briefReady: true,
      updatedContext: c,
    };
  }

  // ── Step 7: Open-ended post-brief conversation ─────────────────────────────
  const ongoing = [
    "What else is on your mind about the trip?",
    "That's a fair question. What's driving it for you?",
    "Makes sense. Anything specific you want me to factor into your plan?",
    "Worth thinking about. What matters most to you there?",
    "Good point. Is there anything else I should know?",
  ];
  return {
    message: ongoing[c.exchangeCount % ongoing.length],
    updatedContext: c,
  };
}

// ─── Brief builder ────────────────────────────────────────────────────────────

/**
 * buildBrief — generates a personalized SIT Brief from the accumulated
 * UserContext. Called after processMessage returns { briefReady: true }.
 *
 * On the frontend this renders as a rich card (BriefCard component).
 * On the WhatsApp webhook the result is formatted as plain text by
 * formatBriefForWhatsApp() in the route handler.
 */
export function buildBrief(ctx: UserContext): SITBrief {
  const lookingForMap: Record<string, string> = {
    wellness:      "A genuine reset — not a spa break. The quality gap here is extreme, so where you go matters.",
    music:         "Somewhere that feels alive beyond Full Moon. The real scene exists — you just have to know where to look.",
    "remote-work": "A base that actually works. The infrastructure is there; managing the island's pull on your focus is the challenge.",
    romance:       "Beautiful, unhurried, off the main drag. Koh Phangan delivers — in the right area.",
    community:     "To actually belong somewhere, not just pass through. More achievable here than most places.",
    nature:        "The real island, not the filtered version. Quiet beaches, actual jungle — it exists.",
    moving:        "To evaluate, not just visit. That's a different question and needs a different approach.",
    unsure:        "You're open. That's the best way to arrive — the island tends to show you quickly.",
  };

  const lookingFor = lookingForMap[ctx.purpose ?? "unsure"] ?? lookingForMap["unsure"]!;

  const avoid: string[] = [];
  if (ctx.scooter === "no" || ctx.scooter === "prefer-not") {
    avoid.push("Remote accommodation — transport costs compound fast without a scooter");
  }
  if (ctx.purpose === "wellness") {
    avoid.push("Unresearched ceremonies or retreats — quality range is extreme");
    avoid.push("Heavily marketed wellness packages — good teachers don't need to advertise hard");
  }
  if (ctx.purpose === "music") {
    avoid.push("Planning everything around Full Moon — it's a party, not a music festival");
    avoid.push("Judging the scene by Haad Rin — that's the smallest slice");
  }
  if (ctx.purpose === "remote-work") {
    avoid.push("Expecting full productivity in week one — adjustment period is real");
  }
  if (ctx.sociability === "alone") {
    avoid.push("Haad Rin — it doesn't sleep");
  }
  if (avoid.length === 0) {
    avoid.push("Haad Rin tourist traps — quality drops, prices don't");
    avoid.push("Trying to cover the whole island — depth beats coverage");
  }

  let stayArea: string;
  if (ctx.scooter === "no" || ctx.scooter === "prefer-not") {
    stayArea = "Srithanu or Thong Sala — walkable, coastal, everything within reach. Don't book remotely without a scooter.";
  } else {
    const areaMap: Record<string, string> = {
      wellness:      "Srithanu — the wellness hub. Everything within 5 minutes, quieter energy.",
      music:         "Baan Tai (jungle venues) or Haad Rin (classic scene) — depends how deep you want to go.",
      romance:       "Hinkong — quiet, intimate, world-class sunsets.",
      "remote-work": "Srithanu or Thong Sala — reliable wifi, coworking, good cafés.",
      community:     "Srithanu — recurring events and social circles concentrate here.",
      nature:        "North coast — Chaloklum or the hills above Srithanu. Wake up in it.",
      moving:        "Don't commit on arrival. Try three areas before deciding.",
    };
    stayArea = areaMap[ctx.purpose ?? ""] ?? "Srithanu — versatile base, easy to expand from.";
  }

  const experienceMap: Record<string, string[]> = {
    wellness: [
      "One week at a reputable yoga school — consistency beats intensity",
      "Cacao or sound healing with a vetted facilitator",
      "Daily morning swim before the heat hits",
      "3 days with zero agenda",
    ],
    music: [
      "Sunset gathering at Secret Mountain — that's where the serious music crowd is",
      "One jungle party midweek — smaller, better music, fewer tourists",
      "One beach bar evening to find the slower social side of the island",
      "Follow artists on Instagram, not venues — the best nights are announced same-day",
    ],
    "remote-work": [
      "Lock in coworking with reliable internet in week one",
      "One recurring activity from day one — yoga, sport, anything social",
      "At least one full day off per week",
      "Attend a coworking social — the people here are unusually good",
    ],
    romance: [
      "Sunset at Hinkong — low tide picnic or SUP at golden hour",
      "Private longtail to a quiet beach (~$60)",
      "One proper dinner in Thong Sala town",
    ],
    community: [
      "One recurring class — go every single time",
      "Weekly sunset gatherings — same faces, real connections",
      "Coworking membership even if you're not working",
      "Women's or men's circles if that resonates — both well-run",
    ],
    nature: [
      "Jungle hike to the viewpoint — genuinely undercrowded",
      "Haad Yuan or Thong Nai Pan Noi — swimmable and quiet",
      "Sail Rock snorkel trip — one of SE Asia's best sites",
      "One night with no light pollution",
    ],
    moving: [
      "3 areas minimum before deciding where to live",
      "Visit during a normal week — not Full Moon",
      "Talk to long-term expats, not tourists",
      "Try co-living before committing to a rental",
    ],
    unsure: [
      "First 2–3 days: no agenda",
      "One sunset gathering",
      "One beach nobody told you about — ask a local",
      "Eat where there's no English menu",
    ],
  };

  const experiences = experienceMap[ctx.purpose ?? "unsure"] ?? experienceMap["unsure"]!;

  const insightMap: Record<string, string> = {
    wellness:      "Ecstatic Dance is the most misunderstood event here. No alcohol, no phones — nothing like what people expect.",
    music:         "Full Moon is the island's most marketed and most overrated night. The real music happens on a Tuesday with 200 people who actually care.",
    "remote-work": "Most people are less productive in the first two weeks. The ones who give it time often extend their stay by months.",
    romance:       "Hinkong at low tide is one of those rare places that actually delivers what travel photos promise.",
    community:     "Community here forms around recurrence, not events. Show up to the same class three times a week — that's the only strategy that works.",
    nature:        "The best beaches aren't on any travel site. Ask a local who's been here longer than a season.",
    moving:        "Year one is a honeymoon. Year two is when the real picture appears.",
    unsure:        "A surprising number of people arrive not knowing what they need — and leave knowing exactly who they want to become.",
  };

  const localInsight = insightMap[ctx.purpose ?? "unsure"] ?? insightMap["unsure"]!;

  return { lookingFor, avoid, stayArea, experiences, localInsight };
}
