export interface KBCard {
  id: string;
  category: string;
  topic: string;
  description: string;
  localInsight: string;
  travelerType: string;
  bestFor: string;
  notIdealFor: string;
  aiRule: string;
  localSecret: string;
  touristMyth: string;
  priority: number;
  confidence: string;
  source: string;
}

const PURPOSE_CATEGORIES: Record<string, string[]> = {
  wellness: [
    "wellness intelligence", "yoga intelligence", "breathwork intelligence",
    "wellness safety intelligence", "cacao intelligence", "plant medicine safety intelligence",
    "biohacking intelligence", "ice bath intelligence", "tantra intelligence",
    "teacher intelligence", "yoga venue intelligence", "teacher training intelligence",
    "beginner yoga intelligence", "sound healing expectations", "dance & wellness intelligence",
    "dance as wellness", "ecstatic dance gateway", "meditation intelligence",
  ],
  music: [
    "party intelligence", "music intelligence", "music culture intelligence",
    "full moon is not koh phangan", "day parties as compromise",
  ],
  "remote-work": [
    "digital nomad intelligence", "lifestyle intelligence", "community intelligence",
    "sports & community intelligence",
  ],
  romance: [
    "romance intelligence", "sunset intelligence", "couples intelligence",
    "hinkong low tide sunset picnic", "hinkong changes with the tide",
    "sup into sunset", "best area for romance and social life", "different definitions of vacation",
  ],
  community: [
    "community intelligence", "sports & community intelligence", "lifestyle intelligence",
    "personality intelligence",
  ],
  nature: [
    "beach intelligence", "local experience routes", "beach comparison",
    "local secrets", "area intelligence",
  ],
  moving: [
    "long-term resident intelligence", "expat intelligence", "visa intelligence",
    "cost of living intelligence", "financial intelligence", "long-term living intelligence",
    "reinvention intelligence", "lifestyle risk intelligence", "expectation vs reality",
  ],
  unsure: [
    "first-time visitor intelligence", "tourist myths", "tourist traps",
    "tourist mistakes", "lifestyle intelligence",
  ],
};

const EXPERT_SCORE_MIN = 5;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function scoreCard(card: KBCard, tokens: string[], purpose?: string): number {
  let score = 0;
  const searchable = [
    card.category,
    card.topic,
    card.description,
    card.localInsight,
    card.aiRule,
    card.touristMyth,
    card.bestFor,
    card.travelerType,
  ].join(" ").toLowerCase();

  for (const token of tokens) {
    if (searchable.includes(token)) score += 1;
  }

  if (purpose) {
    const purposeCats = PURPOSE_CATEGORIES[purpose] ?? [];
    const cardCat = card.category.toLowerCase();
    if (purposeCats.some(pc => cardCat.includes(pc) || pc.includes(cardCat))) {
      score += 3;
    }
  }

  score += card.priority * 0.3;
  if (card.confidence === "Very High") score += 1;
  if (!card.localInsight && !card.description && !card.aiRule) score *= 0.2;
  return score;
}

export function searchKBWithScore(
  query: string,
  purpose: string | undefined,
  kb: KBCard[],
  topN = 5,
): { card: KBCard; score: number }[] {
  const tokens = tokenize(query);
  return kb
    .map(card => ({ card, score: scoreCard(card, tokens, purpose) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function searchKB(
  query: string,
  purpose: string | undefined,
  kb: KBCard[],
  topN = 3,
): KBCard[] {
  return searchKBWithScore(query, purpose, kb, topN).map(s => s.card);
}

export function extractKBInsight(cards: KBCard[]): string {
  const insights = cards
    .filter(c => c.localInsight || c.aiRule || c.description)
    .slice(0, 2)
    .map(c => c.localInsight || c.description || c.aiRule)
    .filter(Boolean);
  return insights.join(" ");
}

function firstSentences(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences.slice(0, n).join(" ").trim();
}

function isOffPurposeCard(card: KBCard, purpose: string): boolean {
  const cat = card.category.toLowerCase();
  const topic = card.topic.toLowerCase();
  if (purpose === "music") {
    return /yoga|ecstatic.?dance|meditation|breathwork|cacao|tantra|plant.?medicine|ceremony|sound.?healing|retreat|spiritual/.test(cat + " " + topic);
  }
  if (purpose === "wellness") {
    return /party.?intelligence|music.?intelligence|full.?moon|nightlife/.test(cat);
  }
  return false;
}

export function buildExpertAnswer(
  question: string,
  hits: { card: KBCard; score: number }[],
  purpose?: string,
): string | null {
  const q = question.toLowerCase();
  const purposeFiltered = purpose
    ? hits.filter(h => !isOffPurposeCard(h.card, purpose))
    : hits;
  const strong = purposeFiltered.filter(h => h.score >= EXPERT_SCORE_MIN);

  if (/tonight|today|tomorrow|this week|whats on|what.?s on|happening now|event|schedule|lineup|right now/.test(q.replace(/[’']/g, ""))) {
    return null;
  }

  if (strong.length === 0) return null;

  const questionKeywords = q
    .replace(/\b(what|where|when|how|who|which|is|it|the|a|an|are|was|were|do|does|can|i|you|me|my|your|in|on|at|of|to|for|and|or|but|with|from|that|this|they|them|their|about|tell|know|any|best|good)\b/g, " ")
    .split(/\W+/)
    .filter(w => w.length > 3);

  const relevantCard = strong.find(h => {
    if (questionKeywords.length === 0) return true;
    const cardText = (h.card.topic + " " + h.card.description + " " + h.card.localInsight + " " + (h.card.localSecret ?? "")).toLowerCase();
    return questionKeywords.some(kw => cardText.includes(kw));
  });

  if (!relevantCard) return null;

  const top = relevantCard.card;
  const bullets = top.bestFor
    ? top.bestFor.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2).slice(0, 4)
    : [];

  const mainAnswer = firstSentences(top.localInsight || top.description, 2);
  if (!mainAnswer || mainAnswer.length < 20) return null;

  const insightLine = top.localSecret
    ? firstSentences(top.localSecret, 1)
    : firstSentences(top.localInsight || top.description, 1);

  if (bullets.length >= 2) {
    return `${top.topic}:\n${bullets.map(b => `• ${b}`).join("\n")}\n\nLocal insight:\n${insightLine}`;
  }

  return `${mainAnswer}\n\nLocal insight:\n${insightLine}`;
}

export function buildEventFallback(scope: "tonight" | "tomorrow" | "narrow" = "tonight"): string {
  if (scope === "tomorrow") {
    return "I can't verify reliable events for tomorrow from the trusted local event accounts yet.\nWant me to check a specific venue or music style?";
  }

  if (scope === "narrow") {
    return "I can't verify anything reliable for that category from the trusted local event accounts yet.";
  }

  return [
    "I can't verify anything reliable for the rest of tonight from the trusted local event accounts.",
    "Want me to check tomorrow too?",
  ].join("\n");
}

export function buildHonestFallback(question: string): string {
  const q = question.toLowerCase();

  if (/tonight|today|tomorrow|what.?s on|happening|event|schedule|lineup/.test(q.replace(/[’']/g, ""))) {
    return buildEventFallback();
  }
  if (/cost|price|how much|expensive|cheap|budget/.test(q)) {
    return "Rough daily costs:\n• Budget: $30–50\n• Mid-range: $60–100\n• Comfortable: $100–150+\n\nLocal insight:\nAccommodation near the main areas is 30% cheaper if you book direct.";
  }
  if (/safe|dangerous|crime|scam/.test(q)) {
    return "Generally safe. Main risks:\n• Scooter accidents\n• Petty theft at Full Moon\n• Dodgy ceremony facilitators\n\nAnything specific you're worried about?";
  }
  if (/weather|rain|season|monsoon|best time/.test(q)) {
    return "Best months:\n• Feb – Aug: dry, sunny\n• Sep – Oct: occasional rain\n• Nov – Dec: rough — heavy rain, choppy seas\n\nWhen are you planning to come?";
  }
  if (/visa|stay|how long|legal/.test(q)) {
    return "Visa basics:\n• 30 days on arrival (most passports)\n• +30 day extension at Thong Sala immigration\n• Longer stays need a proper Thai visa\n\nWhat's your nationality?";
  }
  if (/sim|internet|wifi|data/.test(q)) {
    return "Connectivity:\n• AIS or DTAC — both solid coverage\n• Monthly SIM with unlimited data: ~$15–20\n• Most coworking spaces and cafés have reliable wifi\n\nAre you planning to work remotely?";
  }
  if (/food|eat|restaurant|cafe|coffee/.test(q)) {
    return "Food breakdown:\n• Street food: $2–5 per meal\n• Local restaurants: $5–10\n• Western / health cafés: $8–15\n\nLocal insight:\nThe best spots rarely have English menus out front.";
  }
  return "I don't have a specific answer for that. Tell me more and I'll give you what I do know.";
}
