import {
  KOH_PHANGAN_TIME_ZONE,
  createEventSearchRequest,
  describeEventSearchFilters,
  type EventCategoryFilter,
  type EventSearchFilters,
  type EventSearchRequest,
  type NormalizedEventTimeWindow,
} from "./time-resolver";
import {
  classifyEventExperience,
  sanitizeCustomerFacingText,
  type EventClassification,
  type PrimaryExperience,
} from "@workspace/sit-engine";
import {
  TODO_TODAY_HOME_URL,
  fetchTodoTodayEvents,
} from "./todo-today-source";

export const TRUSTED_EVENT_SOURCES = [
  TODO_TODAY_HOME_URL,
  "https://t.me/s/phangantoday",
  "https://phangan.events/",
  "https://phangan.events/events-parties-calendar/",
  "https://www.instagram.com/phangan.events/",
  "https://www.instagram.com/retromountainphangan/",
  "https://www.instagram.com/_happy_people_events_/",
  "https://www.instagram.com/phanganism/",
  "https://www.instagram.com/bambuhuts/",
  "https://www.instagram.com/edengarden_kohphangan/",
  "https://www.instagram.com/holice___/",
  "https://www.instagram.com/secret.mountain.phangan/",
];

const NO_TRUSTED_EVENT_FOUND = "NO_TRUSTED_EVENT_FOUND";
const PHANGAN_TODAY_TELEGRAM = "https://t.me/s/phangantoday";
const PHANGAN_EVENTS_HOME = "https://phangan.events/";
const PHANGAN_EVENTS_CALENDAR = "https://phangan.events/events-parties-calendar/";

interface CalendarEvent {
  title: string;
  category: string;
  venue: string;
  startTime: string;
  endTime: string;
  price?: string;
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  confidence?: "high" | "medium" | "low";
  googleMapsUrl?: string;
  sourceCategoryId?: string;
}

interface EventSourceConfig {
  id: string;
  name: string;
  url: string;
  category: string;
  trustLevel: "primary" | "trusted" | "supporting";
  expectedPostingStyle: string;
  active: boolean;
  notes: string;
}

interface SourceResult {
  source: EventSourceConfig;
  status: "success" | "failed";
  events: CalendarEvent[];
  reason?: string;
  warning?: string;
}

interface MergedEvent extends CalendarEvent, EventClassification {
  sourceLinks: string[];
  sourceNames: string[];
}

export const APPROVED_EVENT_SOURCE_REGISTRY: EventSourceConfig[] = [
  {
    id: "todo-today",
    name: "Todo.Today Koh Phangan",
    url: TODO_TODAY_HOME_URL,
    category: "major island event pages",
    trustLevel: "primary",
    expectedPostingStyle: "Structured live calendar with event IDs, categories, times, venues, prices, maps, and event links.",
    active: true,
    notes: "Primary broad island calendar. Attempted independently on every live event search.",
  },
  {
    id: "phangan-today-telegram",
    name: "Phangan Today Telegram",
    url: PHANGAN_TODAY_TELEGRAM,
    category: "major island event pages",
    trustLevel: "trusted",
    expectedPostingStyle: "Daily Telegram digest with time, title, venue, price, and Todo.Today links.",
    active: true,
    notes: "Independent digest source and fallback evidence; it does not stand in for the full Todo.Today calendar.",
  },
  {
    id: "phangan-events",
    name: "phangan.events calendar",
    url: PHANGAN_EVENTS_HOME,
    category: "major island event pages",
    trustLevel: "trusted",
    expectedPostingStyle: "Public event calendar cards with date, time, title, venue, tickets.",
    active: true,
    notes: "Trusted calendar source, strong for parties and markets.",
  },
  {
    id: "instagram-phangan-events",
    name: "Instagram @phangan.events",
    url: "https://www.instagram.com/phangan.events/",
    category: "major island event pages",
    trustLevel: "supporting",
    expectedPostingStyle: "Public Instagram posts and story-style event announcements.",
    active: true,
    notes: "Used through Exa/public web evidence; no random Instagram accounts.",
  },
  {
    id: "instagram-retro-mountain",
    name: "Instagram @retromountainphangan",
    url: "https://www.instagram.com/retromountainphangan/",
    category: "clubs and music venues",
    trustLevel: "supporting",
    expectedPostingStyle: "Venue event flyers and lineup posts.",
    active: true,
    notes: "Approved music venue source.",
  },
  {
    id: "instagram-happy-people",
    name: "Instagram @_happy_people_events_",
    url: "https://www.instagram.com/_happy_people_events_/",
    category: "clubs and music venues",
    trustLevel: "supporting",
    expectedPostingStyle: "Organizer flyer posts.",
    active: true,
    notes: "Approved event organizer source.",
  },
  {
    id: "instagram-phanganism",
    name: "Instagram @phanganism",
    url: "https://www.instagram.com/phanganism/",
    category: "major island event pages",
    trustLevel: "supporting",
    expectedPostingStyle: "Island event and community posts.",
    active: true,
    notes: "Approved island media source.",
  },
  {
    id: "instagram-bambu-huts",
    name: "Instagram @bambuhuts",
    url: "https://www.instagram.com/bambuhuts/",
    category: "beach venues",
    trustLevel: "supporting",
    expectedPostingStyle: "Beach venue party and session announcements.",
    active: true,
    notes: "Approved beach venue source.",
  },
  {
    id: "instagram-eden-garden",
    name: "Instagram @edengarden_kohphangan",
    url: "https://www.instagram.com/edengarden_kohphangan/",
    category: "beach venues",
    trustLevel: "supporting",
    expectedPostingStyle: "Venue party announcements.",
    active: true,
    notes: "Approved beach venue source.",
  },
  {
    id: "instagram-holice",
    name: "Instagram @holice___",
    url: "https://www.instagram.com/holice___/",
    category: "clubs and music venues",
    trustLevel: "supporting",
    expectedPostingStyle: "Event and artist announcements.",
    active: true,
    notes: "Approved music event source.",
  },
  {
    id: "instagram-secret-mountain",
    name: "Instagram @secret.mountain.phangan",
    url: "https://www.instagram.com/secret.mountain.phangan/",
    category: "clubs and music venues",
    trustLevel: "supporting",
    expectedPostingStyle: "Venue event flyers and sunset session posts.",
    active: true,
    notes: "Approved venue source.",
  },
];

export interface LiveEventSearchResult {
  response: string | null;
  fallback: boolean;
  sources: string[];
  queryUsed: string;
  timeWindow: NormalizedEventTimeWindow;
  fallbackMessage?: string;
  rejectedCandidates?: Array<{
    text: string;
    reason: string;
    detectedTime?: string;
  }>;
  rawResponse?: unknown;
  httpStatus?: number;
  diagnostics?: import("@workspace/sit-engine").EventSearchDiagnostics;
}

function cleanEventAnswer(answer: string | null): string | null {
  if (!answer) return null;

  const cleaned = answer
    .replace(/(?:\s*\[\d+\])+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return sanitizeCustomerFacingText(cleaned) || null;
}

function isNoVerifiedEventAnswer(answer: string | null): boolean {
  if (!answer) return true;

  const normalized = answer.toLowerCase();
  return normalized === NO_TRUSTED_EVENT_FOUND.toLowerCase() ||
    normalized.includes("no_trusted_event_found") ||
    /\bi can'?t verify\b/.test(normalized) ||
    /\bno trusted[- ]source event\b/.test(normalized) ||
    /\bno verified events?\b/.test(normalized) ||
    /\bno reliable events?\b/.test(normalized) ||
    /\bno events? (were )?found\b/.test(normalized);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function htmlToText(html: string): string {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function monthNumber(name: string): number {
  const normalized = name.toLowerCase().slice(0, 3);
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  return months[normalized] ?? 0;
}

function parseTimeFromText(text: string): { hour: number; minute: number } | null {
  const amPm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (amPm) {
    let hour = Number(amPm[1]);
    const minute = Number(amPm[2] ?? "0");
    const suffix = amPm[3]!.toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (clock) return { hour: Number(clock[1]), minute: Number(clock[2]) };
  return null;
}

function parseEventClock(text: string): { hour: number; minute: number } {
  const parsed = parseTimeFromText(text);
  if (!parsed) return { hour: 12, minute: 0 };
  return parsed;
}

function formatBangkokIso(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`;
}

function addOneBangkokDay(iso: string): string {
  const next = new Date(new Date(iso).getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  }).formatToParts(next);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return formatBangkokIso(get("year"), get("month"), get("day"), get("hour"), get("minute"));
}

function inferYear(month: number, day: number, window: NormalizedEventTimeWindow): number {
  const start = new Date(window.startTime);
  const startYear = Number(new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  }).format(start));
  const candidate = new Date(`${startYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+07:00`);
  const windowEnd = new Date(window.endTime);
  const endYear = Number(new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  }).format(windowEnd));
  if (candidate.getTime() < start.getTime() - 31 * 24 * 60 * 60 * 1000 && endYear > startYear) {
    return startYear + 1;
  }
  return startYear;
}

function detectCandidateDateTime(text: string, window: NormalizedEventTimeWindow): string | undefined {
  const time = parseTimeFromText(text) ?? { hour: 12, minute: 0 };

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00+07:00`;

  const monthDay = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/i);
  if (monthDay) {
    const month = monthNumber(monthDay[1]!);
    const day = Number(monthDay[2]);
    const year = monthDay[3] ? Number(monthDay[3]) : inferYear(month, day, window);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00+07:00`;
  }

  const dayMonth = text.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = monthNumber(dayMonth[2]!);
    const year = dayMonth[3] ? Number(dayMonth[3]) : inferYear(month, day, window);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00+07:00`;
  }

  return undefined;
}

function eventOverlapsWindow(event: CalendarEvent, window: NormalizedEventTimeWindow): boolean {
  const eventStart = new Date(event.startTime).getTime();
  const eventEnd = new Date(event.endTime).getTime();
  const windowStart = new Date(window.startTime).getTime();
  const windowEnd = new Date(window.endTime).getTime();
  return eventStart <= windowEnd && eventEnd >= windowStart;
}

function cleanCalendarValue(value: string): string {
  return value
    .replace(/\s*›.*$/g, "")
    .replace(/\bGet tickets\b.*$/i, "")
    .replace(/\bOther Events\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePhanganEventsCalendar(html: string, window: NormalizedEventTimeWindow): CalendarEvent[] {
  const text = htmlToText(html);
  const categories = [
    "Party",
    "Market",
    "Festival",
    "Live Music",
    "Workshop",
    "Wellness",
    "Yoga",
    "Community",
  ];
  const categoryPattern = categories.map(category => category.replace(" ", "\\s+")).join("|");
  const monthPattern = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
  const eventPattern = new RegExp(
    `(?:^|\\s)(${categoryPattern})\\s+(.{4,150}?)\\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\\s+(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{1,2}:\\d{2}\\s*(?:AM|PM))\\s*[–—-]\\s*(\\d{1,2}:\\d{2}\\s*(?:AM|PM))\\s+(.{2,90}?)(?=\\s+(?:${categoryPattern})\\s+|\\s+Image:|\\s+Tickets|\\s+Get tickets|$)`,
    "gi",
  );
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(eventPattern)) {
    const category = cleanCalendarValue(match[1] ?? "");
    const title = cleanCalendarValue(match[2] ?? "");
    const day = Number(match[4]);
    const month = monthNumber(match[5] ?? "");
    const startClock = parseEventClock(match[6] ?? "");
    const endClock = parseEventClock(match[7] ?? "");
    const venue = cleanCalendarValue(match[8] ?? "");
    if (!category || !title || !month || !day || !venue) continue;

    const year = inferYear(month, day, window);
    const startTime = formatBangkokIso(year, month, day, startClock.hour, startClock.minute);
    let endTime = formatBangkokIso(year, month, day, endClock.hour, endClock.minute);
    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      endTime = addOneBangkokDay(endTime);
    }

    const event = { title, category, venue, startTime, endTime };
    const key = `${event.title}|${event.venue}|${event.startTime}`;
    if (seen.has(key) || !eventOverlapsWindow(event, window)) continue;
    seen.add(key);
    events.push(event);
  }

  return events;
}

function lineTextFromHtml(html: string): string[] {
  return decodeHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|span|a|time|h\d)>/gi, "\n")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripLeadingIcon(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  }).format(date);
}

function sourceById(id: string): EventSourceConfig {
  const source = APPROVED_EVENT_SOURCE_REGISTRY.find(item => item.id === id);
  if (!source) throw new Error(`Unknown event source: ${id}`);
  return source;
}

function eventWithSource(event: CalendarEvent, source: EventSourceConfig, sourceUrl = source.url): CalendarEvent {
  return {
    ...event,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl,
    confidence: source.trustLevel === "primary" || source.trustLevel === "trusted" ? "high" : "medium",
  };
}

function isBroadEventRequest(input: EventSearchRequest): boolean {
  return !input.filters;
}

function categoryForEvent(event: MergedEvent): string {
  if (event.primaryExperience === "party") return "Parties and DJ events";
  if (event.primaryExperience === "music") {
    return event.secondaryTags.includes("live_music") ? "Live music" : "Music and DJ sets";
  }
  if (["wellness", "yoga", "breathwork", "movement"].includes(event.primaryExperience)) return "Yoga, wellness and breathwork";
  if (["spiritual_practice", "conscious_dance"].includes(event.primaryExperience)) return "Ecstatic dance and conscious events";
  if (["workshop", "community", "coworking"].includes(event.primaryExperience)) return "Workshops and community events";
  if (event.primaryExperience === "food") return "Food experiences";
  if (event.primaryExperience === "nature") return "Nature experiences";
  return "Other notable events";
}

function eventSearchText(event: CalendarEvent): string {
  return `${event.category} ${event.title} ${event.venue}`.toLowerCase();
}

function primaryExperiencesForFilter(category: EventCategoryFilter): PrimaryExperience[] {
  const mapping: Record<EventCategoryFilter, PrimaryExperience[]> = {
    wellness: ["wellness", "yoga", "breathwork", "movement", "spiritual_practice", "conscious_dance"],
    yoga: ["yoga"],
    techno: ["music", "party"],
    live_music: ["music"],
    music: ["music"],
    party: ["party"],
    workshop: ["workshop"],
    ecstatic_dance: ["conscious_dance"],
  };
  return mapping[category];
}

function classificationForEvent(event: CalendarEvent & Partial<EventClassification>): EventClassification {
  return event.primaryExperience
    ? event as CalendarEvent & EventClassification
    : {
        ...event,
        ...classifyEventExperience({ title: event.title, sourceCategory: event.category, venue: event.venue }),
      };
}

function eventMatchesPrimaryCategory(event: CalendarEvent & Partial<EventClassification>, category: EventCategoryFilter): boolean {
  const classification = classificationForEvent(event);
  if (!primaryExperiencesForFilter(category).includes(classification.primaryExperience)) return false;
  if (category === "techno") return classification.secondaryTags.includes("techno");
  if (category === "live_music") return classification.secondaryTags.includes("live_music");
  return true;
}

function eventMatchesSecondaryCategory(event: CalendarEvent & Partial<EventClassification>, category: EventCategoryFilter): boolean {
  const classification = classificationForEvent(event);
  if (eventMatchesPrimaryCategory(event, category)) return false;
  const tagByCategory: Partial<Record<EventCategoryFilter, EventClassification["secondaryTags"][number]>> = {
    wellness: "wellness",
    yoga: "movement",
    techno: "techno",
    live_music: "live_music",
    music: "music",
    party: "social",
    workshop: "community",
    ecstatic_dance: "conscious",
  };
  const tag = tagByCategory[category];
  return Boolean(tag && classification.secondaryTags.includes(tag));
}

function eventMatchesFilters(event: CalendarEvent & Partial<EventClassification>, filters: EventSearchFilters): boolean {
  const text = eventSearchText(event);
  const categoryMatch = !filters.categories?.length
    || filters.categories.some(category => eventMatchesPrimaryCategory(event, category));
  const audienceMatch = !filters.audience
    || /\b(family|families|kid|kids|children|child-friendly|all ages)\b/.test(text);
  const areaMatch = !filters.area
    || text.replace(/[^a-z0-9]+/g, " ").includes(filters.area.toLowerCase().replace(/[^a-z0-9]+/g, " "));
  return categoryMatch && audienceMatch && areaMatch;
}

function userPurposeDetail(userContext: unknown): string | undefined {
  if (!userContext || typeof userContext !== "object") return undefined;
  const purposeDetail = (userContext as { purposeDetail?: unknown }).purposeDetail;
  return typeof purposeDetail === "string" ? purposeDetail : undefined;
}

function prioritizeEventsForUserContext(events: MergedEvent[], input: EventSearchRequest): MergedEvent[] {
  if (!input.filters?.categories?.includes("wellness") || userPurposeDetail(input.userContext) !== "wellness-physical") {
    return events;
  }

  const physicalPriority: Partial<Record<PrimaryExperience, number>> = {
    movement: 0,
    yoga: 1,
    breathwork: 2,
    wellness: 3,
    conscious_dance: 4,
    spiritual_practice: 5,
  };
  return [...events].sort((a, b) => {
    const priorityDifference = (physicalPriority[a.primaryExperience] ?? 10) - (physicalPriority[b.primaryExperience] ?? 10);
    return priorityDifference || new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

type EventFilterDecision = NonNullable<import("@workspace/sit-engine").EventSearchDiagnostics["filterDecisions"]>[number];

function evaluateEventCandidate(event: MergedEvent, input: EventSearchRequest): EventFilterDecision {
  const eventEnd = new Date(event.endTime).getTime();
  const cutoff = new Date(input.clock.filteringCutoff).getTime();
  const classification = classificationForEvent(event);
  const classificationFields = {
    primaryExperience: classification.primaryExperience,
    secondaryTags: classification.secondaryTags,
    humanNeeds: classification.humanNeeds,
  };

  if (!eventOverlapsWindow(event, input.timeWindow)) {
    return {
      event: `${event.title} at ${event.venue}`,
      startTime: event.startTime,
      endTime: event.endTime,
      ...classificationFields,
      matchRole: "none",
      included: false,
      reason: `Excluded because it falls outside the normalized ${input.timeWindow.label} window.`,
    };
  }

  if (eventEnd <= cutoff) {
    return {
      event: `${event.title} at ${event.venue}`,
      startTime: event.startTime,
      endTime: event.endTime,
      ...classificationFields,
      matchRole: "none",
      included: false,
      reason: `Excluded because it ended before the Koh Phangan cutoff ${input.clock.filteringCutoff}.`,
    };
  }

  if (input.filters && !eventMatchesFilters(event, input.filters)) {
    const description = describeEventSearchFilters(input.filters) ?? "the explicit request";
    const secondaryCategories = (input.filters.categories ?? [])
      .filter(category => eventMatchesSecondaryCategory(event, category));
    return {
      event: `${event.title} at ${event.venue}`,
      startTime: event.startTime,
      endTime: event.endTime,
      ...classificationFields,
      matchRole: secondaryCategories.length > 0 ? "secondary" : "none",
      included: false,
      reason: secondaryCategories.length > 0
        ? `Excluded from strict results because ${secondaryCategories.join(" or ")} is secondary; the primary experience is ${classification.primaryExperience}.`
        : `Excluded because its primary experience (${classification.primaryExperience}) does not match ${description}.`,
    };
  }

  return {
    event: `${event.title} at ${event.venue}`,
    startTime: event.startTime,
    endTime: event.endTime,
    ...classificationFields,
    matchRole: input.filters?.categories?.length ? "primary" : undefined,
    included: true,
    reason: input.filters
      ? `Included because its primary experience (${classification.primaryExperience}) matches ${describeEventSearchFilters(input.filters)} and it remains active after the destination cutoff.`
      : "Included because it is inside the requested destination-time window and remains active after the destination cutoff.",
  };
}

function applyEventConstraints(events: MergedEvent[], input: EventSearchRequest): {
  events: MergedEvent[];
  decisions: EventFilterDecision[];
  secondaryCandidateCount: number;
} {
  const decisions = events.map(event => evaluateEventCandidate(event, input));
  const includedEvents = events.filter((_, index) => decisions[index]?.included);
  return {
    events: prioritizeEventsForUserContext(includedEvents, input),
    decisions,
    secondaryCandidateCount: decisions.filter(decision => decision.matchRole === "secondary").length,
  };
}

function normalizedEventKey(event: CalendarEvent): string {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const startDate = new Date(event.startTime);
  const start = localDateKey(startDate);
  const localHour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  }).format(startDate);
  return `${normalize(event.title)}|${normalize(event.venue)}|${start}|${localHour}`;
}

function mergeEvents(sourceResults: SourceResult[]): { events: MergedEvent[]; duplicatesRemoved: number } {
  const byKey = new Map<string, MergedEvent>();
  let duplicatesRemoved = 0;

  for (const result of sourceResults) {
    for (const event of result.events) {
      const key = normalizedEventKey(event);
      const existing = byKey.get(key);
      if (existing) {
        duplicatesRemoved++;
        existing.sourceLinks = Array.from(new Set([...existing.sourceLinks, event.sourceUrl ?? result.source.url]));
        existing.sourceNames = Array.from(new Set([...existing.sourceNames, event.sourceName ?? result.source.name]));
        existing.price = existing.price ?? event.price;
        existing.confidence = existing.confidence === "high" || event.confidence !== "high" ? existing.confidence : event.confidence;
        continue;
      }
      byKey.set(key, {
        ...event,
        ...classifyEventExperience({
          title: event.title,
          sourceCategory: event.category,
          venue: event.venue,
        }),
        sourceLinks: [event.sourceUrl ?? result.source.url],
        sourceNames: [event.sourceName ?? result.source.name],
      });
    }
  }

  return {
    events: [...byKey.values()].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    duplicatesRemoved,
  };
}

function formatEventTimeRange(event: CalendarEvent): string {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: KOH_PHANGAN_TIME_ZONE,
  });
  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  const endSuffix = dateFormatter.format(startDate) === dateFormatter.format(endDate) ? "" : " next day";
  return `${timeFormatter.format(startDate)}–${timeFormatter.format(endDate)}${endSuffix}`;
}

function formatMergedEventLandscape(events: MergedEvent[], input: EventSearchRequest, incomplete: boolean): { response: string; categories: string[] } {
  const window = input.timeWindow;
  const grouped = new Map<string, MergedEvent[]>();
  for (const event of events) {
    const category = categoryForEvent(event);
    grouped.set(category, [...(grouped.get(category) ?? []), event]);
  }

  const categoryOrder = [
    "Parties and DJ events",
    "Music and DJ sets",
    "Live music",
    "Ecstatic dance and conscious events",
    "Yoga, wellness and breathwork",
    "Workshops and community events",
    "Food experiences",
    "Nature experiences",
    "Other notable events",
  ];
  const categories = categoryOrder.filter(category => (grouped.get(category)?.length ?? 0) > 0);
  const lines = [
    incomplete
      ? `I couldn't fully verify ${window.label.toLowerCase()} from every live source yet, but I found these verified listings:`
      : input.resultMode === "complete"
        ? `Here are all verified island-wide events I found for ${window.label}:`
        : `Here's the verified island-wide event landscape for ${window.label}:`,
  ];

  for (const category of categories) {
    lines.push("", category);
    const categoryEvents = grouped.get(category) ?? [];
    for (const event of input.resultMode === "complete" ? categoryEvents : categoryEvents.slice(0, 5)) {
      const price = event.price ? ` · ${event.price}` : "";
      lines.push(`• ${event.title} — ${formatEventTimeRange(event)}, ${event.venue}${price}`);
    }
  }

  lines.push("", "Tell me whether you want music, wellness, something social, or a specific area and I'll narrow this down.");
  return { response: lines.join("\n"), categories };
}

function userFirstName(userContext: unknown): string | undefined {
  if (!userContext || typeof userContext !== "object") return undefined;
  const firstName = (userContext as { firstName?: unknown }).firstName;
  return typeof firstName === "string" && firstName.trim() ? firstName.trim() : undefined;
}

function formatFilteredEventLandscape(
  events: MergedEvent[],
  input: EventSearchRequest,
  incomplete: boolean,
  secondaryCandidateCount: number,
): { response: string; categories: string[] } {
  const grouped = new Map<string, MergedEvent[]>();
  for (const event of events) {
    const category = categoryForEvent(event);
    grouped.set(category, [...(grouped.get(category) ?? []), event]);
  }

  const categories = [...grouped.keys()];
  const description = describeEventSearchFilters(input.filters) ?? "matching events";
  const name = userFirstName(input.userContext);
  const lines: string[] = [];
  if (name) lines.push(`Welcome to Koh Phangan, ${name}.`, "");
  const musicOnly = input.filters?.categories?.length === 1 && input.filters.categories[0] === "music";
  lines.push(input.resultMode === "complete"
    ? incomplete
      ? `I couldn't verify every live source, but these are all ${description} events I could verify for ${input.timeWindow.label.toLowerCase()}:`
      : `These are all ${description} events I found for ${input.timeWindow.label.toLowerCase()}:`
    : musicOnly
    ? incomplete
      ? `I couldn't verify every live source, but these are the ${input.timeWindow.label.toLowerCase()} music-focused events I could verify:`
      : `These are ${input.timeWindow.label.toLowerCase()}'s music-focused events:`
    : incomplete
      ? `I couldn't verify every live source, but since you're looking for ${description} ${input.timeWindow.label.toLowerCase()}, these are the verified events I'd focus on:`
      : `Since you're looking for ${description} ${input.timeWindow.label.toLowerCase()}, these are the verified events I'd focus on:`);

  for (const category of categories) {
    lines.push("", category);
    const categoryEvents = grouped.get(category) ?? [];
    for (const event of input.resultMode === "complete" ? categoryEvents : categoryEvents.slice(0, 5)) {
      const price = event.price ? ` · ${event.price}` : "";
      lines.push(`• ${event.title} — ${formatEventTimeRange(event)}, ${event.venue}${price}`);
    }
  }

  if (input.filters?.categories?.includes("wellness")) {
    lines.push("", `I can narrow these down further by what fits ${input.timeWindow.label.toLowerCase()}: relaxing, spiritual, movement-based, or more social.`);
  } else if (musicOnly && events.length <= 2 && secondaryCandidateCount > 0) {
    lines.push("", "If you're also open to conscious events where music plays a central role, I have a couple more suggestions.");
  } else {
    lines.push("", "I can narrow these down further by area or the kind of atmosphere you want.");
  }
  return { response: lines.join("\n"), categories };
}

function parsePhanganTodayTelegramEvents(html: string, window: NormalizedEventTimeWindow): CalendarEvent[] {
  const lines = lineTextFromHtml(html);
  const targetDate = localDateKey(new Date(window.startTime));
  const dateLinePattern = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(20\d{2})/;
  const segment: string[] = [];
  let inTargetSegment = false;
  let sawAnyDate = false;

  for (const line of lines) {
    const dateMatch = line.match(dateLinePattern);
    if (dateMatch) {
      sawAnyDate = true;
      const month = monthNumber(dateMatch[2] ?? "");
      const day = Number(dateMatch[3]);
      const year = Number(dateMatch[4]);
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      inTargetSegment = dateKey === targetDate;
      continue;
    }
    if (!sawAnyDate || inTargetSegment) segment.push(line);
  }

  const source = sourceById("phangan-today-telegram");
  const events: CalendarEvent[] = [];
  const scan = segment.length ? segment : lines;

  for (let i = 0; i < scan.length; i++) {
    const timeLine = scan[i] ?? "";
    if (!/^🕒\s*/.test(timeLine)) continue;
    const titleLine = scan[i + 1] ?? "";
    const venueLine = scan.slice(i + 2, i + 6).find(line => /^📍\s*/.test(line)) ?? "";
    const priceLine = scan.slice(i + 2, i + 7).find(line => /^(💰|🆓|💖)\s*/.test(line));
    const linkLine = scan.slice(i + 2, i + 8).find(line => /^🔗\s*/.test(line));
    if (!titleLine || !venueLine) continue;

    const rangeText = timeLine.replace(/^🕒\s*/, "");
    const range = rangeText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))(?:\s*-\s*(Midnight|\d{1,2}:\d{2}\s*(?:AM|PM)))?/i);
    if (!range) continue;

    const startClock = parseEventClock(range[1] ?? "");
    const endClock = range[2]?.toLowerCase() === "midnight"
      ? { hour: 0, minute: 0 }
      : range[2]
        ? parseEventClock(range[2])
        : { hour: startClock.hour + 2, minute: startClock.minute };
    const startDate = new Date(window.startTime);
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: KOH_PHANGAN_TIME_ZONE,
    }).formatToParts(startDate);
    const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const startTime = formatBangkokIso(get("year"), get("month"), get("day"), startClock.hour, startClock.minute);
    let endTime = formatBangkokIso(get("year"), get("month"), get("day"), endClock.hour, endClock.minute);
    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) endTime = addOneBangkokDay(endTime);

    const event = eventWithSource({
      title: stripLeadingIcon(titleLine),
      category: "Community",
      venue: venueLine.replace(/^📍\s*/, "").trim(),
      startTime,
      endTime,
      price: priceLine ? stripLeadingIcon(priceLine) : undefined,
    }, source, linkLine ? linkLine.replace(/^🔗\s*/, "").trim() : source.url);

    if (eventOverlapsWindow(event, window)) events.push(event);
  }

  return events;
}

async function fetchHtmlSource(source: EventSourceConfig, parse: (html: string) => CalendarEvent[], alternateUrls: string[] = []): Promise<SourceResult> {
  const urls = [source.url, ...alternateUrls];
  let lastReason = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "SIT Local Intelligence event verifier",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        lastReason = `${source.name} returned HTTP ${res.status}`;
        continue;
      }
      const html = await res.text();
      const events = parse(html).map(event => eventWithSource(event, source, event.sourceUrl ?? url));
      return { source, status: "success", events };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : `Could not read ${source.name}`;
    }
  }
  return { source, status: "failed", events: [], reason: lastReason || `Could not read ${source.name}` };
}

async function fetchTodoTodaySource(input: EventSearchRequest): Promise<SourceResult> {
  const source = sourceById("todo-today");
  try {
    const result = await fetchTodoTodayEvents(input.timeWindow);
    return {
      source,
      status: "success",
      events: result.events.map(event => eventWithSource({
        title: event.title,
        category: event.category,
        venue: event.venue,
        startTime: event.startTime,
        endTime: event.endTime,
        price: event.price,
        googleMapsUrl: event.googleMapsUrl,
        sourceCategoryId: event.sourceCategoryId,
      }, source, event.sourceUrl)),
      warning: result.warning,
    };
  } catch (error) {
    return {
      source,
      status: "failed",
      events: [],
      reason: error instanceof Error ? error.message : "Could not read Todo.Today",
    };
  }
}

async function collectApprovedEvents(input: EventSearchRequest): Promise<SourceResult[]> {
  const phanganToday = sourceById("phangan-today-telegram");
  const phanganEvents = sourceById("phangan-events");
  return Promise.all([
    fetchTodoTodaySource(input),
    fetchHtmlSource(
      phanganToday,
      html => parsePhanganTodayTelegramEvents(html, input.timeWindow),
    ),
    fetchHtmlSource(
      phanganEvents,
      html => parsePhanganEventsCalendar(html, input.timeWindow),
      [PHANGAN_EVENTS_CALENDAR],
    ),
  ]);
}

export function validateEventAnswerWindow(
  answer: string | null,
  window: NormalizedEventTimeWindow,
  filteringCutoff: string = window.startTime,
): {
  answer: string | null;
  rejectedCandidates: NonNullable<LiveEventSearchResult["rejectedCandidates"]>;
} {
  if (!answer) return { answer: null, rejectedCandidates: [] };

  const start = new Date(window.startTime).getTime();
  const end = new Date(window.endTime).getTime();
  const cutoff = new Date(filteringCutoff).getTime();
  const lines = answer.split("\n");
  const kept: string[] = [];
  const rejectedCandidates: NonNullable<LiveEventSearchResult["rejectedCandidates"]> = [];

  for (const line of lines) {
    const detectedTime = detectCandidateDateTime(line, window);
    if (!detectedTime) {
      kept.push(line);
      continue;
    }

    const time = new Date(detectedTime).getTime();
    if (time < start || time > end) {
      rejectedCandidates.push({
        text: line,
        detectedTime,
        reason: `Detected event time is outside ${window.label} window.`,
      });
      continue;
    }

    if (time < cutoff) {
      rejectedCandidates.push({
        text: line,
        detectedTime,
        reason: `Detected event time is before the Koh Phangan filtering cutoff ${filteringCutoff}.`,
      });
      continue;
    }

    kept.push(line);
  }

  const filtered = kept.join("\n").trim();
  return { answer: filtered || null, rejectedCandidates };
}

function isLikelyEventAnswerLine(line: string, window: NormalizedEventTimeWindow): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+/.test(line) || Boolean(detectCandidateDateTime(line, window));
}

function lineMatchesFilters(line: string, filters: EventSearchFilters): boolean {
  const syntheticEvent: CalendarEvent = {
    title: line,
    category: line,
    venue: line,
    startTime: "",
    endTime: "",
  };
  if (!eventMatchesFilters(syntheticEvent, filters)) return false;

  if (filters.categories?.some(category => category === "wellness" || category === "yoga")) {
    const normalized = line.toLowerCase();
    const nightlife = /\b(techno|psytrance|trance|nightclub|nightlife|rave|dj set|beach party|club night)\b/.test(normalized);
    if (nightlife) return false;
  }

  return true;
}

function validateEventAnswerConstraints(answer: string | null, input: EventSearchRequest): {
  answer: string | null;
  rejectedCandidates: NonNullable<LiveEventSearchResult["rejectedCandidates"]>;
  decisions: EventFilterDecision[];
} {
  const windowValidated = validateEventAnswerWindow(answer, input.timeWindow, input.clock.filteringCutoff);
  if (!windowValidated.answer || !input.filters) {
    return {
      answer: windowValidated.answer,
      rejectedCandidates: windowValidated.rejectedCandidates,
      decisions: [],
    };
  }

  const accepted: string[] = [];
  const rejectedCandidates = [...windowValidated.rejectedCandidates];
  const decisions: EventFilterDecision[] = [];
  for (const line of windowValidated.answer.split("\n")) {
    if (!isLikelyEventAnswerLine(line, input.timeWindow)) continue;
    const lineEvent: CalendarEvent = {
      title: line,
      category: line,
      venue: "",
      startTime: "",
      endTime: "",
    };
    const classification = classificationForEvent(lineEvent);
    const included = lineMatchesFilters(line, input.filters);
    const secondaryMatch = (input.filters.categories ?? [])
      .some(category => eventMatchesSecondaryCategory(lineEvent, category));
    decisions.push({
      event: line.trim(),
      primaryExperience: classification.primaryExperience,
      secondaryTags: classification.secondaryTags,
      humanNeeds: classification.humanNeeds,
      matchRole: included ? "primary" : secondaryMatch ? "secondary" : "none",
      included,
      reason: included
        ? `Included because the Exa result's primary experience (${classification.primaryExperience}) matches ${describeEventSearchFilters(input.filters)}.`
        : secondaryMatch
          ? `Excluded from strict results because ${describeEventSearchFilters(input.filters)} is secondary; the primary experience is ${classification.primaryExperience}.`
          : `Excluded because the Exa result's primary experience (${classification.primaryExperience}) does not match ${describeEventSearchFilters(input.filters)}.`,
    });
    if (included) {
      accepted.push(line.trim());
    } else {
      rejectedCandidates.push({
        text: line,
        reason: `Result does not match the explicit ${describeEventSearchFilters(input.filters)} constraint.`,
      });
    }
  }

  if (accepted.length === 0) {
    return { answer: null, rejectedCandidates, decisions };
  }

  const description = describeEventSearchFilters(input.filters) ?? "matching events";
  const period = input.timeWindow.label === "Today"
    ? "today's"
    : `${input.timeWindow.label.toLowerCase()}'s`;
  const response = [
    `Since you're looking for ${description} ${input.timeWindow.label.toLowerCase()}, these are the verified events I'd focus on:`,
    "",
    ...accepted,
    "",
    input.filters.categories?.includes("wellness")
      ? `I can narrow ${period} wellness experiences further: relaxation, breathwork, yoga, movement, or meeting like-minded people.`
      : "I can narrow these down further by area or atmosphere.",
  ].join("\n");
  return { answer: response, rejectedCandidates, decisions };
}

export function createLiveEventSearchInput(
  query: string,
  now: Date = new Date(),
  browserTimezone?: string,
): EventSearchRequest {
  return createEventSearchRequest(query, now, { browserTimezone });
}

export function buildEventFallbackMessage(
  timeWindow: NormalizedEventTimeWindow,
  filters?: EventSearchFilters,
): string {
  const label = timeWindow.label.toLowerCase();
  if (filters?.categories?.includes("wellness")) {
    return [
      `I can't verify reliable wellness events for ${label} from the trusted local event accounts yet.`,
      "I can check a narrower wellness direction such as yoga, breathwork, movement, or sound healing.",
    ].join("\n");
  }
  if (label === "tonight") {
    return [
      "I can't verify anything reliable for tonight from the trusted local event accounts.",
      "Want me to check tomorrow too?",
    ].join("\n");
  }

  return `I can't verify reliable events for ${timeWindow.label} from the trusted local event accounts yet.\nWant me to check a specific venue or music style?`;
}

export function buildEventSearchQuery(input: EventSearchRequest): string {
  const filterDescription = describeEventSearchFilters(input.filters);

  return [
    `Current local time in Koh Phangan, Thailand is ${input.clock.destinationCurrentTime}.`,
    `The authoritative destination timezone is ${input.clock.timezone}.`,
    `Do not use or infer the traveler browser timezone${input.clock.browserTimezone ? ` (${input.clock.browserTimezone})` : ""} for event timing.`,
    `Filtering cutoff: ${input.clock.filteringCutoff}. Events that ended at or before this cutoff must be excluded.`,
    `Normalized search window label: ${input.timeWindow.label}.`,
    `Search window start: ${input.timeWindow.startTime}.`,
    `Search window end: ${input.timeWindow.endTime}.`,
    `Search window timezone: ${input.timeWindow.timezone}.`,
    `Calendar window in plain English: ${input.timeWindow.label} from ${input.timeWindow.startTime} to ${input.timeWindow.endTime} (${input.timeWindow.timezone}).`,
    `Date/time expressions have already been normalized before this request. Do not reinterpret temporal words from the user wording.`,
    `Event intent after date normalization: "${input.queryText}".`,
    input.resultMode === "complete"
      ? "The traveler explicitly requested a complete list. Return every verified matching event, not a curated subset."
      : "Return a focused set of the strongest verified matches.",
    filterDescription ? `Explicit event constraints: ${filterDescription}.` : "No explicit category, audience, or area constraint was provided.",
    input.originalText ? `Original user wording, secondary context only: "${input.originalText}".` : "",
    `Use only these trusted local Instagram/event sources for verification: ${(input.sourceConstraints?.length ? input.sourceConstraints : TRUSTED_EVENT_SOURCES).join(", ")}.`,
    filterDescription
      ? `Find only Koh Phangan events matching ${filterDescription} inside the search window. Do not include unrelated categories as extra options.`
      : "Find Koh Phangan events, parties, music, ecstatic dance, yoga, workshops, live music, jungle parties, beach events, and community gatherings happening inside the search window only.",
    "Do not include events from previous calendar dates or events that already ended before the current local time.",
    "Do not include events after the search window, even if they are the next known events.",
    "Only call an event verified when the event name, venue, and time are supported by one of the trusted sources above.",
    "Never include confidence labels, confidence scores, source reliability ratings, or other internal evaluation terminology in the traveler-facing answer.",
    "Do not infer events from generic listing pages, old festival pages, recurring party names, or non-current posts.",
    `If no trusted-source event is found inside the search window, say exactly: ${NO_TRUSTED_EVENT_FOUND}.`,
    "Keep the answer short. Do not cite source numbers.",
  ].filter(Boolean).join(" ");
}

function buildDiagnostics(
  input: EventSearchRequest,
  sourceResults: SourceResult[],
  mergedCandidates: MergedEvent[],
  selectedEvents: MergedEvent[],
  duplicatesRemoved: number,
  categoriesReturned: string[],
  searchMode: "broad" | "filtered",
  filterDecisions: EventFilterDecision[],
): NonNullable<LiveEventSearchResult["diagnostics"]> {
  const failed = sourceResults
    .filter(result => result.status === "failed")
    .map(result => ({ source: result.source.name, reason: result.reason ?? "Source failed" }));
  const successful = sourceResults.filter(result => result.status === "success");
  const warnings = sourceResults
    .filter(result => result.warning)
    .map(result => ({ source: result.source.name, warning: result.warning! }));

  return {
    destination: input.clock.destination,
    destinationTimezone: input.clock.timezone,
    destinationCurrentTime: input.clock.destinationCurrentTime,
    browserTimezone: input.clock.browserTimezone,
    filteringCutoff: input.clock.filteringCutoff,
    resolvedLocalDate: localDateKey(new Date(input.timeWindow.startTime)),
    resolvedTonightWindow: input.timeWindow.granularity === "night"
      ? {
          startTime: input.timeWindow.startTime,
          endTime: input.timeWindow.endTime,
          timezone: input.timeWindow.timezone,
        }
      : undefined,
    requestMode: "information",
    searchMode,
    resultMode: input.resultMode,
    sourcesAttempted: sourceResults.map(result => result.source.name),
    sourcesSuccessful: successful.map(result => result.source.name),
    sourcesFailed: failed,
    sourceWarnings: warnings,
    rawResultCountBySource: Object.fromEntries(sourceResults.map(result => [result.source.name, result.events.length])),
    mergedResultCount: mergedCandidates.length,
    duplicatesRemoved,
    categoriesReturned,
    appliedFilters: input.filters,
    filteredOutCount: mergedCandidates.length - selectedEvents.length,
    filterDecisions,
    resultState: selectedEvents.length > 0
      ? failed.length > 0 ? "incomplete_search" : "verified_results"
      : failed.length > 0 ? "source_failure" : "confirmed_no_results",
  };
}

export async function searchLiveEvents(input: EventSearchRequest, apiKey?: string): Promise<LiveEventSearchResult> {
  const searchMode = isBroadEventRequest(input) ? "broad" : "filtered";
  const sourceResults = await collectApprovedEvents(input);
  const { events: mergedEvents, duplicatesRemoved } = mergeEvents(sourceResults);
  const constrained = applyEventConstraints(mergedEvents, input);
  const events = constrained.events;
  const incomplete = sourceResults.some(result => result.status === "failed");
  const formatted = events.length > 0
    ? searchMode === "filtered"
      ? formatFilteredEventLandscape(events, input, incomplete, constrained.secondaryCandidateCount)
      : formatMergedEventLandscape(events, input, incomplete)
    : undefined;
  const diagnostics = buildDiagnostics(
    input,
    sourceResults,
    mergedEvents,
    events,
    duplicatesRemoved,
    formatted?.categories ?? [],
    searchMode,
    constrained.decisions,
  );

  if (formatted) {
    return {
      response: formatted.response,
      fallback: false,
      sources: Array.from(new Set(events.flatMap(event => event.sourceLinks))),
      queryUsed: `approved source aggregation for ${input.timeWindow.label}`,
      timeWindow: input.timeWindow,
      rawResponse: { sourceResults, mergedEvents, filteredEvents: events },
      diagnostics,
    };
  }

  const queryUsed = buildEventSearchQuery(input);
  if (!apiKey) {
    return {
      response: null,
      fallback: true,
      sources: sourceResults.map(result => result.source.url),
      queryUsed,
      timeWindow: input.timeWindow,
      fallbackMessage: buildEventFallbackMessage(input.timeWindow, input.filters),
      rejectedCandidates: sourceResults
        .filter(result => result.status === "failed")
        .map(result => ({ text: result.source.name, reason: result.reason ?? "Source failed" })),
      diagnostics,
    };
  }

  const exaRes = await fetch("https://api.exa.ai/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: queryUsed,
      text: true,
    }),
  });

  const rawResponse = await exaRes.json() as {
    answer?: string;
    citations?: Array<{ url: string; title?: string }>;
  };
  const sources = rawResponse.citations?.map(c => c.url) ?? [];

  if (!exaRes.ok) {
    return {
      response: null,
      fallback: true,
      sources,
      queryUsed,
      timeWindow: input.timeWindow,
      fallbackMessage: buildEventFallbackMessage(input.timeWindow, input.filters),
      rawResponse,
      httpStatus: exaRes.status,
      diagnostics,
    };
  }

  const answer = cleanEventAnswer(rawResponse.answer?.trim() ?? null);
  const validated = validateEventAnswerConstraints(answer, input);
  if (isNoVerifiedEventAnswer(validated.answer)) {
    return {
      response: null,
      fallback: true,
      sources,
      queryUsed,
      timeWindow: input.timeWindow,
      fallbackMessage: buildEventFallbackMessage(input.timeWindow, input.filters),
      rejectedCandidates: validated.rejectedCandidates,
      rawResponse,
      httpStatus: exaRes.status,
      diagnostics: {
        ...diagnostics,
        filterDecisions: [...(diagnostics.filterDecisions ?? []), ...validated.decisions],
      },
    };
  }

  return {
    response: validated.answer,
    fallback: false,
    sources,
    queryUsed,
    timeWindow: input.timeWindow,
    rejectedCandidates: validated.rejectedCandidates,
    rawResponse,
    httpStatus: exaRes.status,
    diagnostics: {
      ...diagnostics,
      resultState: "verified_results",
      sourcesSuccessful: Array.from(new Set([...(diagnostics.sourcesSuccessful ?? []), "Exa Answer API"])),
      filterDecisions: [...(diagnostics.filterDecisions ?? []), ...validated.decisions],
    },
  };
}
