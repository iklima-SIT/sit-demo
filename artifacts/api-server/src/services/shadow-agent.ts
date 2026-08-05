import type {
  ConversationChannel,
  ConversationState,
  RunConversationTurnOutput,
} from "@workspace/sit-engine";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-sol";
const DEFAULT_TIMEOUT_MS = 20_000;

type FetchLike = typeof fetch;

export type ShadowAgentStatus = "disabled" | "success" | "error";
export type ShadowRequestMode = "information" | "decision";
export type ShadowTaskRelationship =
  | "new_task"
  | "continuation"
  | "refinement"
  | "contract_answer"
  | "correction";

export interface ShadowKnownConstraint {
  name: string;
  value: string;
  source: "current_message" | "active_task" | "conversation" | "memory";
}

export interface ShadowConversationContract {
  expectedAnswer: "venue" | "date" | "area" | "event" | "preference";
  reason: string;
}

export interface ShadowAgentPlan {
  mode: ShadowRequestMode;
  relationshipToActiveTask: ShadowTaskRelationship;
  activeObjective: string;
  action:
    | "answer"
    | "clarify"
    | "search_events"
    | "resolve_location"
    | "search_knowledge"
    | "recommend"
    | "plan";
  requiredServices: Array<
    | "EventService"
    | "KnowledgeService"
    | "LocationService"
    | "PlanService"
    | "DestinationContextService"
    | "RecommendationService"
  >;
  knownConstraints: ShadowKnownConstraint[];
  missingCriticalContext: string[];
  questionRequired: boolean;
  conversationContract?: ShadowConversationContract;
  preservedContext: string[];
  confidence: number;
  decisionSummary: string;
  proposedResponse: string;
  comparison: {
    agreesWithCanonical: boolean;
    differences: string[];
  };
}

export interface ShadowAgentTrace {
  status: ShadowAgentStatus;
  disabledReason?: "shadow_flag_off" | "developer_trace_required" | "missing_api_key";
  model?: string;
  durationMs: number;
  plan?: ShadowAgentPlan;
  rawModelOutput?: string;
  error?: string;
  promptInspector?: {
    systemPrompt: string;
    inputContext: string;
    finalPrompt: string;
  };
}

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

const SYSTEM_PROMPT = [
  "You are the shadow Conversation Orchestrator for SIT, a Koh Phangan Local Intelligence System.",
  "Your job is to understand the traveler's current objective and propose a grounded response for developer comparison.",
  "Do not reveal hidden chain-of-thought. Return only the requested JSON object with concise structured reasons.",
  "",
  "Operating invariants:",
  "- First decide whether the traveler needs facts (Information Mode) or judgment (Decision Mode).",
  "- A factual request bypasses Discovery. Discovery is optional and only asks what would materially change a recommendation.",
  "- The latest explicit objective has priority over onboarding, fallback behavior, and stale workflow state.",
  "- Only the traveler may replace the active objective. The system may continue, clarify, complete, or abandon it.",
  "- If SIT asked a question and the new message can satisfy its Conversation Contract, consume it as that answer first.",
  "- Preserve explicit date, category, area, venue, audience, budget, mobility, and human-need constraints until the traveler changes them.",
  "- Never ask for information already present in the current message, conversation, active task, or memory.",
  "- Knowledge supports judgment; it does not decide on its own. Prefer one trustworthy fit over an unrelated list.",
  "- Current destination facts require evidence. If evidence is missing, say so naturally instead of inventing details.",
  "- Use Asia/Bangkok as the clock for Koh Phangan decisions.",
  "- Write the proposed response like a knowledgeable local friend: direct, warm, calm, and concise.",
].join("\n");

const OUTPUT_CONTRACT = {
  mode: "information | decision",
  relationshipToActiveTask: "new_task | continuation | refinement | contract_answer | correction",
  activeObjective: "one concise sentence",
  action: "answer | clarify | search_events | resolve_location | search_knowledge | recommend | plan",
  requiredServices: ["service names, or an empty array"],
  knownConstraints: [{ name: "constraint", value: "value", source: "current_message | active_task | conversation | memory" }],
  missingCriticalContext: ["only facts required before a trustworthy answer"],
  questionRequired: false,
  conversationContract: { expectedAnswer: "venue | date | area | event | preference", reason: "why this answer is required" },
  preservedContext: ["explicit context that must not be lost"],
  confidence: 0.0,
  decisionSummary: "brief product-level reason, not hidden reasoning",
  proposedResponse: "the response SIT should send",
  comparison: { agreesWithCanonical: true, differences: ["material differences only"] },
};

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

function formatAssistantOutput(output: RunConversationTurnOutput): string {
  return output.messages.map(message => message.text).join("\n\n");
}

function compactState(state: ConversationState): object {
  return {
    context: state.context,
    memory: state.memory,
    activeTask: state.activeTask,
    recentTurns: state.turns.slice(-12).map(turn => ({
      role: turn.role,
      text: turn.text,
    })),
  };
}

function canonicalEvidence(output: RunConversationTurnOutput): object {
  return {
    decision: output.decision,
    answer: formatAssistantOutput(output),
    event: output.event,
    knowledge: output.knowledge,
    destinationContext: output.destinationContext,
    recommendation: output.recommendation,
    suggestions: output.suggestions,
    planOptions: output.planOptions,
  };
}

export function buildShadowAgentPrompt(input: {
  userMessage: string;
  channel: ConversationChannel;
  stateBefore: ConversationState;
  canonicalOutput: RunConversationTurnOutput;
}): { systemPrompt: string; inputContext: string; finalPrompt: string } {
  const inputContext = JSON.stringify({
    channel: input.channel,
    currentUserMessage: input.userMessage,
    stateBefore: compactState(input.stateBefore),
    canonicalResult: canonicalEvidence(input.canonicalOutput),
  }, null, 2);
  const finalPrompt = [
    "Inspect this conversation turn independently.",
    "Preserve known context, identify the current objective, and compare your proposed behavior with the canonical result.",
    "Use only the supplied state and canonical service evidence for factual claims.",
    "Return valid JSON matching this contract:",
    JSON.stringify(OUTPUT_CONTRACT, null, 2),
    "",
    "Conversation turn:",
    inputContext,
  ].join("\n");

  return { systemPrompt: SYSTEM_PROMPT, inputContext, finalPrompt };
}

function extractJson(raw: string): unknown {
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Shadow agent returned no JSON object");
  return JSON.parse(unfenced.slice(start, end + 1));
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`Shadow agent field ${field} must be a string array`);
  }
  return value;
}

function parsePlan(raw: string): ShadowAgentPlan {
  const value = extractJson(raw);
  if (!value || typeof value !== "object") throw new Error("Shadow agent plan must be an object");
  const plan = value as Record<string, unknown>;
  const modes = ["information", "decision"];
  const relationships = ["new_task", "continuation", "refinement", "contract_answer", "correction"];
  const actions = ["answer", "clarify", "search_events", "resolve_location", "search_knowledge", "recommend", "plan"];
  if (!modes.includes(String(plan.mode))) throw new Error("Shadow agent returned an invalid mode");
  if (!relationships.includes(String(plan.relationshipToActiveTask))) throw new Error("Shadow agent returned an invalid task relationship");
  if (!actions.includes(String(plan.action))) throw new Error("Shadow agent returned an invalid action");
  if (typeof plan.activeObjective !== "string" || !plan.activeObjective.trim()) throw new Error("Shadow agent returned no active objective");
  if (typeof plan.questionRequired !== "boolean") throw new Error("Shadow agent returned an invalid questionRequired value");
  if (typeof plan.decisionSummary !== "string") throw new Error("Shadow agent returned no decision summary");
  if (typeof plan.proposedResponse !== "string" || !plan.proposedResponse.trim()) throw new Error("Shadow agent returned no proposed response");
  if (typeof plan.confidence !== "number" || plan.confidence < 0 || plan.confidence > 1) throw new Error("Shadow agent returned an invalid confidence");
  if (!Array.isArray(plan.knownConstraints)) throw new Error("Shadow agent returned invalid known constraints");
  const knownConstraints = plan.knownConstraints.map((constraint, index) => {
    if (!constraint || typeof constraint !== "object") throw new Error(`Shadow constraint ${index} is invalid`);
    const item = constraint as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.value !== "string") throw new Error(`Shadow constraint ${index} is incomplete`);
    const sources = ["current_message", "active_task", "conversation", "memory"];
    if (!sources.includes(String(item.source))) throw new Error(`Shadow constraint ${index} has an invalid source`);
    return item as unknown as ShadowKnownConstraint;
  });
  if (!plan.comparison || typeof plan.comparison !== "object") throw new Error("Shadow agent returned no comparison");
  const comparison = plan.comparison as Record<string, unknown>;
  if (typeof comparison.agreesWithCanonical !== "boolean") throw new Error("Shadow comparison is invalid");

  return {
    mode: plan.mode as ShadowRequestMode,
    relationshipToActiveTask: plan.relationshipToActiveTask as ShadowTaskRelationship,
    activeObjective: plan.activeObjective,
    action: plan.action as ShadowAgentPlan["action"],
    requiredServices: stringArray(plan.requiredServices, "requiredServices") as ShadowAgentPlan["requiredServices"],
    knownConstraints,
    missingCriticalContext: stringArray(plan.missingCriticalContext, "missingCriticalContext"),
    questionRequired: plan.questionRequired,
    conversationContract: plan.conversationContract && typeof plan.conversationContract === "object"
      ? plan.conversationContract as ShadowConversationContract
      : undefined,
    preservedContext: stringArray(plan.preservedContext, "preservedContext"),
    confidence: plan.confidence,
    decisionSummary: plan.decisionSummary,
    proposedResponse: plan.proposedResponse,
    comparison: {
      agreesWithCanonical: comparison.agreesWithCanonical,
      differences: stringArray(comparison.differences, "comparison.differences"),
    },
  };
}

export function isShadowAgentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SIT_AGENT_SHADOW_ENABLED === "true";
}

export async function runShadowAgentTurn(input: {
  userMessage: string;
  channel: ConversationChannel;
  stateBefore: ConversationState;
  canonicalOutput: RunConversationTurnOutput;
  devTrace: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}): Promise<ShadowAgentTrace> {
  const env = input.env ?? process.env;
  if (!isShadowAgentEnabled(env)) {
    return { status: "disabled", disabledReason: "shadow_flag_off", durationMs: 0 };
  }
  if (!input.devTrace) {
    return { status: "disabled", disabledReason: "developer_trace_required", durationMs: 0 };
  }
  if (!env.OPENAI_API_KEY) {
    return { status: "disabled", disabledReason: "missing_api_key", durationMs: 0 };
  }

  const promptInspector = buildShadowAgentPrompt(input);
  const model = env.SIT_AGENT_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL;
  const started = performance.now();

  try {
    const response = await (input.fetchImpl ?? fetch)(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: env.SIT_AGENT_REASONING_EFFORT || "medium" },
        text: { verbosity: "low" },
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: promptInspector.systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: promptInspector.finalPrompt }],
          },
        ],
      }),
      signal: AbortSignal.timeout(Number(env.SIT_AGENT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)),
    });

    if (!response.ok) throw new Error(`OpenAI Responses API failed with status ${response.status}`);
    const rawModelOutput = extractOutputText(await response.json() as OpenAIResponse);
    if (!rawModelOutput) throw new Error("OpenAI Responses API returned no shadow-agent output");

    return {
      status: "success",
      model,
      durationMs: Math.round(performance.now() - started),
      plan: parsePlan(rawModelOutput),
      rawModelOutput,
      promptInspector,
    };
  } catch (error) {
    return {
      status: "error",
      model,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Unknown shadow-agent error",
      promptInspector,
    };
  }
}
