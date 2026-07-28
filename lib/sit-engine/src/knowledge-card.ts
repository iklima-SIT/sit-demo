export interface CanonicalKnowledgeCard {
  id: string;
  category: string;
  subcategory: string;
  topic: string;
  travelerType: string;
  myth: string;
  reality: string;
  deepLocalInsight: string;
  psychologicalLayer: string;
  recommendedFor: string;
  notRecommendedFor: string;
  aiRecommendationLogic: string;
  relatedCategories: string[];
  hiddenBenefit: string;
  hiddenRisk: string;
  updateFrequency: string;
  confidence: string;
  priorityScore: number;
  sourceExpert: string;
  architectureLayer: string;
  masterCategory: string;
  dataMoatScore: number;
  monetizationScore: number;
  investorValueScore: number;
  localityScore: number;
  status: string;
  version: string;
  importedAt: string;
}

export interface KnowledgeImportMetadata {
  version: string;
  importedAt: string;
  sourceWorkbook: string;
  sheetName: string;
  cardCount: number;
}

export interface KnowledgeImportReport {
  metadata: KnowledgeImportMetadata;
  validRows: number;
  invalidRows: KnowledgeImportRowError[];
  warnings: string[];
}

export interface KnowledgeImportBundle {
  metadata: KnowledgeImportMetadata;
  cards: CanonicalKnowledgeCard[];
}

export interface KnowledgeImportRowError {
  rowNumber: number;
  id?: string;
  errors: string[];
}

export interface KnowledgeRowsInput {
  rows: unknown[][];
  sheetName: string;
  sourceWorkbook: string;
  version?: string;
  importedAt?: string;
}

type RowMap = Record<string, unknown>;

const HEADER_ALIASES: Record<keyof Omit<CanonicalKnowledgeCard, "version" | "importedAt">, string[]> = {
  id: ["id", "cardid", "card_id", "card"],
  category: ["category"],
  subcategory: ["subcategory", "sub_category"],
  topic: ["topic", "title"],
  travelerType: ["travelertype", "traveler_type", "travellertype"],
  myth: ["myth", "touristmyth", "tourist_myth"],
  reality: ["reality", "description"],
  deepLocalInsight: ["deeplocalinsight", "deep_local_insight", "localinsight", "local_insight"],
  psychologicalLayer: ["psychologicallayer", "psychological_layer"],
  recommendedFor: ["recommendedfor", "recommended_for", "bestfor", "best_for"],
  notRecommendedFor: ["notrecommendedfor", "not_recommended_for", "notidealfor", "not_ideal_for"],
  aiRecommendationLogic: ["airecommendationlogic", "ai_recommendation_logic", "airule", "ai_rule"],
  relatedCategories: ["relatedcategories", "related_categories"],
  hiddenBenefit: ["hiddenbenefit", "hidden_benefit", "localsecret", "local_secret"],
  hiddenRisk: ["hiddenrisk", "hidden_risk"],
  updateFrequency: ["updatefrequency", "update_frequency"],
  confidence: ["confidence"],
  priorityScore: ["priorityscore", "priority_score", "priorityscorev10", "priority_score_v10", "priority"],
  sourceExpert: ["sourceexpert", "source_expert", "source"],
  architectureLayer: ["architecturelayer", "architecture_layer"],
  masterCategory: ["mastercategory", "master_category"],
  dataMoatScore: ["datamoatscore", "data_moat_score"],
  monetizationScore: ["monetizationscore", "monetization_score"],
  investorValueScore: ["investorvaluescore", "investor_value_score"],
  localityScore: ["localityscore", "locality_score"],
  status: ["status"],
};

const REQUIRED_FIELDS: Array<keyof CanonicalKnowledgeCard> = ["id", "category", "topic"];

export function createKnowledgeVersion(importedAt = new Date().toISOString()): string {
  return `sit-kb-${importedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

export function normalizeKnowledgeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findHeaderRow(rows: unknown[][]): { index: number; headers: string[] } {
  for (let index = 0; index < rows.length; index++) {
    const normalized = rows[index]!.map(normalizeKnowledgeHeader);
    if (normalized.includes("topic") && (normalized.includes("cardid") || normalized.includes("id") || normalized.includes("category"))) {
      return { index, headers: normalized };
    }
  }
  return { index: -1, headers: [] };
}

function readCell(row: RowMap, field: keyof Omit<CanonicalKnowledgeCard, "version" | "importedAt">): unknown {
  for (const alias of HEADER_ALIASES[field]) {
    if (alias in row) return row[alias];
  }
  return undefined;
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function asList(value: unknown): string[] {
  const text = asText(value);
  if (!text) return [];
  return text.split(/[,|;]/).map(item => item.trim()).filter(Boolean);
}

function isBlankRow(row: unknown[]): boolean {
  return row.every(cell => asText(cell) === "");
}

export function normalizeKnowledgeRows(input: KnowledgeRowsInput): { bundle: KnowledgeImportBundle; report: KnowledgeImportReport } {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const version = input.version ?? createKnowledgeVersion(importedAt);
  const header = findHeaderRow(input.rows);
  if (header.index < 0) {
    const metadata = {
      version,
      importedAt,
      sourceWorkbook: input.sourceWorkbook,
      sheetName: input.sheetName,
      cardCount: 0,
    };
    return {
      bundle: { metadata, cards: [] },
      report: {
        metadata,
        validRows: 0,
        invalidRows: [{ rowNumber: 0, errors: ["No canonical header row found. Expected Topic plus Card ID/ID or Category."] }],
        warnings: [],
      },
    };
  }

  const cards: CanonicalKnowledgeCard[] = [];
  const invalidRows: KnowledgeImportRowError[] = [];
  const seenIds = new Set<string>();

  for (let rowIndex = header.index + 1; rowIndex < input.rows.length; rowIndex++) {
    const raw = input.rows[rowIndex] ?? [];
    if (isBlankRow(raw)) continue;

    const row: RowMap = {};
    header.headers.forEach((key, cellIndex) => {
      if (key) row[key] = raw[cellIndex];
    });

    const card: CanonicalKnowledgeCard = {
      id: asText(readCell(row, "id")) || `row-${rowIndex + 1}`,
      category: asText(readCell(row, "category")),
      subcategory: asText(readCell(row, "subcategory")),
      topic: asText(readCell(row, "topic")),
      travelerType: asText(readCell(row, "travelerType")),
      myth: asText(readCell(row, "myth")),
      reality: asText(readCell(row, "reality")),
      deepLocalInsight: asText(readCell(row, "deepLocalInsight")),
      psychologicalLayer: asText(readCell(row, "psychologicalLayer")),
      recommendedFor: asText(readCell(row, "recommendedFor")),
      notRecommendedFor: asText(readCell(row, "notRecommendedFor")),
      aiRecommendationLogic: asText(readCell(row, "aiRecommendationLogic")),
      relatedCategories: asList(readCell(row, "relatedCategories")),
      hiddenBenefit: asText(readCell(row, "hiddenBenefit")),
      hiddenRisk: asText(readCell(row, "hiddenRisk")),
      updateFrequency: asText(readCell(row, "updateFrequency")) || "unknown",
      confidence: asText(readCell(row, "confidence")) || "unknown",
      priorityScore: asNumber(readCell(row, "priorityScore")) || 5,
      sourceExpert: asText(readCell(row, "sourceExpert")) || "SIT master workbook",
      architectureLayer: asText(readCell(row, "architectureLayer")),
      masterCategory: asText(readCell(row, "masterCategory")),
      dataMoatScore: asNumber(readCell(row, "dataMoatScore")),
      monetizationScore: asNumber(readCell(row, "monetizationScore")),
      investorValueScore: asNumber(readCell(row, "investorValueScore")),
      localityScore: asNumber(readCell(row, "localityScore")),
      status: asText(readCell(row, "status")) || "active",
      version,
      importedAt,
    };

    const errors = REQUIRED_FIELDS
      .filter(field => asText(card[field]) === "")
      .map(field => `Missing required field: ${field}`);

    if (seenIds.has(card.id)) errors.push(`Duplicate id: ${card.id}`);

    if (errors.length) {
      invalidRows.push({ rowNumber: rowIndex + 1, id: card.id, errors });
      continue;
    }

    seenIds.add(card.id);
    cards.push(card);
  }

  const metadata = {
    version,
    importedAt,
    sourceWorkbook: input.sourceWorkbook,
    sheetName: input.sheetName,
    cardCount: cards.length,
  };

  return {
    bundle: { metadata, cards },
    report: {
      metadata,
      validRows: cards.length,
      invalidRows,
      warnings: [],
    },
  };
}

