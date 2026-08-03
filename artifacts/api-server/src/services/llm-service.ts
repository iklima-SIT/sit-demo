import type { RunConversationTurnOutput } from "@workspace/sit-engine";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-sol";

type FetchLike = typeof fetch;

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
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
    .join("\n\n");
}

function groundedContext(output: RunConversationTurnOutput): string {
  const state = output.updatedState;
  return JSON.stringify({
    purpose: state.context.purpose,
    travelerProfile: state.context,
    rememberedVenue: state.memory.lastVenue,
    lastEvent: state.memory.lastEvent,
    activeTask: state.activeTask,
  });
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
  return env.SIT_LLM_ENABLED === "true" && Boolean(env.OPENAI_API_KEY);
}

export async function enhanceConversationWithLlm(input: {
  userMessage: string;
  output: RunConversationTurnOutput;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}): Promise<RunConversationTurnOutput> {
  const env = input.env ?? process.env;
  if (!input.userMessage.trim() || !isLlmEnabled(env)) return input.output;

  const draft = textDraft(input.output);
  if (!draft) return input.output;

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      reasoning: { effort: env.OPENAI_REASONING_EFFORT || "low" },
      text: { verbosity: "low" },
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: [
                "You are SIT, a trusted local guide for Koh Phangan.",
                "Rewrite the supplied deterministic draft as a natural, concise chat reply.",
                "Treat the draft and structured context as the only factual evidence.",
                "Never invent events, dates, opening hours, prices, addresses, availability, or links.",
                "Preserve every concrete recommendation, named place, option, distinction, caveat, and source link from the draft.",
                "When the draft contains a list or multiple options, include every option; never summarize, remove, merge, or replace them with a question.",
                "Only when the draft contains no actionable option may you say evidence is insufficient and ask one focused follow-up question.",
                "Never restart onboarding or ask for information the user has already supplied.",
                "Return only the final user-facing reply, with no analysis or JSON.",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `User message:\n${input.userMessage}\n\nGrounded context:\n${groundedContext(input.output)}\n\nDeterministic SIT draft:\n${draft}`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(Number(env.OPENAI_TIMEOUT_MS || 15000)),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Responses API failed with status ${response.status}`);
  }

  const rewritten = extractOutputText(await response.json() as OpenAIResponse);
  if (!rewritten) throw new Error("OpenAI Responses API returned no text");
  if (!preservesListedOptions(draft, rewritten)) {
    throw new Error("OpenAI response omitted concrete options from the grounded draft");
  }

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
