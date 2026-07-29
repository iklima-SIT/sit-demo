import assert from "node:assert/strict";
import test from "node:test";
import { resolveEventTimeWindow } from "./time-resolver";
import {
  TODO_TODAY_HOME_URL,
  fetchTodoTodayEvents,
  parseTodoTodayFeed,
  parseTodoTodayFeedConfig,
  todoTodayDateKeys,
} from "./todo-today-source";

const feedConfigHtml = `
  <main>
    <section
      data-channel="koh-phangan"
      data-rest-url="https://todo.today/api/todo-today/v1/events"
      data-rest-nonce="test-nonce"
      id="tt-app"
    ></section>
  </main>
`;

function feedPayload() {
  const yoga = {
    id: 101,
    short_name: "Chakra Yoga w/ Salome",
    link: "https://todo.today/koh-phangan/2026/07/29/chakra-yoga",
    start_time: "4:30 PM",
    end_time: "6:00 PM",
    venue: "Samma Karuna",
    area: "Sri Thanu",
    category_id: 1,
    price_label: "฿450",
    join_label: "Drop-in",
    google_map: "https://maps.example/chakra-yoga",
  };
  return {
    filters: {
      categories: [
        { id: 1, name: "Wellness", short_name: "Wellness" },
        { id: 17, name: "Parties & Nightlife", short_name: "Parties & Nightlife" },
      ],
    },
    sections: [
      { key: "today_highlight", events: [yoga] },
      {
        key: "daypart",
        events: [
          yoga,
          {
            id: 102,
            short_name: "Full Moon Sound Bath",
            link: "https://todo.today/koh-phangan/2026/07/29/full-moon-sound-bath",
            start_time: "5:00 PM",
            end_time: "5:45 PM",
            venue: "Sabai Yin Yogashala",
            category_id: 1,
            price_label: "฿400",
          },
        ],
      },
    ],
  };
}

test("Todo.Today page configuration exposes the canonical live feed", () => {
  const config = parseTodoTodayFeedConfig(feedConfigHtml);

  assert.equal(config.homeUrl, TODO_TODAY_HOME_URL);
  assert.equal(config.restUrl, "https://todo.today/api/todo-today/v1/events");
  assert.equal(config.restNonce, "test-nonce");
  assert.equal(config.channel, "koh-phangan");
});

test("Todo.Today feed parser normalizes and deduplicates structured events", () => {
  const events = parseTodoTodayFeed(feedPayload(), "2026-07-29");

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    title: "Chakra Yoga w/ Salome",
    category: "Wellness",
    venue: "Samma Karuna, Sri Thanu",
    startTime: "2026-07-29T16:30:00+07:00",
    endTime: "2026-07-29T18:00:00+07:00",
    price: "฿450 · Drop-in",
    sourceUrl: "https://todo.today/koh-phangan/2026/07/29/chakra-yoga",
    googleMapsUrl: "https://maps.example/chakra-yoga",
    sourceCategoryId: "1",
  });
  assert.equal(events[1]?.title, "Full Moon Sound Bath");
});

test("Todo.Today is fetched through its structured feed for every normalized date", async () => {
  const requestedUrls: string[] = [];
  const fetchImpl = (async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === TODO_TODAY_HOME_URL) return new Response(feedConfigHtml, { status: 200 });
    if (url.includes("/api/todo-today/v1/events")) {
      return Response.json(feedPayload(), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const window = resolveEventTimeWindow("tonight", new Date("2026-07-29T05:00:00.000Z"));

  const result = await fetchTodoTodayEvents(window, fetchImpl);

  assert.deepEqual(todoTodayDateKeys(window), ["2026-07-29", "2026-07-30"]);
  assert.equal(requestedUrls.filter(url => url.includes("/api/todo-today/v1/events")).length, 2);
  assert.ok(requestedUrls.some(url => url.includes("event_date=2026-07-29")));
  assert.ok(requestedUrls.some(url => url.includes("event_date=2026-07-30")));
  assert.equal(result.events.length, 2);
  assert.equal(result.transport, "direct");
});

test("Todo.Today uses the public read-only relay when direct access is challenged", async () => {
  const requestedUrls: string[] = [];
  const fetchImpl = (async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === TODO_TODAY_HOME_URL) {
      return new Response("<title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/test'></script>", { status: 403 });
    }
    if (url.startsWith("https://r.jina.ai/http://todo.today/api/todo-today/v1/events")) {
      return new Response(`Title:\n\nURL Source: ${url}\n\nMarkdown Content:\n${JSON.stringify(feedPayload())}`, { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const window = resolveEventTimeWindow("today", new Date("2026-07-29T05:00:00.000Z"));

  const result = await fetchTodoTodayEvents(window, fetchImpl);

  assert.equal(result.transport, "relay");
  assert.equal(result.events.length, 2);
  assert.match(result.warning ?? "", /Cloudflare browser challenge/);
  assert.ok(requestedUrls.some(url => url.startsWith("https://r.jina.ai/http://todo.today/api/")));
});

test("Todo.Today Cloudflare challenges are reported instead of being treated as an empty calendar", () => {
  assert.throws(
    () => parseTodoTodayFeedConfig("<title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/test'></script>"),
    /Cloudflare browser challenge/,
  );
});
