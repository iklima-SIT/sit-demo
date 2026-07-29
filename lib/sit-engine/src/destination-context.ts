import type {
  DestinationContextReference,
  DestinationContextResult,
  DestinationContextService,
  ConversationMemory,
} from "./types.js";
import { KOH_PHANGAN_TIME_ZONE } from "./time-resolver.js";

const DESTINATION = "Koh Phangan";

const ALCOHOL_RESTRICTION = {
  startTime: "2026-07-29T00:01:00+07:00",
  endTime: "2026-07-31T00:00:00+07:00",
  label: "Alcohol sales restricted until midnight Thursday, 30 July",
  exceptionsSummary: "Limited legal exceptions may apply to certain licensed hotels, airports, and designated venues.",
};

const SHARED_SOURCES = [
  {
    title: "Royal Thai Embassy 2026 holiday calendar",
    url: "https://image.mfa.go.th/mfa/0/xzhwNrdFsC/Holiday_2026/Holiday_2026.pdf",
    kind: "official" as const,
  },
  {
    title: "Thailand alcohol rules update",
    url: "https://www.tatnews.org/2026/05/alcohol-sales-and-consumption-rules-updated-in-thailand-what-tourists-need-to-know/",
    kind: "official" as const,
  },
  {
    title: "Royal Thai Police July 2026 alcohol-sales notice",
    url: "https://www.nationthailand.com/news/general/40069132",
    kind: "police_notice" as const,
  },
];

export const KOH_PHANGAN_DESTINATION_CALENDAR: DestinationContextReference[] = [
  {
    id: "th-2026-asalha-puja",
    destination: DESTINATION,
    timezone: KOH_PHANGAN_TIME_ZONE,
    localDate: "2026-07-29",
    name: "Asalha Puja Day (Asanha Bucha)",
    aliases: ["Asalha Puja", "Asanha Bucha", "Buddha Day"],
    type: "religious_holiday",
    alcoholRestriction: ALCOHOL_RESTRICTION,
    sources: SHARED_SOURCES,
    verifiedAt: "2026-07-29",
  },
  {
    id: "th-2026-buddhist-lent",
    destination: DESTINATION,
    timezone: KOH_PHANGAN_TIME_ZONE,
    localDate: "2026-07-30",
    name: "Buddhist Lent Day (Khao Phansa)",
    aliases: ["Buddhist Lent", "Khao Phansa", "Buddha Day"],
    type: "religious_holiday",
    alcoholRestriction: ALCOHOL_RESTRICTION,
    sources: SHARED_SOURCES,
    verifiedAt: "2026-07-29",
  },
];

function destinationDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOH_PHANGAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KOH_PHANGAN_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function destinationLocalTime(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KOH_PHANGAN_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
}

function targetsTomorrow(query: string): boolean {
  return /\btomorrow\b/i.test(query);
}

function findNamedHoliday(query: string): DestinationContextReference | undefined {
  const normalized = query.toLowerCase();
  return KOH_PHANGAN_DESTINATION_CALENDAR.find(record => {
    const canonicalName = record.name.toLowerCase().split(" (")[0];
    return Boolean(
      canonicalName
      && (normalized.includes(canonicalName)
        || record.aliases.some(alias => alias !== "Buddha Day" && normalized.includes(alias.toLowerCase()))),
    );
  });
}

function resolveTargetDate(query: string, now: Date, memory: ConversationMemory): { date: string; matchedFromMemory: boolean } {
  const today = destinationDate(now);
  const activeContextFollowUp = Boolean(memory.lastTopic === "destination_context" && memory.lastDestinationContext);
  if (targetsTomorrow(query)) return { date: addDays(today, 1), matchedFromMemory: activeContextFollowUp };

  const namedHoliday = findNamedHoliday(query);
  if (namedHoliday && !/\b(today|tonight|now)\b/i.test(query)) {
    return { date: namedHoliday.localDate, matchedFromMemory: false };
  }

  const matchedFromMemory = Boolean(
    activeContextFollowUp
    && /^(?:and\s+)?(?:is\s+it\s+)?(?:today|tomorrow|now)|until\s+when|what\s+about\s+tomorrow/i.test(query.trim()),
  );
  return { date: today, matchedFromMemory };
}

function formatHolidayAnswer(
  record: DestinationContextReference,
  targetDate: string,
  currentDate: string,
): string {
  const relative = targetDate === currentDate ? "Today" : targetDate === addDays(currentDate, 1) ? "Tomorrow" : displayDate(targetDate);
  const nextRecord = KOH_PHANGAN_DESTINATION_CALENDAR.find(candidate => candidate.localDate === addDays(targetDate, 1));
  const holidayLine = `${targetDate === currentDate ? "Yes. Today" : relative} in Koh Phangan, ${displayDate(targetDate)}, is ${record.name}.`;
  const nextLine = nextRecord && targetDate === currentDate
    ? `Tomorrow is ${nextRecord.name}.`
    : "";
  const restriction = record.alcoholRestriction
    ? `Alcohol sales are prohibited nationwide until midnight Thursday, 30 July. ${record.alcoholRestriction.exceptionsSummary} Check directly with the venue before relying on an exception.`
    : "";
  return [holidayLine, nextLine, restriction].filter(Boolean).join("\n\n");
}

export function createDestinationContextService(): DestinationContextService {
  return {
    async resolve(query, context): Promise<DestinationContextResult> {
      const currentDate = destinationDate(context.now);
      const target = resolveTargetDate(query, context.now, context.state.memory);
      const record = KOH_PHANGAN_DESTINATION_CALENDAR.find(candidate => candidate.localDate === target.date);

      if (!record) {
        return {
          answer: `I don't have a verified Buddhist-holiday record for ${displayDate(target.date)} in the current Koh Phangan calendar.`,
          destinationLocalTime: destinationLocalTime(context.now),
          matchedFromMemory: target.matchedFromMemory,
        };
      }

      return {
        answer: formatHolidayAnswer(record, target.date, currentDate),
        reference: record,
        destinationLocalTime: destinationLocalTime(context.now),
        matchedFromMemory: target.matchedFromMemory,
      };
    },
  };
}
