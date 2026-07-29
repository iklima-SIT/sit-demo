import type { EventSearchRequest, TimeWindow } from "./time-resolver.js";
import type { EventCategoryFilter, EventSearchFilters } from "./event-filters.js";
import type { EventHumanNeed } from "./event-classification.js";

export type Intent =
  | "live_event_search"
  | "destination_context"
  | "place_recommendation"
  | "location_request"
  | "practical_information"
  | "definition"
  | "recommendation"
  | "planning"
  | "advice"
  | "onboarding"
  | "general_chat"
  | "follow_up";

export type EngineAction =
  | "answer_directly"
  | "continue_onboarding"
  | "generate_brief"
  | "call_live_events"
  | "resolve_destination_context"
  | "recommend_places"
  | "resolve_location"
  | "retrieve_knowledge"
  | "show_plans"
  | "ask_follow_up"
  | "acknowledge";

export type AnswerMode =
  | "text"
  | "brief"
  | "suggestions"
  | "service"
  | "fallback"
  | "none";

export type RequiredService = "events" | "destination_context" | "recommendations" | "location" | "knowledge" | "plans" | "none";

export type ConversationChannel = "web" | "whatsapp" | "test";

export interface AssistantMessage {
  type: "text";
  text: string;
}

export interface EventSearchContext {
  state: ConversationState;
  scope: "tonight" | "tomorrow" | "narrow";
}

export interface EventSearchResult {
  response: string | null;
  fallback: boolean;
  sources?: string[];
  events?: EventListingReference[];
  venueReferences?: VenueLocationReference[];
  fallbackMessage?: string;
  timeWindow?: TimeWindow;
  rejectedCandidates?: Array<{
    text: string;
    reason: string;
    detectedTime?: string;
  }>;
  diagnostics?: EventSearchDiagnostics;
}

export interface EventSearchDiagnostics {
  destination?: string;
  destinationTimezone?: string;
  destinationCurrentTime?: string;
  browserTimezone?: string;
  filteringCutoff?: string;
  resolvedLocalDate?: string;
  resolvedTonightWindow?: {
    startTime: string;
    endTime: string;
    timezone: string;
  };
  requestMode?: "information" | "decision";
  searchMode?: "broad" | "filtered";
  resultMode?: "focused" | "complete";
  sourcesAttempted?: string[];
  sourcesSuccessful?: string[];
  sourcesFailed?: Array<{
    source: string;
    reason: string;
  }>;
  sourceWarnings?: Array<{
    source: string;
    warning: string;
  }>;
  rawResultCountBySource?: Record<string, number>;
  mergedResultCount?: number;
  duplicatesRemoved?: number;
  categoriesReturned?: string[];
  appliedFilters?: {
    categories?: string[];
    audience?: string;
    area?: string;
    venue?: string;
  };
  filteredOutCount?: number;
  filterDecisions?: Array<{
    event: string;
    startTime?: string;
    endTime?: string;
    primaryExperience?: string;
    secondaryTags?: string[];
    humanNeeds?: EventHumanNeed[];
    matchRole?: "primary" | "secondary" | "none";
    included: boolean;
    reason: string;
  }>;
  resultState?: "verified_results" | "confirmed_no_results" | "incomplete_search" | "source_failure" | "stale_data";
}

export interface EventService {
  search(request: EventSearchRequest, context: EventSearchContext): Promise<EventSearchResult>;
}

export interface DestinationContextSource {
  title: string;
  url: string;
  kind: "official" | "police_notice";
}

export interface AlcoholRestriction {
  startTime: string;
  endTime: string;
  label: string;
  exceptionsSummary: string;
}

export interface DestinationContextReference {
  id: string;
  destination: string;
  timezone: string;
  localDate: string;
  name: string;
  aliases: string[];
  type: "religious_holiday";
  alcoholRestriction?: AlcoholRestriction;
  sources: DestinationContextSource[];
  verifiedAt: string;
}

export interface DestinationContextSearchContext {
  state: ConversationState;
  now: Date;
}

export interface DestinationContextResult {
  answer: string;
  reference?: DestinationContextReference;
  destinationLocalTime: string;
  matchedFromMemory: boolean;
}

export interface DestinationContextService {
  resolve(query: string, context: DestinationContextSearchContext): Promise<DestinationContextResult>;
}

export type PlaceCategory = "scooter_rental" | "restaurant" | "cafe" | "pharmacy" | "coworking" | "groceries" | "local_service";

export interface PlaceRecommendationRequest {
  query: string;
  area: string;
  category: PlaceCategory;
}

export interface PlaceRecommendationResult {
  answer: string;
  area: string;
  category: PlaceCategory;
  googleMapsUrls: string[];
}

export interface RecommendationService {
  recommend(request: PlaceRecommendationRequest, context: ConversationState): Promise<PlaceRecommendationResult>;
}

export interface KnowledgeSearchContext {
  state: ConversationState;
  purpose?: string;
}

export interface KnowledgeSearchResult {
  answer: string | null;
  references?: KnowledgeReference[];
  version?: string;
  importedAt?: string;
}

export interface KnowledgeService {
  search(query: string, context: KnowledgeSearchContext): Promise<KnowledgeSearchResult>;
}

export interface LocationResult {
  answer: string;
  outcome?: "resolved" | "needs_clarification";
  venueId?: string;
  venueName?: string;
  area?: string;
  googleMapsUrl?: string;
}

export interface LocationService {
  resolve(query: string, memory: ConversationMemory): Promise<LocationResult>;
}

export interface PlanResult {
  message: string;
  options: string[];
}

export interface PlanService {
  generate(profile: UserContext, duration?: string): Promise<PlanResult>;
}

export interface ConversationServices {
  events: EventService;
  destinationContext: DestinationContextService;
  recommendations: RecommendationService;
  knowledge: KnowledgeService;
  location: LocationService;
  plans: PlanService;
}

export interface VenueReference {
  id: string;
  name: string;
  source: "user" | "memory" | "assistant";
}

export interface VenueLocationReference {
  id: string;
  name: string;
  aliases?: string[];
  area?: string;
  googleMapsUrl: string;
  sourceUrl?: string;
}

export interface EventListingReference {
  id: string;
  title: string;
  category?: string;
  venue: string;
  startTime: string;
  endTime: string;
  price?: string;
  primaryExperience?: string;
  googleMapsUrl?: string;
  sourceUrl?: string;
}

export interface EventReference {
  scope: "tonight" | "tomorrow" | "narrow";
  query: string;
  timeWindow?: TimeWindow;
  filters?: EventSearchFilters;
  events?: EventListingReference[];
  availableEvents?: EventListingReference[];
  venueReferences?: VenueLocationReference[];
  availableVenueReferences?: VenueLocationReference[];
}

export type ConversationTaskKind = "event_search" | "destination_context" | "place_recommendation" | "location" | "knowledge" | "planning";
export type ConversationTaskStatus =
  | "gathering_evidence"
  | "awaiting_clarification"
  | "responding"
  | "refinable"
  | "completed"
  | "abandoned";

export interface ConversationContract {
  expectedAnswer: "venue" | "date" | "area" | "event";
  reason: string;
  mode: UserRequestMode;
  createdFromAction: EngineAction;
}

export interface ActiveConversationTask {
  id: string;
  kind: ConversationTaskKind;
  objective: string;
  mode: UserRequestMode;
  originalMessage: string;
  status: ConversationTaskStatus;
  contract?: ConversationContract;
}

export type UserRequestMode = "information" | "decision";

export interface UserRequestContext {
  type: "event_search";
  originalMessage: string;
  requestMode: UserRequestMode;
  requestedDate?: string;
  requestedTimeWindow?: TimeWindow;
  requestedCategory?: EventCategoryFilter;
  requestedArea?: string;
  requestedVenue?: string;
  requestedScope: "island-wide" | "area" | "venue";
  requestedFilters?: EventSearchFilters;
  unresolvedAmbiguities: string[];
}

export type PendingUserRequest = UserRequestContext;

export interface KnowledgeReference {
  query?: string;
  purpose?: string;
  cardId?: string;
  topic?: string;
  score?: number;
  matchedBecause?: string;
  used?: boolean;
}

export interface ConversationMemory {
  lastVenue?: string;
  lastVenueReference?: VenueLocationReference;
  lastEvent?: EventReference;
  originalRequest?: UserRequestContext;
  pendingUserRequest?: PendingUserRequest;
  lastArea?: string;
  stayingArea?: string;
  lastTopic?: string;
  lastDestinationContext?: DestinationContextReference;
  pendingFollowUp?: "event_tomorrow" | "event_narrow" | "plan";
  pendingEventFollowUp?: "tomorrow" | "narrow";
  lastTimeWindow?: TimeWindow;
  lastTimeLabel?: string;
  lastTemporalExpression?: string;
  userProfile?: Partial<UserContext>;
  onboardingStage?: "purpose" | "purpose_follow_up" | "scooter" | "sociability" | "brief" | "complete";
  onboardingPaused?: boolean;
  currentMode?: "discovery" | "information" | "local_expert";
}

export interface MemoryUpdates {
  lastVenue?: string;
  lastVenueReference?: VenueLocationReference;
  lastEvent?: EventReference;
  originalRequest?: UserRequestContext;
  pendingUserRequest?: PendingUserRequest;
  lastArea?: string;
  stayingArea?: string;
  lastTopic?: string;
  lastDestinationContext?: DestinationContextReference;
  pendingFollowUp?: ConversationMemory["pendingFollowUp"];
  pendingEventFollowUp?: ConversationMemory["pendingEventFollowUp"];
  lastTimeWindow?: TimeWindow;
  lastTimeLabel?: string;
  lastTemporalExpression?: string;
  onboardingStage?: ConversationMemory["onboardingStage"];
  onboardingPaused?: boolean;
  currentMode?: ConversationMemory["currentMode"];
}

export interface AssistantDecision {
  intent: Intent;
  action: EngineAction;
  answerMode: AnswerMode;
  requiredService: RequiredService;
  memoryUpdates: MemoryUpdates;
  debugReason: string;
  trace?: DeveloperTrace;
}

export interface DeveloperTrace {
  detectedIntent: Intent;
  activeTopic?: string;
  memoryUsed: string[];
  serviceSelected: RequiredService;
  onboardingTriggered: boolean;
  reason: string;
}

export interface ConversationTurn {
  id?: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
  decision?: AssistantDecision;
}

export interface ConversationState {
  context: UserContext;
  memory: ConversationMemory;
  turns: ConversationTurn[];
  activeTask?: ActiveConversationTask;
}

export interface RunConversationTurnInput {
  message: string;
  state: ConversationState;
  channel: ConversationChannel;
  services: ConversationServices;
  devTrace?: boolean;
  now?: Date;
  clientContext?: {
    browserTimezone?: string;
  };
}

export interface RunConversationTurnOutput {
  messages: AssistantMessage[];
  updatedState: ConversationState;
  suggestions?: string[];
  brief?: SITBrief;
  planOptions?: string[];
  trace?: DeveloperTrace;
  decision?: AssistantDecision;
  knowledge?: {
    references: KnowledgeReference[];
    version?: string;
    importedAt?: string;
  };
  event?: {
    timeWindow?: TimeWindow;
    originalTemporalText?: string;
    providerQueryWindow?: string;
    rejectedCandidates?: NonNullable<EventSearchResult["rejectedCandidates"]>;
    diagnostics?: EventSearchDiagnostics;
  };
  destinationContext?: {
    reference?: DestinationContextReference;
    destinationLocalTime: string;
    matchedFromMemory: boolean;
  };
  recommendation?: {
    area: string;
    category: PlaceCategory;
    googleMapsUrls: string[];
  };
}

export interface UserContext {
  firstName?: string;
  firstNameAsked: boolean;
  age?: number;
  ageAsked: boolean;
  genderIdentity?: string;
  genderIdentityAsked: boolean;
  purpose?: string;
  purposeFollowUpAsked: boolean;
  purposeDetail?: string;
  purposeDetailAsked: boolean;
  groupComposition?: string;
  groupCompositionAsked: boolean;
  stayingArea?: string;
  duration?: string;
  durationAsked: boolean;
  scooter?: string;
  scooterAsked: boolean;
  sociability?: string;
  sociabilityAsked: boolean;
  exchangeCount: number;
  briefGenerated: boolean;
  /** Unix ms timestamp of last activity — used for session TTL */
  lastActiveAt: number;
}

export interface SITBrief {
  lookingFor: string;
  avoid: string[];
  stayArea: string;
  experiences: string[];
  localInsight: string;
}

export interface SITResponse {
  message: string;
  suggestions?: string[];
  briefReady?: boolean;
  updatedContext: UserContext;
}

export const INITIAL_CTX: UserContext = {
  firstNameAsked: false,
  ageAsked: false,
  genderIdentityAsked: false,
  purposeFollowUpAsked: false,
  purposeDetailAsked: false,
  groupCompositionAsked: false,
  durationAsked: false,
  scooterAsked: false,
  sociabilityAsked: false,
  exchangeCount: 0,
  briefGenerated: false,
  lastActiveAt: 0,
};
