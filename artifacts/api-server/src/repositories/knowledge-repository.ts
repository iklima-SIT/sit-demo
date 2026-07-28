import fs from "node:fs";
import path from "node:path";
import type {
  CanonicalKnowledgeCard,
  KnowledgeImportBundle,
  KnowledgeImportMetadata,
} from "@workspace/sit-engine";

export interface KnowledgeSearchHit {
  card: CanonicalKnowledgeCard;
  score: number;
}

export interface KnowledgeRepository {
  getById(id: string): Promise<CanonicalKnowledgeCard | undefined>;
  search(query: string, context?: { travelerType?: string; purpose?: string; limit?: number }): Promise<KnowledgeSearchHit[]>;
  filterByCategory(category: string): Promise<CanonicalKnowledgeCard[]>;
  filterByTravelerType(travelerType: string): Promise<CanonicalKnowledgeCard[]>;
  getVersion(): Promise<string>;
  getImportMetadata(): Promise<KnowledgeImportMetadata>;
  replace(bundle: KnowledgeImportBundle): Promise<void>;
}

const EMPTY_METADATA: KnowledgeImportMetadata = {
  version: "none",
  importedAt: "",
  sourceWorkbook: "",
  sheetName: "",
  cardCount: 0,
};

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(value: string): string[] {
  return value.toLowerCase().match(TOKEN_RE) ?? [];
}

function scoreCard(card: CanonicalKnowledgeCard, query: string, purpose?: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const weightedText = [
    card.topic.repeat(4),
    card.category.repeat(2),
    card.subcategory,
    card.travelerType,
    card.myth,
    card.reality,
    card.deepLocalInsight,
    card.psychologicalLayer,
    card.recommendedFor,
    card.notRecommendedFor,
    card.aiRecommendationLogic,
    card.relatedCategories.join(" "),
    card.hiddenBenefit,
    card.hiddenRisk,
    card.masterCategory,
  ].join(" ").toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    if (weightedText.includes(token)) score += token.length > 3 ? 2 : 1;
  }
  if (purpose && weightedText.includes(purpose.toLowerCase())) score += 2;
  score += Math.min(card.priorityScore, 10) / 10;
  score += Math.min(card.localityScore, 10) / 20;
  return score;
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  protected cards = new Map<string, CanonicalKnowledgeCard>();
  protected metadata: KnowledgeImportMetadata = EMPTY_METADATA;

  constructor(bundle?: KnowledgeImportBundle) {
    if (bundle) void this.replace(bundle);
  }

  async getById(id: string): Promise<CanonicalKnowledgeCard | undefined> {
    return this.cards.get(id);
  }

  async search(query: string, context: { travelerType?: string; purpose?: string; limit?: number } = {}): Promise<KnowledgeSearchHit[]> {
    const limit = context.limit ?? 5;
    return [...this.cards.values()]
      .filter(card => card.status.toLowerCase() !== "inactive")
      .map(card => ({ card, score: scoreCard(card, query, context.purpose) }))
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async filterByCategory(category: string): Promise<CanonicalKnowledgeCard[]> {
    const target = category.toLowerCase();
    return [...this.cards.values()].filter(card => card.category.toLowerCase() === target);
  }

  async filterByTravelerType(travelerType: string): Promise<CanonicalKnowledgeCard[]> {
    const target = travelerType.toLowerCase();
    return [...this.cards.values()].filter(card => card.travelerType.toLowerCase().includes(target));
  }

  async getVersion(): Promise<string> {
    return this.metadata.version;
  }

  async getImportMetadata(): Promise<KnowledgeImportMetadata> {
    return this.metadata;
  }

  async replace(bundle: KnowledgeImportBundle): Promise<void> {
    this.cards = new Map(bundle.cards.map(card => [card.id, card]));
    this.metadata = bundle.metadata;
  }
}

export class FileKnowledgeRepository extends InMemoryKnowledgeRepository {
  constructor(private readonly currentPath: string) {
    super();
    this.reload();
  }

  reload(): void {
    if (!fs.existsSync(this.currentPath)) return;
    const bundle = JSON.parse(fs.readFileSync(this.currentPath, "utf8")) as KnowledgeImportBundle;
    this.cards = new Map(bundle.cards.map(card => [card.id, card]));
    this.metadata = bundle.metadata;
  }

  override async replace(bundle: KnowledgeImportBundle): Promise<void> {
    await super.replace(bundle);
    fs.mkdirSync(path.dirname(this.currentPath), { recursive: true });
    fs.writeFileSync(this.currentPath, `${JSON.stringify(bundle, null, 2)}\n`);
  }
}

function resolveDefaultKnowledgePath(): string {
  const fromRoot = path.resolve(process.cwd(), "artifacts/api-server/data/knowledge/current.json");
  if (fs.existsSync(fromRoot)) return fromRoot;
  return path.resolve(process.cwd(), "data/knowledge/current.json");
}

export const defaultKnowledgePath = resolveDefaultKnowledgePath();

export const knowledgeRepository = new FileKnowledgeRepository(defaultKnowledgePath);
