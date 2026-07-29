export type EventCategoryFilter =
  | "wellness"
  | "yoga"
  | "techno"
  | "live_music"
  | "music"
  | "party"
  | "workshop"
  | "ecstatic_dance";

export type EventAudienceFilter = "family";

export interface EventSearchFilters {
  categories?: EventCategoryFilter[];
  audience?: EventAudienceFilter;
  area?: string;
  venue?: string;
}

const AREA_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Sri Thanu", pattern: /\b(?:sri\s*thanu|srithanu)\b/ },
  { label: "Haad Rin", pattern: /\bhaad\s*rin\b/ },
  { label: "Baan Tai", pattern: /\b(?:baan|ban)\s*tai\b/ },
  { label: "Chaloklum", pattern: /\bchaloklum\b/ },
  { label: "Haad Yao", pattern: /\bhaad\s*yao\b/ },
  { label: "Zen Beach", pattern: /\bzen\s*beach\b/ },
];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizePlace(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractEventVenue(text: string): string | undefined {
  const patterns = [
    /\bwhat(?:'s|\s+is)\s+(?:the\s+)?events?\s+(?:at|in)\s+(.+)$/i,
    /\bwhat(?:'s|\s+is)\s+(?:happening|going\s+on)\s+(?:at|in)\s+(.+)$/i,
    /\b(?:events?|part(?:y|ies)|classes?|workshops?)\s+(?:at|in)\s+(.+)$/i,
  ];
  const raw = patterns
    .map(pattern => text.match(pattern)?.[1])
    .find(Boolean);
  if (!raw) return undefined;

  const venue = raw
    .replace(/\s+\b(?:today|tonight|tomorrow|later\s+tonight|this\s+weekend|next\s+weekend|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, "")
    .replace(/[?.!,]+$/g, "")
    .trim();
  if (!venue || /^(?:koh\s+phangan|the\s+island|island|around\s+the\s+island)$/i.test(venue)) return undefined;
  return venue;
}

export function resolveEventSearchFilters(text: string): EventSearchFilters | undefined {
  const normalized = text.toLowerCase().replace(/[’']/g, "'");
  const categories: EventCategoryFilter[] = [];

  if (/\bwellness\b|\bwellbeing\b|\bwell-being\b/.test(normalized)) categories.push("wellness");
  if (/\byoga\b|\bacroyoga\b/.test(normalized)) categories.push("yoga");
  if (/\btechno\b|\bminimal\b|\bpsytrance\b|\btrance\b|\bhouse music\b|\btech house\b/.test(normalized)) categories.push("techno");
  if (/\blive music\b|\blive band\b|\bopen mic\b|\bmusic jam\b/.test(normalized)) categories.push("live_music");
  if (/\becstatic dance\b|\bconscious dance\b/.test(normalized)) categories.push("ecstatic_dance");
  if (/\bworkshops?\b|\bclasses\b/.test(normalized)) categories.push("workshop");
  if (/\bpart(?:y|ies)\b|\bnightlife\b|\bclub(?:s|bing)?\b|\brave\b/.test(normalized)) categories.push("party");
  if (/\bmusic\b/.test(normalized) && !categories.some(category => ["techno", "live_music", "ecstatic_dance"].includes(category))) {
    categories.push("music");
  }

  const area = AREA_PATTERNS.find(candidate => candidate.pattern.test(normalized))?.label;
  const extractedVenue = extractEventVenue(text);
  const venue = extractedVenue && (!area || normalizePlace(extractedVenue) !== normalizePlace(area))
    ? extractedVenue
    : undefined;
  const audience = /\bfamil(?:y|ies)\b|\bkids?\b|\bchildren\b|\bchild-friendly\b/.test(normalized)
    ? "family" as const
    : undefined;
  const resolvedCategories = unique(categories);

  if (resolvedCategories.length === 0 && !area && !audience && !venue) return undefined;
  return {
    categories: resolvedCategories.length > 0 ? resolvedCategories : undefined,
    audience,
    area,
    ...(venue ? { venue } : {}),
  };
}

export function describeEventSearchFilters(filters: EventSearchFilters | undefined): string | undefined {
  if (!filters) return undefined;
  const labels = (filters.categories ?? []).map(category => ({
    wellness: "wellness",
    yoga: "yoga",
    techno: "techno",
    live_music: "live music",
    music: "music",
    party: "parties",
    workshop: "workshops",
    ecstatic_dance: "ecstatic dance",
  })[category]);
  if (filters.audience) labels.push("family-friendly");
  const categoryText = labels.join(" or ");
  if (categoryText && filters.venue) return `${categoryText} at ${filters.venue}`;
  if (filters.venue) return `events at ${filters.venue}`;
  if (categoryText && filters.area) return `${categoryText} around ${filters.area}`;
  if (filters.area) return `events around ${filters.area}`;
  return categoryText || undefined;
}
