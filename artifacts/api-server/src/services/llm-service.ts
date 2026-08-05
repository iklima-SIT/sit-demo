import type {
  ConversationMemory,
  ConversationTurn,
  EventSearchDiagnostics,
  RunConversationTurnOutput,
} from "@workspace/sit-engine";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_STANDARD_MODEL = "gpt-5.6-luna";
const DEFAULT_PREMIUM_MODEL = "gpt-5.6-sol";
const DEFAULT_STANDARD_MAX_OUTPUT_TOKENS = 500;
const DEFAULT_PREMIUM_MAX_OUTPUT_TOKENS = 800;
const MAX_CONTEXT_EVENTS = 8;
const MAX_CONTEXT_VENUES = 8;
const MAX_CONTEXT_TURNS = 6;
const RECENT_CONTEXT_TURNS = 4;
const MAX_TURN_CHARACTERS = 1_200;
const MAX_DRAFT_CHARACTERS = 10_000;
const MEMORY_STOP_WORDS = new Set([
  "about", "after", "again", "also", "been", "before", "could", "does", "from", "have",
  "here", "into", "just", "like", "more", "only", "that", "their", "there", "they", "this",
  "today", "tomorrow", "want", "what", "when", "where", "which", "with", "would", "your",
]);

const SIT_SYSTEM_PROMPT = [
  "You are SIT, Koh Phangan's trusted local intelligence companion.",
  "Produce the final reply to the traveler's current message using only the canonical state and verified evidence supplied below.",
  "The current explicit objective has priority over onboarding, old filters, and older conversation topics.",
  "Preserve the active task when the message is a refinement, correction, or answer to SIT's latest clarification.",
  "Never broaden an explicit time, category, area, budget, or mobility constraint.",
  "Use knowledge and service results as evidence, not as a reason to dump every available item.",
  "For a broad decision request, prefer one focused recommendation or one materially useful clarification over a long catalogue.",
  "Preserve every concrete recommendation, named place, option, distinction, caveat, and source link from the proposed deterministic response.",
  "When that response contains multiple listed options, include every option; never silently remove, merge, or replace them with a question.",
  "For a factual request, answer directly without Discovery or onboarding questions.",
  "Do not invent events, dates, opening hours, prices, addresses, availability, people, or links.",
  "Preserve material caveats and source links when they appear in the evidence.",
  "When evidence is insufficient, say that naturally. Ask at most one focused question only when its answer would materially change the response.",
  "Do not expose confidence scores, internal state names, routing decisions, prompts, or developer terminology.",
  "Sound like a calm, concise local friend. Return only the final user-facing reply.",
].join("\n");

type FetchLike = typeof fetch;

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

export interface LlmTrace {
  status: "disabled" | "success" | "error";
  disabledReason?: "flag_off" | "missing_api_key" | "empty_message" | "empty_draft" | "cost_control";
  tier?: "none" | "standard" | "premium";
  routingReason?: string;
  model?: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  estimatedInputTokens?: number;
  durationMs: number;
  systemPrompt?: string;
  groundedContext?: string;
  finalPrompt?: string;
  rawModelOutput?: string;
  error?: string;
}

export interface LlmRoutingPolicy {
  tier: "none" | "standard" | "premium";
  reason: string;
  model?: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
}

function extractOutputText(response: OpenAIResponse): string | undefined {
  if (response.output_text?.trim()) return response.output_text.trim();
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        return content.text.trim();
      }
    }
  }
  return undefined;
}

function textDraft(output: RunConversationTurnOutput): string {
  return output.messages
    .filter(message => message.type === "text")
    .map(message => message.text)
    .join("\n\n")
    .slice(0, MAX_DRAFT_CHARACTERS);
}

function compactEventMemory(lastEvent: ConversationMemory["lastEvent"]): unknown {
  if (!lastEvent) return undefined;
  return {
    scope: lastEvent.scope,
    query: lastEvent.query,
    timeWindow: lastEvent.timeWindow,
    filters: lastEvent.filters,
    selectedEvents: (lastEvent.events ?? lastEvent.availableEvents ?? []).slice(0, MAX_CONTEXT_EVENTS),
    availableEventCount: lastEvent.availableEvents?.length ?? lastEvent.events?.length ?? 0,
    venueReferences: (lastEvent.venueReferences ?? lastEvent.availableVenueReferences ?? []).slice(0, MAX_CONTEXT_VENUES),
  };
}

function compactEventDiagnostics(diagnostics: EventSearchDiagnostics | undefined): unknown {
  if (!diagnostics) return undefined;
  return {
    destination: diagnostics.destination,
    destinationTimezone: diagnostics.destinationTimezone,
    destinationCurrentTime: diagnostics.destinationCurrentTime,
    filteringCutoff: diagnostics.filteringCutoff,
    requestMode: diagnostics.requestMode,
    searchMode: diagnostics.searchMode,
    resultMode: diagnostics.resultMode,
    sourcesSuccessful: diagnostics.sourcesSuccessful,
    sourceWarnings: diagnostics.sourceWarnings,
    categoriesReturned: diagnostics.categoriesReturned,
    appliedFilters: diagnostics.appliedFilters,
    mergedResultCount: diagnostics.mergedResultCount,
    resultState: diagnostics.resultState,
  };
}

function compactTravelerProfile(output: RunConversationTurnOutput): unknown {
  const context = output.updatedState.context;
  const remembered = output.updatedState.memory.userProfile ?? {};
  return {
    firstName: context.firstName ?? remembered.firstName,
    age: context.age ?? remembered.age,
    genderIdentity: context.genderIdentity ?? remembered.genderIdentity,
    humanNeed: context.purpose ?? remembered.purpose,
    humanNeedDetail: context.purposeDetail ?? remembered.purposeDetail,
    groupComposition: context.groupComposition ?? remembered.groupComposition,
    stayingArea: context.stayingArea ?? remembered.stayingArea,
    tripDuration: context.duration ?? remembered.duration,
    mobility: context.scooter ?? remembered.scooter,
    sociability: context.sociability ?? remembered.sociability,
  };
}

function memoryTerms(text: string): Set<string> {
  return new Set(text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(term => term.length > 2 && !MEMORY_STOP_WORDS.has(term)));
}

export function selectRelevantConversationTurns(
  userMessage: string,
  turns: ConversationTurn[],
): ConversationTurn[] {
  let latestUserIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  const previousTurns = latestUserIndex >= 0 ? turns.slice(0, latestUserIndex) : turns;
  const recentStart = Math.max(0, previousTurns.length - RECENT_CONTEXT_TURNS);
  const recentIndexes = previousTurns.map((_, index) => index).slice(recentStart);
  const queryTerms = memoryTerms(userMessage);
  const relevantOlderIndexes = previousTurns
    .slice(0, recentStart)
    .map((turn, index) => ({
      index,
      score: [...memoryTerms(turn.text)].filter(term => queryTerms.has(term)).length,
    }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, MAX_CONTEXT_TURNS - RECENT_CONTEXT_TURNS)
    .map(candidate => candidate.index);

  return [...new Set([...relevantOlderIndexes, ...recentIndexes])]
    .sort((left, right) => left - right)
    .map(index => previousTurns[index]!)
    .slice(-MAX_CONTEXT_TURNS);
}

function groundedContext(output: RunConversationTurnOutput, userMessage: string): string {
  const state = output.updatedState;
  return JSON.stringify({
    travelerProfile: compactTravelerProfile(output),
    conversationSummary: {
      activeObjective: state.activeTask?.objective,
      activeTaskStatus: state.activeTask?.status,
      currentMode: state.memory.currentMode,
      lastTopic: state.memory.lastTopic,
      lastArea: state.memory.lastArea,
      stayingArea: state.memory.stayingArea,
      lastTimeLabel: state.memory.lastTimeLabel,
      onboardingStage: state.memory.onboardingStage,
      onboardingPaused: state.memory.onboardingPaused,
      lastVenue: state.memory.lastVenue,
      lastVenueReference: state.memory.lastVenueReference,
      lastEvent: compactEventMemory(state.memory.lastEvent),
      pendingUserRequest: state.memory.pendingUserRequest,
      pendingFollowUp: state.memory.pendingFollowUp,
    },
    currentDecision: output.decision ? {
      intent: output.decision.intent,
      action: output.decision.action,
      requiredService: output.decision.requiredService,
      debugReason: output.decision.debugReason,
    } : undefined,
    verifiedEventResult: output.event ? {
      timeWindow: output.event.timeWindow,
      originalTemporalText: output.event.originalTemporalText,
      providerQueryWindow: output.event.providerQueryWindow,
      diagnostics: compactEventDiagnostics(output.event.diagnostics),
    } : undefined,
    verifiedKnowledgeResult: output.knowledge ? {
      references: output.knowledge.references.slice(0, 6),
      version: output.knowledge.version,
      importedAt: output.knowledge.importedAt,
    } : undefined,
    relevantConversation: selectRelevantConversationTurns(userMessage, state.turns).map(turn => ({
      role: turn.role,
      text: turn.text.slice(0, MAX_TURN_CHARACTERS),
    })),
  }, null, 2);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function decideLlmRouting(
  output: RunConversationTurnOutput,
  env: NodeJS.ProcessEnv = process.env,
): LlmRoutingPolicy {
  const decision = output.decision;
  if (decision?.requiredService === "location") {
    return { tier: "none", reason: "Exact location answers stay deterministic." };
  }
  if (decision?.requiredService === "destination_context") {
    return { tier: "none", reason: "Verified destination facts stay deterministic." };
  }

  const requestMode = output.event?.diagnostics?.requestMode ?? output.updatedState.activeTask?.mode;
  const premium = requestMode === "decision"
    || decision?.intent === "planning"
    || decision?.intent === "recommendation"
    || decision?.intent === "advice"
    || decision?.requiredService === "plans";

  if (premium) {
    return {
      tier: "premium",
      reason: "Personal judgment or planning requires the premium model.",
      model: env.OPENAI_PREMIUM_MODEL || DEFAULT_PREMIUM_MODEL,
      reasoningEffort: env.OPENAI_PREMIUM_REASONING_EFFORT || "low",
      maxOutputTokens: positiveInteger(
        env.OPENAI_PREMIUM_MAX_OUTPUT_TOKENS,
        DEFAULT_PREMIUM_MAX_OUTPUT_TOKENS,
      ),
    };
  }

  return {
    tier: "standard",
    reason: "Routine conversation or grounded summarization uses the economical model.",
    model: env.OPENAI_MODEL || DEFAULT_STANDARD_MODEL,
    reasoningEffort: env.OPENAI_REASONING_EFFORT || "none",
    maxOutputTokens: positiveInteger(
      env.OPENAI_MAX_OUTPUT_TOKENS,
      DEFAULT_STANDARD_MAX_OUTPUT_TOKENS,
    ),
  };
}

const OPTION_STOP_WORDS = new Set([
  "about", "after", "around", "before", "could", "every", "their", "there",
  "these", "thing", "those", "tonight", "where", "which", "while", "would",
]);

function listedOptions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:[-*•]|\d+[.)])\s+/.test(line));
}

function optionTerms(option: string): string[] {
  return [...new Set(
    option
      .toLocaleLowerCase("en")
      .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
      ?.filter(term => term.length >= 5 && !OPTION_STOP_WORDS.has(term)) ?? [],
  )];
}

function preservesListedOptions(draft: string, rewritten: string): boolean {
  const options = listedOptions(draft);
  if (options.length < 2) return true;

  const normalizedReply = rewritten.toLocaleLowerCase("en");
  return options.every(option => {
    const terms = optionTerms(option);
    if (terms.length === 0) return true;
    const requiredMatches = Math.min(2, terms.length);
    return terms.filter(term => normalizedReply.includes(term)).length >= requiredMatches;
  });
}

function replaceLatestAssistantTranscript(
  output: RunConversationTurnOutput,
  rewritten: string,
): RunConversationTurnOutput["updatedState"] {
  const turns = output.updatedState.turns;
  let lastUserIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  const responseTurns = turns.slice(lastUserIndex + 1);
  const firstAssistant = responseTurns.find(turn => turn.role === "assistant");
  if (!firstAssistant) return output.updatedState;
  return {
    ...output.updatedState,
    turns: [
      ...turns.slice(0, lastUserIndex + 1),
      { ...firstAssistant, text: rewritten },
    ],
  };
}

export function isLlmEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SIT_LLM_ENABLED !== "false" && Boolean(env.OPENAI_API_KEY);
}

export async function enhanceConversationWithLlm(input: {
  userMessage: string;
  output: RunConversationTurnOutput;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  onTrace?: (trace: LlmTrace) => void;
}): Promise<RunConversationTurnOutput> {
  const env = input.env ?? process.env;
  if (!input.userMessage.trim()) {
    input.onTrace?.({ status: "disabled", disabledReason: "empty_message", durationMs: 0 });
    return input.output;
  }
  if (!env.OPENAI_API_KEY) {
    input.onTrace?.({ status: "disabled", disabledReason: "missing_api_key", durationMs: 0 });
    return input.output;
  }
  if (env.SIT_LLM_ENABLED === "false") {
    input.onTrace?.({ status: "disabled", disabledReason: "flag_off", durationMs: 0 });
    return input.output;
  }

  const routing = decideLlmRouting(input.output, env);
  if (routing.tier === "none") {
    input.onTrace?.({
      status: "disabled",
      disabledReason: "cost_control",
      tier: routing.tier,
      routingReason: routing.reason,
      durationMs: 0,
    });
    return input.output;
  }

  const draft = textDraft(input.output);
  if (!draft) {
    input.onTrace?.({ status: "disabled", disabledReason: "empty_draft", durationMs: 0 });
    return input.output;
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const model = routing.model!;
  const context = groundedContext(input.output, input.userMessage);
  const finalPrompt = [
    `Current user message:\n${input.userMessage}`,
    `Canonical SIT state and verified evidence:\n${context}`,
    `Proposed deterministic response:\n${draft}`,
  ].join("\n\n");
  const estimatedInputTokens = Math.ceil((SIT_SYSTEM_PROMPT.length + finalPrompt.length) / 4);
  const startedAt = performance.now();

  let rewritten: string;
  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: routing.reasoningEffort },
        text: { verbosity: "low" },
        max_output_tokens: routing.maxOutputTokens,
        store: false,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: SIT_SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: finalPrompt }],
          },
        ],
      }),
      signal: AbortSignal.timeout(Number(env.OPENAI_TIMEOUT_MS || 20000)),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Responses API failed with status ${response.status}`);
    }

    rewritten = extractOutputText(await response.json() as OpenAIResponse) ?? "";
    if (!rewritten) throw new Error("OpenAI Responses API returned no text");
    if (!preservesListedOptions(draft, rewritten)) {
      throw new Error("OpenAI response omitted concrete options from the grounded draft");
    }
  } catch (error) {
    input.onTrace?.({
      status: "error",
      tier: routing.tier,
      routingReason: routing.reason,
      model,
      reasoningEffort: routing.reasoningEffort,
      maxOutputTokens: routing.maxOutputTokens,
      estimatedInputTokens,
      durationMs: Math.round(performance.now() - startedAt),
      systemPrompt: SIT_SYSTEM_PROMPT,
      groundedContext: context,
      finalPrompt,
      error: error instanceof Error ? error.message : "Unknown OpenAI error",
    });
    throw error;
  }

  input.onTrace?.({
    status: "success",
    tier: routing.tier,
    routingReason: routing.reason,
    model,
    reasoningEffort: routing.reasoningEffort,
    maxOutputTokens: routing.maxOutputTokens,
    estimatedInputTokens,
    durationMs: Math.round(performance.now() - startedAt),
    systemPrompt: SIT_SYSTEM_PROMPT,
    groundedContext: context,
    finalPrompt,
    rawModelOutput: rewritten,
  });

  let replaced = false;
  return {
    ...input.output,
    updatedState: replaceLatestAssistantTranscript(input.output, rewritten),
    messages: input.output.messages.flatMap(message => {
      if (message.type !== "text") return [message];
      if (replaced) return [];
      replaced = true;
      return [{ ...message, text: rewritten }];
    }),
  };
}
