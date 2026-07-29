import type { NormalizedEventTimeWindow } from "./time-resolver";

export const TODO_TODAY_HOME_URL = "https://todo.today/koh-phangan/";
export const TODO_TODAY_DEFAULT_REST_URL = "https://todo.today/api/todo-today/v1/events";
export const TODO_TODAY_DEFAULT_RELAY_PREFIX = "https://r.jina.ai/http://";

export interface TodoTodaySourceEvent {
  title: string;
  category: string;
  venue: string;
  startTime: string;
  endTime: string;
  price?: string;
  sourceUrl: string;
  googleMapsUrl?: string;
  sourceCategoryId?: string;
}

export interface TodoTodayFeedConfig {
  homeUrl: string;
  restUrl: string;
  restNonce: string;
  channel: string;
}

export interface TodoTodayFetchResult {
  events: TodoTodaySourceEvent[];
  feedUrl: string;
  targetDates: string[];
  transport: "direct" | "relay";
  warning?: string;
}

interface TodoTodayRawEvent {
  id?: string | number;
  name?: string;
  short_name?: string;
  link?: string;
  start_time?: string;
  end_time?: string;
  duration?: string;
  venue?: string;
  area?: string;
  category_id?: string | number;
  price_label?: string;
  join_label?: string;
  google_map?: string;
}

interface TodoTodayFeedPayload {
  filters?: {
    categories?: Array<{
      id?: string | number;
      name?: string;
      short_name?: string;
    }>;
  };
  sections?: Array<{
    events?: TodoTodayRawEvent[];
  }>;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

function attributeValue(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}=(['\"])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ? decodeHtmlAttribute(match[2]) : undefined;
}

export function parseTodoTodayFeedConfig(html: string, homeUrl = TODO_TODAY_HOME_URL): TodoTodayFeedConfig {
  if (/just a moment|cdn-cgi\/challenge-platform/i.test(html)) {
    throw new Error("Todo.Today blocked the server request with a Cloudflare browser challenge");
  }

  const appTag = html.match(/<[^>]*\bid=(['"])tt-app\1[^>]*>/i)?.[0];
  const configuredRestUrl = process.env.TODO_TODAY_REST_URL;
  const configuredNonce = process.env.TODO_TODAY_REST_NONCE;
  if (!appTag && !(configuredRestUrl && configuredNonce)) {
    throw new Error("Todo.Today feed configuration was not present in the live page");
  }

  return {
    homeUrl,
    restUrl: configuredRestUrl ?? attributeValue(appTag ?? "", "data-rest-url") ?? TODO_TODAY_DEFAULT_REST_URL,
    restNonce: configuredNonce ?? attributeValue(appTag ?? "", "data-rest-nonce") ?? "",
    channel: process.env.TODO_TODAY_CHANNEL ?? attributeValue(appTag ?? "", "data-channel") ?? "koh-phangan",
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyFromIso(value: string): string {
  return value.slice(0, 10);
}

function addDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function todoTodayDateKeys(window: NormalizedEventTimeWindow): string[] {
  const start = dateKeyFromIso(window.startTime);
  const end = dateKeyFromIso(window.endTime);
  const dates = [start];
  while (dates.at(-1) !== end && dates.length < 15) dates.push(addDate(dates.at(-1)!, 1));
  return dates;
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (match[3]!.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[3]!.toUpperCase() === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

function formatBangkokIso(dateKey: string, clock: { hour: number; minute: number }): string {
  return `${dateKey}T${pad(clock.hour)}:${pad(clock.minute)}:00+07:00`;
}

function eventDateKey(event: TodoTodayRawEvent, fallbackDate: string): string {
  const match = event.link?.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : fallbackDate;
}

function parseDurationMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hours = Number(value.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)m/)?.[1] ?? 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : undefined;
}

function endTimeForEvent(event: TodoTodayRawEvent, dateKey: string, startTime: string): string {
  const endClock = event.end_time ? parseClock(event.end_time) : null;
  if (endClock) {
    const sameDay = formatBangkokIso(dateKey, endClock);
    return new Date(sameDay).getTime() > new Date(startTime).getTime()
      ? sameDay
      : formatBangkokIso(addDate(dateKey, 1), endClock);
  }

  const durationMinutes = parseDurationMinutes(event.duration) ?? 120;
  return new Date(new Date(startTime).getTime() + durationMinutes * 60_000).toISOString();
}

function joinedVenue(event: TodoTodayRawEvent): string {
  const venue = event.venue?.trim() ?? "";
  const area = event.area?.trim() ?? "";
  if (!venue) return area || "Koh Phangan";
  if (!area || venue.toLowerCase().includes(area.toLowerCase())) return venue;
  return `${venue}, ${area}`;
}

function joinedPrice(event: TodoTodayRawEvent): string | undefined {
  const parts = [event.price_label, event.join_label].map(value => value?.trim()).filter(Boolean) as string[];
  return Array.from(new Set(parts)).join(" · ") || undefined;
}

export function parseTodoTodayFeed(payload: unknown, targetDate: string): TodoTodaySourceEvent[] {
  if (!payload || typeof payload !== "object") throw new Error("Todo.Today returned an invalid event feed");
  const feed = payload as TodoTodayFeedPayload;
  const categories = new Map(
    (feed.filters?.categories ?? []).map(category => [
      String(category.id ?? ""),
      category.short_name?.trim() || category.name?.trim() || "Todo.Today",
    ]),
  );
  const rawEvents = (feed.sections ?? []).flatMap(section => Array.isArray(section.events) ? section.events : []);
  const uniqueEvents = new Map<string, TodoTodayRawEvent>();
  for (const event of rawEvents) {
    const key = String(event.id ?? event.link ?? `${event.name}|${event.start_time}|${event.venue}`);
    if (!uniqueEvents.has(key)) uniqueEvents.set(key, event);
  }

  const parsed: TodoTodaySourceEvent[] = [];
  for (const event of uniqueEvents.values()) {
    const title = event.short_name?.trim() || event.name?.trim();
    const startClock = event.start_time ? parseClock(event.start_time) : null;
    if (!title || !startClock) continue;
    const dateKey = eventDateKey(event, targetDate);
    const startTime = formatBangkokIso(dateKey, startClock);
    parsed.push({
      title,
      category: categories.get(String(event.category_id ?? "")) ?? "Todo.Today",
      venue: joinedVenue(event),
      startTime,
      endTime: endTimeForEvent(event, dateKey, startTime),
      price: joinedPrice(event),
      sourceUrl: event.link?.trim() || TODO_TODAY_HOME_URL,
      googleMapsUrl: event.google_map?.trim() || undefined,
      sourceCategoryId: event.category_id === undefined ? undefined : String(event.category_id),
    });
  }
  return parsed;
}

async function fetchText(url: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    if (/just a moment|cdn-cgi\/challenge-platform/i.test(text)) {
      throw new Error("Todo.Today blocked the server request with a Cloudflare browser challenge");
    }
    throw new Error(`Todo.Today returned HTTP ${response.status}`);
  }
  return text;
}

function parseFeedJson(body: string): unknown {
  const marker = "Markdown Content:";
  const marked = body.includes(marker) ? body.slice(body.indexOf(marker) + marker.length).trim() : body.trim();
  const candidate = marked.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("Todo.Today returned a non-JSON event feed");
  }
}

function todoTodayFeedUrl(restUrl: string, channel: string, targetDate: string): URL {
  const feedUrl = new URL(restUrl);
  feedUrl.searchParams.set("channel", channel);
  feedUrl.searchParams.set("event_date", targetDate);
  return feedUrl;
}

async function fetchDirectTodoTodayEvents(
  window: NormalizedEventTimeWindow,
  fetchImpl: typeof fetch,
): Promise<TodoTodayFetchResult> {
  const requestHeaders = {
    "User-Agent": "SIT Local Intelligence event verifier",
    "Accept": "text/html,application/xhtml+xml",
  };
  const homeHtml = await fetchText(TODO_TODAY_HOME_URL, requestHeaders, fetchImpl);
  const config = parseTodoTodayFeedConfig(homeHtml);
  const targetDates = todoTodayDateKeys(window);
  const events: TodoTodaySourceEvent[] = [];

  for (const targetDate of targetDates) {
    const feedUrl = todoTodayFeedUrl(config.restUrl, config.channel, targetDate);
    const body = await fetchText(feedUrl.toString(), {
      "User-Agent": requestHeaders["User-Agent"],
      "Accept": "application/json",
      "Referer": config.homeUrl,
      ...(config.restNonce ? { "X-WP-Nonce": config.restNonce } : {}),
    }, fetchImpl);
    events.push(...parseTodoTodayFeed(parseFeedJson(body), targetDate));
  }

  const unique = new Map(events.map(event => [`${event.title}|${event.venue}|${event.startTime}`, event]));
  return {
    events: [...unique.values()],
    feedUrl: config.restUrl,
    targetDates,
    transport: "direct",
  };
}

async function fetchRelayedTodoTodayEvents(
  window: NormalizedEventTimeWindow,
  fetchImpl: typeof fetch,
  directFailure: string,
): Promise<TodoTodayFetchResult> {
  const targetDates = todoTodayDateKeys(window);
  const events: TodoTodaySourceEvent[] = [];
  const configuredRestUrl = process.env.TODO_TODAY_REST_URL ?? TODO_TODAY_DEFAULT_REST_URL;
  const relayPrefix = process.env.TODO_TODAY_RELAY_PREFIX ?? TODO_TODAY_DEFAULT_RELAY_PREFIX;

  for (const targetDate of targetDates) {
    const feedUrl = todoTodayFeedUrl(configuredRestUrl, process.env.TODO_TODAY_CHANNEL ?? "koh-phangan", targetDate);
    const relayTarget = `${relayPrefix}${feedUrl.host}${feedUrl.pathname}${feedUrl.search}`;
    const body = await fetchText(relayTarget, {
      "User-Agent": "SIT Local Intelligence event verifier",
      "Accept": "text/plain,application/json",
      "X-No-Cache": "true",
    }, fetchImpl);
    events.push(...parseTodoTodayFeed(parseFeedJson(body), targetDate));
  }

  const unique = new Map(events.map(event => [`${event.title}|${event.venue}|${event.startTime}`, event]));
  return {
    events: [...unique.values()],
    feedUrl: configuredRestUrl,
    targetDates,
    transport: "relay",
    warning: `Direct Todo.Today access failed (${directFailure}); the public read-only relay was used.`,
  };
}

export async function fetchTodoTodayEvents(
  window: NormalizedEventTimeWindow,
  fetchImpl: typeof fetch = fetch,
): Promise<TodoTodayFetchResult> {
  try {
    return await fetchDirectTodoTodayEvents(window, fetchImpl);
  } catch (error) {
    const directFailure = error instanceof Error ? error.message : "unknown direct-source error";
    if (process.env.TODO_TODAY_RELAY_DISABLED === "true") throw error;
    try {
      return await fetchRelayedTodoTodayEvents(window, fetchImpl, directFailure);
    } catch (relayError) {
      const relayFailure = relayError instanceof Error ? relayError.message : "unknown relay error";
      throw new Error(`${directFailure}; Todo.Today relay also failed (${relayFailure})`);
    }
  }
}
