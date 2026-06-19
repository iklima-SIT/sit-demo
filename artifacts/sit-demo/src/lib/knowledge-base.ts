import * as XLSX from "xlsx";
import { EMBEDDED_KB } from "./kb-data";

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

// ─── Category → purpose mapping ───────────────────────────────────────────────

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

// ─── Keyword extraction ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

// ─── Score a card against tokens + purpose ───────────────────────────────────

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
  ]
    .join(" ")
    .toLowerCase();

  for (const token of tokens) {
    if (searchable.includes(token)) score += 1;
  }

  // Boost cards whose category maps to the user's purpose
  if (purpose) {
    const purposeCats = PURPOSE_CATEGORIES[purpose] ?? [];
    const cardCat = card.category.toLowerCase();
    if (purposeCats.some(pc => cardCat.includes(pc) || pc.includes(cardCat))) {
      score += 3;
    }
  }

  // Boost by priority and confidence
  score += card.priority * 0.3;
  if (card.confidence === "Very High") score += 1;

  // Cards with no real content are less useful
  if (!card.localInsight && !card.description && !card.aiRule) score *= 0.2;

  return score;
}

// ─── Public search function ───────────────────────────────────────────────────

export function searchKB(
  query: string,
  purpose: string | undefined,
  kb: KBCard[],
  topN = 3
): KBCard[] {
  const tokens = tokenize(query);
  const scored = kb
    .map(card => ({ card, score: scoreCard(card, tokens, purpose) }))
    .filter(s => s.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(s => s.card);
  return scored;
}

// ─── Format KB insights for injection into a SIT response ────────────────────

export function extractKBInsight(cards: KBCard[]): string {
  const insights = cards
    .filter(c => c.localInsight || c.aiRule || c.description)
    .slice(0, 2)
    .map(c => c.localInsight || c.description || c.aiRule)
    .filter(Boolean);
  return insights.join(" ");
}

// ─── Parse an uploaded xlsx file into KBCard[] ────────────────────────────────

export function parseXlsxToCards(file: File): Promise<KBCard[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        const cards: KBCard[] = [];

        // Try Iklima sheet first
        const iklimaSheet = wb.Sheets["Iklima"];
        if (iklimaSheet) {
          const raw = XLSX.utils.sheet_to_json(iklimaSheet, { header: 1 }) as unknown[][];
          const headerRow = raw.findIndex(
            r => Array.isArray(r) && r.includes("Card ID") && r.includes("Topic")
          );
          if (headerRow >= 0) {
            const headers = raw[headerRow] as string[];
            for (let i = headerRow + 1; i < raw.length; i++) {
              const r = raw[i] as (string | number | null)[];
              if (!r || !r[0]) continue;
              const get = (key: string) => String(r[headers.indexOf(key)] ?? "");
              cards.push({
                id: get("Card ID"),
                category: get("Category"),
                topic: get("Topic"),
                description: get("Description"),
                localInsight: get("Local Insight"),
                travelerType: get("Traveler Type"),
                bestFor: get("Best For"),
                notIdealFor: get("Not Ideal For"),
                aiRule: get("AI Rule"),
                localSecret: get("Local Secret"),
                touristMyth: get("Tourist Myth"),
                priority: Number(get("Priority")) || 5,
                confidence: get("Confidence"),
                source: "upload-iklima",
              });
            }
          }
        }

        // Try V10_Master_Knowledge_Graph sheet
        const v10Sheet = wb.Sheets["V10_Master_Knowledge_Graph"];
        if (v10Sheet) {
          const raw = XLSX.utils.sheet_to_json(v10Sheet, { header: 1 }) as unknown[][];
          const headerRow = raw.findIndex(
            r => Array.isArray(r) && r.includes("Card ID") && r.includes("Myth")
          );
          if (headerRow >= 0) {
            const headers = raw[headerRow] as string[];
            for (let i = headerRow + 1; i < raw.length; i++) {
              const r = raw[i] as (string | number | null)[];
              if (!r || !r[0]) continue;
              const get = (key: string) => String(r[headers.indexOf(key)] ?? "");
              cards.push({
                id: get("Card ID"),
                category: get("Category"),
                topic: get("Topic"),
                description: get("Myth") ? `Myth: ${get("Myth")} | Reality: ${get("Reality")}` : "",
                localInsight: get("Deep Local Insight"),
                travelerType: get("Traveler Type"),
                bestFor: get("Recommended For"),
                notIdealFor: get("Not Recommended For"),
                aiRule: get("AI Recommendation Logic"),
                localSecret: "",
                touristMyth: get("Myth"),
                priority: Number(get("Priority Score V10")) || 5,
                confidence: get("Confidence"),
                source: "upload-v10",
              });
            }
          }
        }

        // Fallback: try any sheet with a "Topic" column
        if (cards.length === 0) {
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
            const headerRow = raw.findIndex(
              r => Array.isArray(r) && (r.includes("Topic") || r.includes("Description"))
            );
            if (headerRow < 0) continue;
            const headers = raw[headerRow] as string[];
            for (let i = headerRow + 1; i < raw.length; i++) {
              const r = raw[i] as (string | number | null)[];
              if (!r || !r[0]) continue;
              const get = (key: string) => String(r[headers.indexOf(key)] ?? "");
              cards.push({
                id: get("Card ID") || String(i),
                category: get("Category"),
                topic: get("Topic"),
                description: get("Description"),
                localInsight: get("Local Insight") || get("Deep Local Insight"),
                travelerType: get("Traveler Type"),
                bestFor: get("Best For") || get("Recommended For"),
                notIdealFor: get("Not Ideal For") || get("Not Recommended For"),
                aiRule: get("AI Rule") || get("AI Recommendation Logic"),
                localSecret: get("Local Secret"),
                touristMyth: get("Tourist Myth") || get("Myth"),
                priority: Number(get("Priority") || get("Priority Score V10")) || 5,
                confidence: get("Confidence"),
                source: `upload-${sheetName}`,
              });
            }
            if (cards.length > 0) break;
          }
        }

        resolve(cards);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Default embedded KB ──────────────────────────────────────────────────────

export { EMBEDDED_KB };
