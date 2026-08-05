import type {
  AssistantMessage,
  ConversationState,
  DeveloperTrace,
  KnowledgeReference,
  RunConversationTurnOutput,
  SITBrief,
} from "@workspace/sit-engine";

export interface ConversationApiSession {
  id: string;
  userKey: string;
  channel: "web";
  stateVersion: number;
  updatedAt: string;
  state?: ConversationState;
}

export interface ConversationApiTurnOutput extends RunConversationTurnOutput {
  session: ConversationApiSession;
  developerConsole?: DeveloperConsolePayload;
}

export interface DeveloperServiceCall {
  service: "EventService" | "DestinationContextService" | "KnowledgeService" | "LocationService" | "PlanService" | "WeatherService" | "RecommendationService";
  called: boolean;
  durationMs: number;
  status: "success" | "fallback" | "skipped" | "error";
  error?: string;
}

export interface ShadowAgentTrace {
  status: "disabled" | "success" | "error";
  disabledReason?: "shadow_flag_off" | "developer_trace_required" | "missing_api_key";
  model?: string;
  durationMs: number;
  plan?: {
    mode: "information" | "decision";
    relationshipToActiveTask: "new_task" | "continuation" | "refinement" | "contract_answer" | "correction";
    activeObjective: string;
    action: string;
    requiredServices: string[];
    knownConstraints: Array<{
      name: string;
      value: string;
      source: "current_message" | "active_task" | "conversation" | "memory";
    }>;
    missingCriticalContext: string[];
    questionRequired: boolean;
    conversationContract?: {
      expectedAnswer: "venue" | "date" | "area" | "event" | "preference";
      reason: string;
    };
    preservedContext: string[];
    confidence: number;
    decisionSummary: string;
    proposedResponse: string;
    comparison: {
      agreesWithCanonical: boolean;
      differences: string[];
    };
  };
  rawModelOutput?: string;
  error?: string;
  promptInspector?: {
    systemPrompt: string;
    inputContext: string;
    finalPrompt: string;
  };
}

export interface DeveloperConsolePayload {
  userMessage: string;
  detectedIntent: {
    intent: string;
    confidence: number;
  };
  memory: {
    lastVenue?: string;
    lastEvent?: unknown;
    lastArea?: string;
    lastTopic?: string;
    userProfile?: unknown;
    onboardingStage?: string;
    lastTimeWindow?: unknown;
    lastTimeLabel?: string;
    lastTemporalExpression?: string;
  };
  timeTrace: {
    destination?: string;
    destinationTimezone?: string;
    destinationCurrentTime?: string;
    browserTimezone?: string;
    filteringCutoff?: string;
    originalTemporalExpression?: string;
    resolvedLabel?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    resolverConfidence?: number;
    providerQueryWindow?: string;
    requestMode?: string;
    searchMode?: string;
    resultMode?: string;
    sourceWarnings?: Array<{
      source: string;
      warning: string;
    }>;
    filterDecisions?: Array<{
      event: string;
      startTime?: string;
      endTime?: string;
      primaryExperience?: string;
      secondaryTags?: string[];
      humanNeeds?: string[];
      matchRole?: "primary" | "secondary" | "none";
      included: boolean;
      reason: string;
    }>;
    rejectedCandidates: Array<{
      text: string;
      reason: string;
      detectedTime?: string;
    }>;
  };
  services: DeveloperServiceCall[];
  knowledgeRetrieval: {
    retrievedCards: KnowledgeReference[];
    cardsUsed: KnowledgeReference[];
    cardsRejected: KnowledgeReference[];
    version?: string;
    importedAt?: string;
  };
  promptInspector: {
    systemPrompt: string;
    retrievedContext: string;
    memoryContext: string;
    userMessage: string;
    finalPrompt: string;
  };
  llmResponse: {
    status: "disabled" | "success" | "error" | "not_called";
    tier?: "none" | "standard" | "premium";
    model?: string;
    routingReason?: string;
    reasoningEffort?: string;
    estimatedInputTokens?: number;
    maxOutputTokens?: number;
    durationMs?: number;
    rawModelOutput: string;
    finalFormattedOutput: string;
  };
  shadowAgent?: ShadowAgentTrace;
  decisionTrace: string[];
  timelineTurn: {
    stateBefore: ConversationState;
    stateAfter: ConversationState;
    memoryChanges: Record<string, { before: unknown; after: unknown }>;
  };
  trace?: DeveloperTrace;
}

export interface KnowledgeVersionResponse {
  version: string;
  metadata: {
    version: string;
    importedAt: string;
    cardCount: number;
  };
}

export async function createOrLoadWebSession(userKey: string): Promise<ConversationApiSession> {
  const res = await fetch("/api/conversation/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "web", userKey }),
  });
  if (!res.ok) throw new Error("Could not create conversation session");
  const data = await res.json() as { session: ConversationApiSession };
  return data.session;
}

export async function sendConversationTurn(input: {
  sessionId: string;
  userKey: string;
  message: string;
  devTrace?: boolean;
}): Promise<ConversationApiTurnOutput> {
  const res = await fetch("/api/conversation/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      userKey: input.userKey,
      channel: "web",
      message: input.message,
      devTrace: input.devTrace,
      browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok) throw new Error("Conversation request failed");
  return await res.json() as ConversationApiTurnOutput;
}

export async function getKnowledgeVersion(): Promise<KnowledgeVersionResponse> {
  const res = await fetch("/api/knowledge/version");
  if (!res.ok) throw new Error("Could not load knowledge version");
  return await res.json() as KnowledgeVersionResponse;
}

export async function importKnowledgeFile(file: File): Promise<KnowledgeVersionResponse["metadata"]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const dataBase64 = btoa(binary);

  const res = await fetch("/api/knowledge/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, dataBase64 }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Knowledge import failed");
  }
  const data = await res.json() as { metadata: KnowledgeVersionResponse["metadata"] };
  return data.metadata;
}

export type { AssistantMessage, SITBrief };
