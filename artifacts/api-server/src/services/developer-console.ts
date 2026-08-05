import type {
  AssistantMessage,
  ConversationServices,
  ConversationState,
  DeveloperTrace,
  KnowledgeReference,
  RunConversationTurnOutput,
} from "@workspace/sit-engine";
import type { ShadowAgentTrace } from "./shadow-agent";
import type { LlmTrace } from "./llm-service";

export type DeveloperServiceName =
  | "EventService"
  | "DestinationContextService"
  | "KnowledgeService"
  | "LocationService"
  | "PlanService"
  | "WeatherService"
  | "RecommendationService";

export interface DeveloperServiceCall {
  service: DeveloperServiceName;
  called: boolean;
  durationMs: number;
  status: "success" | "fallback" | "skipped" | "error";
  error?: string;
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
    stayingArea?: string;
    lastTopic?: string;
    lastDestinationContext?: unknown;
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
    resolvedLocalDate?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    resolverConfidence?: number;
    providerQueryWindow?: string;
    requestMode?: string;
    searchMode?: string;
    resultMode?: string;
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
    resultState?: string;
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
    status: LlmTrace["status"] | "not_called";
    tier?: LlmTrace["tier"];
    model?: string;
    routingReason?: string;
    reasoningEffort?: string;
    estimatedInputTokens?: number;
    maxOutputTokens?: number;
    durationMs?: number;
    rawModelOutput: string;
    finalFormattedOutput: string;
  };
  shadowAgent: ShadowAgentTrace;
  decisionTrace: Array<"User" | "Intent" | "Memory" | "Services" | "Knowledge" | "LLM" | "Final Response">;
  timelineTurn: {
    stateBefore: ConversationState;
    stateAfter: ConversationState;
    memoryChanges: Record<string, { before: unknown; after: unknown }>;
  };
  trace?: DeveloperTrace;
}

const SERVICE_NAMES: DeveloperServiceName[] = [
  "EventService",
  "DestinationContextService",
  "KnowledgeService",
  "LocationService",
  "PlanService",
  "WeatherService",
  "RecommendationService",
];

function skippedCalls(): DeveloperServiceCall[] {
  return SERVICE_NAMES.map(service => ({
    service,
    called: false,
    durationMs: 0,
    status: "skipped",
  }));
}

function updateCall(
  calls: DeveloperServiceCall[],
  service: DeveloperServiceName,
  patch: Partial<DeveloperServiceCall>,
): void {
  const index = calls.findIndex(call => call.service === service);
  if (index >= 0) calls[index] = { ...calls[index]!, ...patch };
}

function cloneState(state: ConversationState): ConversationState {
  return JSON.parse(JSON.stringify(state)) as ConversationState;
}

function memoryChanges(before: ConversationState, after: ConversationState): Record<string, { before: unknown; after: unknown }> {
  const keys = new Set([...Object.keys(before.memory), ...Object.keys(after.memory)]);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const beforeValue = before.memory[key as keyof typeof before.memory];
    const afterValue = after.memory[key as keyof typeof after.memory];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = { before: beforeValue, after: afterValue };
    }
  }
  return changes;
}

export function createDeveloperConsoleRecorder(services: ConversationServices): {
  services: ConversationServices;
  getCalls: () => DeveloperServiceCall[];
} {
  const calls = skippedCalls();

  async function measure<T>(service: DeveloperServiceName, fn: () => Promise<T>, isFallback: (value: T) => boolean): Promise<T> {
    const started = performance.now();
    updateCall(calls, service, { called: true, status: "success" });
    try {
      const result = await fn();
      updateCall(calls, service, {
        durationMs: Math.round(performance.now() - started),
        status: isFallback(result) ? "fallback" : "success",
      });
      return result;
    } catch (error) {
      updateCall(calls, service, {
        durationMs: Math.round(performance.now() - started),
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  return {
    services: {
      events: {
        search: (query, context) => measure("EventService", () => services.events.search(query, context), result => result.fallback || !result.response),
      },
      destinationContext: {
        resolve: (query, context) => measure(
          "DestinationContextService",
          () => services.destinationContext.resolve(query, context),
          result => !result.reference,
        ),
      },
      recommendations: {
        recommend: (request, context) => measure(
          "RecommendationService",
          () => services.recommendations.recommend(request, context),
          result => result.googleMapsUrls.length === 0,
        ),
      },
      knowledge: {
        search: (query, context) => measure("KnowledgeService", () => services.knowledge.search(query, context), result => !result.answer),
      },
      location: {
        resolve: (query, memory) => measure(
          "LocationService",
          () => services.location.resolve(query, memory),
          result => result.outcome === "needs_clarification",
        ),
      },
      plans: {
        generate: (profile, duration) => measure("PlanService", () => services.plans.generate(profile, duration), () => false),
      },
    },
    getCalls: () => calls,
  };
}

export function buildDeveloperConsolePayload(input: {
  userMessage: string;
  stateBefore: ConversationState;
  output: RunConversationTurnOutput;
  services: DeveloperServiceCall[];
  llm?: LlmTrace;
  shadowAgent?: ShadowAgentTrace;
}): DeveloperConsolePayload {
  const finalFormattedOutput = formatAssistantMessages(input.output.messages);
  const retrievedCards = input.output.knowledge?.references ?? [];
  const memory = input.output.updatedState.memory;

  return {
    userMessage: input.userMessage,
    detectedIntent: {
      intent: input.output.decision?.intent ?? "unknown",
      confidence: input.output.decision ? 1 : 0,
    },
    memory: {
      lastVenue: memory.lastVenue,
      lastEvent: memory.lastEvent,
      lastArea: memory.lastArea,
      stayingArea: memory.stayingArea,
      lastTopic: memory.lastTopic,
      lastDestinationContext: memory.lastDestinationContext,
      userProfile: memory.userProfile,
      onboardingStage: memory.onboardingStage,
      lastTimeWindow: memory.lastTimeWindow,
      lastTimeLabel: memory.lastTimeLabel,
      lastTemporalExpression: memory.lastTemporalExpression,
    },
    timeTrace: {
      destination: input.output.event?.diagnostics?.destination
        ?? input.output.destinationContext?.reference?.destination,
      destinationTimezone: input.output.event?.diagnostics?.destinationTimezone
        ?? input.output.destinationContext?.reference?.timezone,
      destinationCurrentTime: input.output.event?.diagnostics?.destinationCurrentTime
        ?? input.output.destinationContext?.destinationLocalTime,
      browserTimezone: input.output.event?.diagnostics?.browserTimezone,
      filteringCutoff: input.output.event?.diagnostics?.filteringCutoff,
      originalTemporalExpression: input.output.event?.originalTemporalText ?? memory.lastTemporalExpression,
      resolvedLabel: input.output.event?.timeWindow?.label ?? memory.lastTimeLabel,
      resolvedLocalDate: input.output.event?.diagnostics?.resolvedLocalDate,
      startTime: input.output.event?.timeWindow?.startTime ?? memory.lastTimeWindow?.startTime,
      endTime: input.output.event?.timeWindow?.endTime ?? memory.lastTimeWindow?.endTime,
      timezone: input.output.event?.timeWindow?.timezone ?? memory.lastTimeWindow?.timezone,
      resolverConfidence: input.output.event?.timeWindow?.confidence ?? memory.lastTimeWindow?.confidence,
      providerQueryWindow: input.output.event?.providerQueryWindow,
      requestMode: input.output.event?.diagnostics?.requestMode,
      searchMode: input.output.event?.diagnostics?.searchMode,
      resultMode: input.output.event?.diagnostics?.resultMode,
      sourcesAttempted: input.output.event?.diagnostics?.sourcesAttempted,
      sourcesSuccessful: input.output.event?.diagnostics?.sourcesSuccessful,
      sourcesFailed: input.output.event?.diagnostics?.sourcesFailed,
      sourceWarnings: input.output.event?.diagnostics?.sourceWarnings,
      rawResultCountBySource: input.output.event?.diagnostics?.rawResultCountBySource,
      mergedResultCount: input.output.event?.diagnostics?.mergedResultCount,
      duplicatesRemoved: input.output.event?.diagnostics?.duplicatesRemoved,
      categoriesReturned: input.output.event?.diagnostics?.categoriesReturned,
      filterDecisions: input.output.event?.diagnostics?.filterDecisions,
      resultState: input.output.event?.diagnostics?.resultState,
      rejectedCandidates: input.output.event?.rejectedCandidates ?? [],
    },
    services: input.services,
    knowledgeRetrieval: {
      retrievedCards,
      cardsUsed: retrievedCards.filter(card => card.used),
      cardsRejected: retrievedCards.filter(card => !card.used),
      version: input.output.knowledge?.version,
      importedAt: input.output.knowledge?.importedAt,
    },
    promptInspector: {
      systemPrompt: input.llm?.systemPrompt
        ?? "SIT deterministic conversation engine. No LLM system prompt was sent for this turn.",
      retrievedContext: input.llm?.groundedContext
        ?? JSON.stringify(retrievedCards, null, 2),
      memoryContext: JSON.stringify(memory, null, 2),
      userMessage: input.userMessage,
      finalPrompt: input.llm?.finalPrompt
        ?? "No LLM prompt was constructed by the current Phase 2A runner.",
    },
    llmResponse: {
      status: input.llm?.status ?? "not_called",
      tier: input.llm?.tier,
      model: input.llm?.model,
      routingReason: input.llm?.routingReason,
      reasoningEffort: input.llm?.reasoningEffort,
      estimatedInputTokens: input.llm?.estimatedInputTokens,
      maxOutputTokens: input.llm?.maxOutputTokens,
      durationMs: input.llm?.durationMs,
      rawModelOutput: input.llm?.rawModelOutput
        ?? (input.llm?.error
          ? `OpenAI fallback: ${input.llm.error}`
          : input.llm?.disabledReason
            ? `OpenAI skipped: ${input.llm.disabledReason}`
            : "No raw model output: current runner is deterministic/service-based."),
      finalFormattedOutput,
    },
    shadowAgent: input.shadowAgent ?? {
      status: "disabled",
      disabledReason: "shadow_flag_off",
      durationMs: 0,
    },
    decisionTrace: ["User", "Intent", "Memory", "Services", "Knowledge", "LLM", "Final Response"],
    timelineTurn: {
      stateBefore: cloneState(input.stateBefore),
      stateAfter: cloneState(input.output.updatedState),
      memoryChanges: memoryChanges(input.stateBefore, input.output.updatedState),
    },
    trace: input.output.trace,
  };
}

function formatAssistantMessages(messages: AssistantMessage[]): string {
  return messages.map(message => message.text).join("\n\n");
}
