import { resolveEventSearchFilters, type EventSearchFilters } from "./event-filters.js";

export const KOH_PHANGAN_TIME_ZONE = "Asia/Bangkok";

export type TimeWindowGranularity =
  | "day"
  | "night"
  | "weekend"
  | "specific_date"
  | "date_range";

export interface TimeWindow {
  label: string;
  startTime: string;
  endTime: string;
  timezone: typeof KOH_PHANGAN_TIME_ZONE;
  granularity: TimeWindowGranularity;
  sourceExpression: string;
  confidence: number;
  clarificationNeeded: boolean;
}

export type NormalizedEventTimeWindow = TimeWindow;

export interface TimeResolverInput {
  text: string;
  now: string | Date;
  timezone: typeof KOH_PHANGAN_TIME_ZONE;
  previousWindow?: TimeWindow;
  context?: {
    lastTopic?: string;
    lastEventWindow?: TimeWindow;
  };
}

export interface DestinationClockSnapshot {
  destination: "Koh Phangan";
  timezone: typeof KOH_PHANGAN_TIME_ZONE;
  destinationCurrentTime: string;
  browserTimezone?: string;
  filteringCutoff: string;
}

export interface EventSearchRequest {
  queryText: string;
  timeWindow: TimeWindow;
  clock: DestinationClockSnapshot;
  filters?: EventSearchFilters;
  userContext?: unknown;
  sourceConstraints?: string[];
  originalText?: string;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalIso(year: number, month: number, day: number, hour: number, minute: number, second = 0): string {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+07:00`;
}

function localDateFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getLocalParts(date: Date): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
    weekday: "long",
    timeZone: KOH_PHANGAN_TIME_ZONE,
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAYS.indexOf(get("weekday").toLowerCase()),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

export function formatDestinationCurrentTime(now: Date): string {
  const parts = getLocalParts(now);
  return formatLocalIso(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
}

export function resolveEventFilteringCutoff(window: TimeWindow, now: Date): string {
  const windowStart = new Date(window.startTime).getTime();
  return now.getTime() <= windowStart ? window.startTime : formatDestinationCurrentTime(now);
}

export function hasExplicitEventTimeExpression(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[’']/g, "");
  return /\b(todays?|tonight|later tonight|tomorrows?|this (?:morning|afternoon|evening|weekend)|next weekend|right now|now)\b/.test(normalized)
    || /\b(?:this|next)?\s*(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(normalized)
    || /\b20\d{2}-\d{1,2}-\d{1,2}\b/.test(normalized)
    || /\b\d{1,2}[/.]\d{1,2}(?:[/.]20\d{2})?\b/.test(normalized)
    || /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/.test(normalized);
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  return getLocalParts(new Date(localDateFromParts(parts.year, parts.month, parts.day).getTime() + days * 24 * 60 * 60 * 1000));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

function createWindow(input: {
  label: string;
  start: LocalDateParts;
  end: LocalDateParts;
  startClock: [number, number, number];
  endClock: [number, number, number];
  granularity: TimeWindowGranularity;
  sourceExpression: string;
  confidence?: number;
  clarificationNeeded?: boolean;
}): TimeWindow {
  return {
    label: input.label,
    startTime: formatLocalIso(input.start.year, input.start.month, input.start.day, ...input.startClock),
    endTime: formatLocalIso(input.end.year, input.end.month, input.end.day, ...input.endClock),
    timezone: KOH_PHANGAN_TIME_ZONE,
    granularity: input.granularity,
    sourceExpression: input.sourceExpression,
    confidence: input.confidence ?? 1,
    clarificationNeeded: input.clarificationNeeded ?? false,
  };
}

function fullDay(label: string, parts: LocalDateParts, sourceExpression: string, granularity: TimeWindowGranularity = "day"): TimeWindow {
  return createWindow({
    label,
    start: parts,
    end: parts,
    startClock: [0, 0, 0],
    endClock: [23, 59, 59],
    granularity,
    sourceExpression,
  });
}

function partialDay(
  label: string,
  parts: LocalDateParts,
  sourceExpression: string,
  startClock: [number, number, number],
  endClock: [number, number, number],
): TimeWindow {
  return createWindow({
    label,
    start: parts,
    end: parts,
    startClock,
    endClock,
    granularity: "day",
    sourceExpression,
  });
}

function nightWindow(label: string, parts: LocalDateParts, sourceExpression: string): TimeWindow {
  const next = addLocalDays(parts, 1);
  return createWindow({
    label,
    start: parts,
    end: next,
    startClock: [18, 0, 0],
    endClock: [6, 0, 0],
    granularity: "night",
    sourceExpression,
  });
}

function laterTonightWindow(today: LocalDateParts, sourceExpression: string): TimeWindow {
  const next = addLocalDays(today, 1);
  return createWindow({
    label: "Later Tonight",
    start: today,
    end: next,
    startClock: [today.hour, today.minute, today.second],
    endClock: [6, 0, 0],
    granularity: "night",
    sourceExpression,
  });
}

function weekendWindow(label: string, friday: LocalDateParts, sourceExpression: string): TimeWindow {
  const monday = addLocalDays(friday, 3);
  return createWindow({
    label,
    start: friday,
    end: monday,
    startClock: [18, 0, 0],
    endClock: [6, 0, 0],
    granularity: "weekend",
    sourceExpression,
  });
}

function rangeWindow(label: string, start: LocalDateParts, end: LocalDateParts, sourceExpression: string): TimeWindow {
  return createWindow({
    label,
    start,
    end,
    startClock: [0, 0, 0],
    endClock: [23, 59, 59],
    granularity: "date_range",
    sourceExpression,
  });
}

function daysUntil(currentWeekday: number, targetWeekday: number): number {
  return (targetWeekday - currentWeekday + 7) % 7;
}

function resolveYearForMonthDay(month: number, day: number, today: LocalDateParts): number {
  if (month < today.month || (month === today.month && day < today.day)) return today.year + 1;
  return today.year;
}

function parseSpecificDate(query: string, today: LocalDateParts): { parts: LocalDateParts; label: string; night: boolean; expression: string } | null {
  const normalized = query.toLowerCase().replace(/[’']/g, "");
  const night = /\b(night|tonight|gece|gecesi|akşam|aksam)\b/.test(normalized);

  const iso = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const parts = getLocalParts(localDateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3])));
    return { parts, label: iso[0], night, expression: iso[0] };
  }

  const numeric = normalized.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d{2}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = numeric[3] ? Number(numeric[3]) : resolveYearForMonthDay(month, day, today);
    const parts = getLocalParts(localDateFromParts(year, month, day));
    return { parts, label: `${year}-${pad(month)}-${pad(day)}`, night, expression: numeric[0] };
  }

  const monthName = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/);
  if (monthName) {
    const month = MONTHS[monthName[1]!];
    const day = Number(monthName[2]);
    const year = monthName[3] ? Number(monthName[3]) : resolveYearForMonthDay(month, day, today);
    const parts = getLocalParts(localDateFromParts(year, month, day));
    return { parts, label: `${titleCase(monthName[1]!)} ${day}${monthName[3] ? `, ${year}` : ""}`, night, expression: monthName[0] };
  }

  const dayMonthName = normalized.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/);
  if (dayMonthName) {
    const day = Number(dayMonthName[1]);
    const month = MONTHS[dayMonthName[2]!];
    const year = dayMonthName[3] ? Number(dayMonthName[3]) : resolveYearForMonthDay(month, day, today);
    const parts = getLocalParts(localDateFromParts(year, month, day));
    return { parts, label: `${titleCase(dayMonthName[2]!)} ${day}${dayMonthName[3] ? `, ${year}` : ""}`, night, expression: dayMonthName[0] };
  }

  const dayOfMonth = normalized.match(/\b([1-2]?\d|3[01])\s*(i|ı|si|sı|inci|uncu|üncü|nci)?\b(?=.*\b(night|gece|gecesi|event|events|party|parties|parti|etkinlik|music|muzik|müzik)\b)/);
  if (dayOfMonth) {
    const day = Number(dayOfMonth[1]);
    const targetMonth = day < today.day ? today.month + 1 : today.month;
    const parts = getLocalParts(localDateFromParts(today.year, targetMonth, day));
    return { parts, label: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`, night, expression: dayOfMonth[0] };
  }

  return null;
}

function parseDateRange(text: string, today: LocalDateParts): { start: LocalDateParts; end: LocalDateParts; label: string; expression: string } | null {
  const normalized = text.toLowerCase().replace(/[’']/g, "");
  const monthRange = normalized.match(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*20\d{2})?)\s+(?:to|through|-)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*20\d{2})?|\d{1,2})\b/);
  if (monthRange) {
    const startDate = parseSpecificDate(monthRange[1]!, today);
    const endText = /^\d{1,2}$/.test(monthRange[2]!)
      ? `${monthRange[1]!.split(/\s+/)[0]} ${monthRange[2]!}`
      : monthRange[2]!;
    const endDate = parseSpecificDate(endText, today);
    if (startDate && endDate) {
      return { start: startDate.parts, end: endDate.parts, label: `${startDate.label} to ${endDate.label}`, expression: monthRange[0] };
    }
  }

  const weekdayRange = normalized.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:to|through|-)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayRange) {
    const startWeekday = WEEKDAYS.indexOf(weekdayRange[1]!);
    const endWeekday = WEEKDAYS.indexOf(weekdayRange[2]!);
    const start = addLocalDays(today, daysUntil(today.weekday, startWeekday));
    let end = addLocalDays(today, daysUntil(today.weekday, endWeekday));
    if (localDateFromParts(end.year, end.month, end.day).getTime() < localDateFromParts(start.year, start.month, start.day).getTime()) {
      end = addLocalDays(end, 7);
    }
    return { start, end, label: `${titleCase(weekdayRange[1]!)} to ${titleCase(weekdayRange[2]!)}`, expression: weekdayRange[0] };
  }

  return null;
}

function thisWeekendFriday(today: LocalDateParts): LocalDateParts {
  if (today.weekday === 6) return addLocalDays(today, -1);
  if (today.weekday === 0) return addLocalDays(today, -2);
  return addLocalDays(today, daysUntil(today.weekday, 5));
}

export function resolveTimeExpression(input: TimeResolverInput): TimeWindow {
  const normalized = input.text.toLowerCase().replace(/[’']/g, "");
  const now = typeof input.now === "string" ? new Date(input.now) : input.now;
  const today = getLocalParts(now);
  const tomorrow = addLocalDays(today, 1);
  const range = parseDateRange(normalized, today);
  const specificDate = parseSpecificDate(normalized, today);

  if (range) return rangeWindow(range.label, range.start, range.end, range.expression);
  if (specificDate) return specificDate.night ? nightWindow(specificDate.label, specificDate.parts, specificDate.expression) : fullDay(specificDate.label, specificDate.parts, specificDate.expression, "specific_date");
  if (/\bnow\b/.test(normalized)) return laterTonightWindow(today, "now");
  if (/\btomorrow\s+morning\b/.test(normalized)) return partialDay("Tomorrow Morning", tomorrow, "tomorrow morning", [6, 0, 0], [12, 0, 0]);
  if (/\btomorrow\s+afternoon\b/.test(normalized)) return partialDay("Tomorrow Afternoon", tomorrow, "tomorrow afternoon", [12, 0, 0], [17, 0, 0]);
  if (/\btomorrow\s+(evening)\b/.test(normalized)) return partialDay("Tomorrow Evening", tomorrow, "tomorrow evening", [17, 0, 0], [22, 0, 0]);
  if (/\btomorrow\s+night\b/.test(normalized)) return nightWindow("Tomorrow Night", tomorrow, "tomorrow night");
  if (/\btomorrows?\b/.test(normalized)) return fullDay("Tomorrow", tomorrow, "tomorrow");
  if (/\blater\s+tonight\b/.test(normalized)) return laterTonightWindow(today, "later tonight");
  if (/\btonight\b/.test(normalized)) return nightWindow("Tonight", today, "tonight");
  if (/\bthis\s+morning\b/.test(normalized)) return partialDay("This Morning", today, "this morning", [6, 0, 0], [12, 0, 0]);
  if (/\bthis\s+afternoon\b/.test(normalized)) return partialDay("This Afternoon", today, "this afternoon", [12, 0, 0], [17, 0, 0]);
  if (/\bthis\s+evening\b/.test(normalized)) return partialDay("This Evening", today, "this evening", [17, 0, 0], [22, 0, 0]);
  if (/\btodays?\b/.test(normalized)) return fullDay("Today", today, "today");

  const weekdayMatch = normalized.match(/\b(this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const modifier = weekdayMatch[1];
    const weekdayName = weekdayMatch[2]!;
    const targetWeekday = WEEKDAYS.indexOf(weekdayName);
    const offset = daysUntil(today.weekday, targetWeekday) + (modifier === "next" ? 7 : 0);
    const expression = `${modifier ? `${modifier} ` : ""}${weekdayName}`;
    return fullDay(`${modifier === "next" ? "Next " : modifier === "this" ? "This " : ""}${titleCase(weekdayName)}`, addLocalDays(today, offset), expression);
  }

  if (/\bnext\s+weekend\b/.test(normalized)) return weekendWindow("Next Weekend", addLocalDays(today, daysUntil(today.weekday, 5) + 7), "next weekend");
  if (/\b(this\s+)?weekend\b/.test(normalized)) return weekendWindow("This Weekend", thisWeekendFriday(today), "this weekend");
  return nightWindow("Tonight", today, "implicit tonight");
}

export function resolveEventTimeWindow(query: string, now: Date = new Date()): NormalizedEventTimeWindow {
  return resolveTimeExpression({
    text: query,
    now,
    timezone: KOH_PHANGAN_TIME_ZONE,
  });
}

export function stripNaturalLanguageDate(query: string): string {
  return query
    .replace(/\b(later\s+tonight|tonight|todays?|tomorrow\s+night|tomorrows?|this\s+weekend|next\s+weekend|weekend)\b/gi, "")
    .replace(/\b(this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, "")
    .replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]20\d{2})?\b/g, "")
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*20\d{2})?\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,])/g, "$1")
    .trim();
}

export function createEventSearchRequest(
  query: string,
  now: Date = new Date(),
  metadata: { browserTimezone?: string } = {},
): EventSearchRequest {
  const timeWindow = resolveEventTimeWindow(query, now);
  return {
    queryText: stripNaturalLanguageDate(query) || "Koh Phangan events",
    timeWindow,
    clock: {
      destination: "Koh Phangan",
      timezone: KOH_PHANGAN_TIME_ZONE,
      destinationCurrentTime: formatDestinationCurrentTime(now),
      browserTimezone: metadata.browserTimezone,
      filteringCutoff: resolveEventFilteringCutoff(timeWindow, now),
    },
    filters: resolveEventSearchFilters(query),
    originalText: query,
  };
}
