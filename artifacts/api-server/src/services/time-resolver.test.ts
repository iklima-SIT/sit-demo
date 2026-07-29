import assert from "node:assert/strict";
import test from "node:test";
import { buildEventSearchQuery, createLiveEventSearchInput, parsePhanganEventsCalendar, searchLiveEvents, validateEventAnswerWindow } from "./event-service";
import { resolveEventTimeWindow, resolveTimeExpression } from "./time-resolver";

const FIXED_NOW = new Date("2026-07-07T05:00:00.000Z"); // Tuesday, July 7 2026 at 12:00 in Koh Phangan.

function assertWindow(text: string, expected: { label: string; startTime: string; endTime: string; granularity?: string }, now = FIXED_NOW): void {
  const window = resolveEventTimeWindow(text, now);
  assert.equal(window.label, expected.label);
  assert.equal(window.startTime, expected.startTime);
  assert.equal(window.endTime, expected.endTime);
  assert.equal(window.timezone, "Asia/Bangkok");
  assert.equal(window.confidence, 1);
  assert.equal(window.clarificationNeeded, false);
  if (expected.granularity) assert.equal(window.granularity, expected.granularity);
}

test("TimeResolver normalizes today", () => {
  assertWindow("What is happening today?", {
    label: "Today",
    startTime: "2026-07-07T00:00:00+07:00",
    endTime: "2026-07-07T23:59:59+07:00",
    granularity: "day",
  });
});

test("destination clock ignores a Europe/Rome browser timezone", () => {
  const input = createLiveEventSearchInput("What's happening today?", FIXED_NOW, "Europe/Rome");

  assert.equal(input.clock.destination, "Koh Phangan");
  assert.equal(input.clock.timezone, "Asia/Bangkok");
  assert.equal(input.clock.destinationCurrentTime, "2026-07-07T12:00:00+07:00");
  assert.equal(input.clock.browserTimezone, "Europe/Rome");
  assert.equal(input.clock.filteringCutoff, "2026-07-07T12:00:00+07:00");
  assert.match(buildEventSearchQuery(input), /authoritative destination timezone is Asia\/Bangkok/);
});

test("destination clock ignores an America/New_York browser timezone", () => {
  const input = createLiveEventSearchInput("What's happening tonight?", FIXED_NOW, "America/New_York");

  assert.equal(input.clock.timezone, "Asia/Bangkok");
  assert.equal(input.clock.destinationCurrentTime, "2026-07-07T12:00:00+07:00");
  assert.equal(input.clock.browserTimezone, "America/New_York");
  assert.equal(input.clock.filteringCutoff, "2026-07-07T18:00:00+07:00");
  assert.equal(input.timeWindow.startTime, "2026-07-07T18:00:00+07:00");
});

test("TimeResolver normalizes tonight", () => {
  assertWindow("What's happening tonight?", {
    label: "Tonight",
    startTime: "2026-07-07T18:00:00+07:00",
    endTime: "2026-07-08T06:00:00+07:00",
    granularity: "night",
  });
});

test("TimeResolver normalizes later tonight from current local time", () => {
  assertWindow("later tonight", {
    label: "Later Tonight",
    startTime: "2026-07-07T12:00:00+07:00",
    endTime: "2026-07-08T06:00:00+07:00",
    granularity: "night",
  });
});

test("TimeResolver normalizes tomorrow", () => {
  assertWindow("What's happening tomorrow?", {
    label: "Tomorrow",
    startTime: "2026-07-08T00:00:00+07:00",
    endTime: "2026-07-08T23:59:59+07:00",
    granularity: "day",
  });
});

test("TimeResolver normalizes tomorrow parts of day", () => {
  assertWindow("tomorrow morning", {
    label: "Tomorrow Morning",
    startTime: "2026-07-08T06:00:00+07:00",
    endTime: "2026-07-08T12:00:00+07:00",
  });
  assertWindow("tomorrow afternoon", {
    label: "Tomorrow Afternoon",
    startTime: "2026-07-08T12:00:00+07:00",
    endTime: "2026-07-08T17:00:00+07:00",
  });
  assertWindow("tomorrow evening", {
    label: "Tomorrow Evening",
    startTime: "2026-07-08T17:00:00+07:00",
    endTime: "2026-07-08T22:00:00+07:00",
  });
});

test("TimeResolver normalizes tomorrow night", () => {
  assertWindow("Any parties tomorrow night?", {
    label: "Tomorrow Night",
    startTime: "2026-07-08T18:00:00+07:00",
    endTime: "2026-07-09T06:00:00+07:00",
    granularity: "night",
  });
});

test("TimeResolver normalizes this Wednesday and next Wednesday", () => {
  assertWindow("This Wednesday", {
    label: "This Wednesday",
    startTime: "2026-07-08T00:00:00+07:00",
    endTime: "2026-07-08T23:59:59+07:00",
  });
  assertWindow("Next Wednesday", {
    label: "Next Wednesday",
    startTime: "2026-07-15T00:00:00+07:00",
    endTime: "2026-07-15T23:59:59+07:00",
  });
});

test("TimeResolver normalizes bare weekday", () => {
  assertWindow("Friday music events", {
    label: "Friday",
    startTime: "2026-07-10T00:00:00+07:00",
    endTime: "2026-07-10T23:59:59+07:00",
  });
});

test("TimeResolver normalizes this weekend and next weekend", () => {
  assertWindow("this weekend", {
    label: "This Weekend",
    startTime: "2026-07-10T18:00:00+07:00",
    endTime: "2026-07-13T06:00:00+07:00",
    granularity: "weekend",
  });
  assertWindow("next weekend", {
    label: "Next Weekend",
    startTime: "2026-07-17T18:00:00+07:00",
    endTime: "2026-07-20T06:00:00+07:00",
    granularity: "weekend",
  });
});

test("TimeResolver normalizes specific calendar dates", () => {
  assertWindow("Events on 2026-07-25", {
    label: "2026-07-25",
    startTime: "2026-07-25T00:00:00+07:00",
    endTime: "2026-07-25T23:59:59+07:00",
    granularity: "specific_date",
  });
  assertWindow("18 July", {
    label: "July 18",
    startTime: "2026-07-18T00:00:00+07:00",
    endTime: "2026-07-18T23:59:59+07:00",
  });
  assertWindow("July 18, 2026", {
    label: "July 18, 2026",
    startTime: "2026-07-18T00:00:00+07:00",
    endTime: "2026-07-18T23:59:59+07:00",
  });
});

test("TimeResolver normalizes specific calendar date nights", () => {
  assertWindow("July 25 night parties", {
    label: "July 25",
    startTime: "2026-07-25T18:00:00+07:00",
    endTime: "2026-07-26T06:00:00+07:00",
    granularity: "night",
  });
});

test("TimeResolver normalizes date ranges", () => {
  assertWindow("July 18 to July 20", {
    label: "July 18 to July 20",
    startTime: "2026-07-18T00:00:00+07:00",
    endTime: "2026-07-20T23:59:59+07:00",
    granularity: "date_range",
  });
  assertWindow("Friday to Sunday", {
    label: "Friday to Sunday",
    startTime: "2026-07-10T00:00:00+07:00",
    endTime: "2026-07-12T23:59:59+07:00",
    granularity: "date_range",
  });
});

test("TimeResolver handles month and year boundaries", () => {
  assertWindow("February 1", {
    label: "February 1",
    startTime: "2026-02-01T00:00:00+07:00",
    endTime: "2026-02-01T23:59:59+07:00",
  }, new Date("2026-01-31T10:00:00.000Z"));

  assertWindow("January 2", {
    label: "January 2",
    startTime: "2027-01-02T00:00:00+07:00",
    endTime: "2027-01-02T23:59:59+07:00",
  }, new Date("2026-12-31T10:00:00.000Z"));
});

test("TimeResolver preserves event context while changing the time window", () => {
  const tonight = resolveTimeExpression({ text: "What is happening tonight?", now: FIXED_NOW, timezone: "Asia/Bangkok" });
  const tomorrow = resolveTimeExpression({
    text: "What about tomorrow?",
    now: FIXED_NOW,
    timezone: "Asia/Bangkok",
    previousWindow: tonight,
    context: { lastTopic: "events", lastEventWindow: tonight },
  });
  const wednesday = resolveTimeExpression({
    text: "This Wednesday?",
    now: FIXED_NOW,
    timezone: "Asia/Bangkok",
    previousWindow: tomorrow,
    context: { lastTopic: "events", lastEventWindow: tomorrow },
  });

  assert.equal(tonight.label, "Tonight");
  assert.equal(tomorrow.label, "Tomorrow");
  assert.equal(wednesday.label, "This Wednesday");
});

test("EventService sends normalized tomorrow window to Exa before request", async () => {
  const originalFetch = globalThis.fetch;
  let capturedQuery = "";
  globalThis.fetch = (async (url, init) => {
    if (String(url).includes("phangan.events")) {
      return new Response("<html>No matching events</html>", { status: 200 });
    }
    capturedQuery = JSON.parse(String(init?.body)).query as string;
    return new Response(JSON.stringify({ answer: "NO_TRUSTED_EVENT_FOUND", citations: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput("What's happening tomorrow?", FIXED_NOW);
    assert.equal(input.queryText, "What's happening?");
    assert.equal(input.timeWindow.startTime, "2026-07-08T00:00:00+07:00");
    assert.equal(input.timeWindow.endTime, "2026-07-08T23:59:59+07:00");

    await searchLiveEvents(input, "test-key");
    assert.match(capturedQuery, /Normalized search window label: Tomorrow/);
    assert.match(capturedQuery, /Search window start: 2026-07-08T00:00:00\+07:00/);
    assert.match(capturedQuery, /Search window end: 2026-07-08T23:59:59\+07:00/);
    assert.match(capturedQuery, /Do not reinterpret temporal words/);
    assert.doesNotMatch(capturedQuery, /rest of tonight/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phangan.events parser extracts events inside the normalized window", () => {
  const window = resolveEventTimeWindow("today", new Date("2026-07-22T05:00:00.000Z"));
  const events = parsePhanganEventsCalendar(`
    <html>
      <body>
        Party Seaside Beach Party at Seaside Koh Phangan WED 22 JUL 5:00 PM – 5:00 PM SEASIDE SUNSET BAR › 22
        Market Bizarre Bazaar at Seaboard WED 22 JUL 5:30 PM – 1:00 AM Seaboard Bungalows › 22
        Party Friday night Reggae vibes at Rasta Home FRI 24 JUL 9:00 PM – 3:00 AM Rasta Home
      </body>
    </html>
  `, window);

  assert.equal(events.length, 2);
  assert.equal(events[0]!.title, "Seaside Beach Party at Seaside Koh Phangan");
  assert.equal(events[0]!.venue, "SEASIDE SUNSET BAR");
  assert.equal(events[1]!.title, "Bizarre Bazaar at Seaboard");
});

test("EventService returns phangan.events results without requiring Exa", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday") || String(url).includes("todo.today")) {
      return new Response("<html>No Todo.Today matches</html>", { status: 200 });
    }
    if (String(url).includes("phangan.events")) {
      return new Response(`
        <html>
          <body>
            Party Seaside Live Dj Sunset Session WED 22 JUL 5:00 PM – 8:00 PM SEASIDE SUNSET BAR › 22
          </body>
        </html>
      `, { status: 200 });
    }
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput("What's happening today?", new Date("2026-07-22T05:00:00.000Z"));
    const result = await searchLiveEvents(input);

    assert.equal(result.fallback, false);
    assert.match(result.response ?? "", /Seaside Live Dj Sunset Session/);
    assert.equal(result.diagnostics?.searchMode, "broad");
    assert.equal(result.diagnostics?.mergedResultCount, 1);
    assert.deepEqual(result.diagnostics?.categoriesReturned, ["Music and DJ sets"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EventService merges broad same-day Telegram and phangan.events results with diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday")) {
      return new Response(`
        <html><body>
          Wednesday Jul 22, 2026
          <br>🌃 NIGHTLIFE HIGHLIGHTS
          <br>🕒 9:00 PM - 2:00 AM
          <br>🕺 Garden Grooves: Tech House & Techno Night w/ AREZKC
          <br>📍 Sound Garden
          <br>🆓 Free
          <br>🔗 todo.today/2sul8
          <br>🕒 7:00 PM - 10:30 PM
          <br>🎼 Klee Bho: Live Folk & World Music
          <br>📍 The Sanctuary
          <br>🆓 Free (Booking Advised)
          <br>🔗 todo.today/ec38v
        </body></html>
      `, { status: 200 });
    }
    if (String(url).includes("phangan.events")) {
      return new Response(`
        <html><body>
          Market Bizarre Bazaar at Seaboard WED 22 JUL 5:30 PM – 1:00 AM Seaboard Bungalows › 22
        </body></html>
      `, { status: 200 });
    }
    if (String(url) === "https://todo.today/koh-phangan/") {
      return new Response(`
        <section
          data-channel="koh-phangan"
          data-rest-url="https://todo.today/api/todo-today/v1/events"
          data-rest-nonce="test-nonce"
          id="tt-app"
        ></section>
      `, { status: 200 });
    }
    if (String(url).includes("/api/todo-today/v1/events")) {
      return Response.json({ filters: { categories: [] }, sections: [] });
    }
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput("What's happening tonight?", new Date("2026-07-22T05:00:00.000Z"));
    const result = await searchLiveEvents(input);

    assert.equal(result.fallback, false);
    assert.match(result.response ?? "", /Garden Grooves/);
    assert.match(result.response ?? "", /Klee Bho/);
    assert.match(result.response ?? "", /Bizarre Bazaar/);
    assert.match(result.response ?? "", /Music and DJ sets/);
    assert.match(result.response ?? "", /Live music/);
    assert.equal(result.diagnostics?.requestMode, "information");
    assert.equal(result.diagnostics?.searchMode, "broad");
    assert.equal(result.diagnostics?.mergedResultCount, 3);
    assert.equal(result.diagnostics?.duplicatesRemoved, 0);
    assert.deepEqual(result.diagnostics?.sourcesFailed, []);
    assert.doesNotMatch(result.response ?? "", /\b(?:high|medium|low) confidence\b/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Todo.Today is an independent primary source and explicit all returns every matching event", async () => {
  const originalFetch = globalThis.fetch;
  const todoEvents = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    short_name: `Yoga Class ${index + 1}`,
    link: `https://todo.today/koh-phangan/2026/07/29/yoga-class-${index + 1}`,
    start_time: `${index + 1}:00 PM`,
    end_time: `${index + 2}:00 PM`,
    venue: `Yoga Shala ${index + 1}`,
    category_id: 1,
    price_label: "฿400",
    google_map: `https://maps.example/yoga-shala-${index + 1}`,
  }));
  globalThis.fetch = (async (url) => {
    const value = String(url);
    if (value === "https://todo.today/koh-phangan/") {
      return new Response(`
        <section
          data-channel="koh-phangan"
          data-rest-url="https://todo.today/api/todo-today/v1/events"
          data-rest-nonce="test-nonce"
          id="tt-app"
        ></section>
      `, { status: 200 });
    }
    if (value.includes("/api/todo-today/v1/events")) {
      return Response.json({
        filters: { categories: [{ id: 1, name: "Wellness", short_name: "Wellness" }] },
        sections: [{ key: "afternoon", events: todoEvents }],
      });
    }
    if (value.includes("phangantoday")) {
      return new Response(`
        Wednesday Jul 29, 2026
        <br>🕒 7:00 PM - 8:00 PM
        <br>Telegram Yin Yoga
        <br>📍 Telegram Shala
        <br>💰 400 THB
      `, { status: 200 });
    }
    if (value.includes("phangan.events")) return new Response("<html>No matches</html>", { status: 200 });
    throw new Error(`Unexpected fetch ${value}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "Show me all yoga events today",
      new Date("2026-07-29T04:00:00.000Z"),
    );
    const result = await searchLiveEvents(input);

    for (let index = 1; index <= 6; index++) assert.match(result.response ?? "", new RegExp(`Yoga Class ${index}`));
    assert.match(result.response ?? "", /Telegram Yin Yoga/);
    assert.equal(result.diagnostics?.resultMode, "complete");
    assert.deepEqual(result.diagnostics?.sourcesAttempted, [
      "Todo.Today Koh Phangan",
      "Phangan Today Telegram",
      "phangan.events calendar",
    ]);
    assert.deepEqual(result.diagnostics?.rawResultCountBySource, {
      "Todo.Today Koh Phangan": 6,
      "Phangan Today Telegram": 1,
      "phangan.events calendar": 0,
    });
    assert.equal(result.diagnostics?.filterDecisions?.find(item => item.event.includes("Yoga Class 1"))?.humanNeeds?.includes("reset"), true);
    assert.equal(result.venueReferences?.length, 7);
    assert.deepEqual(result.venueReferences?.find(venue => venue.name === "Yoga Shala 1"), {
      id: "yoga-shala-1",
      name: "Yoga Shala 1",
      aliases: ["Yoga Shala 1"],
      area: undefined,
      googleMapsUrl: "https://maps.example/yoga-shala-1",
      sourceUrl: "https://todo.today/koh-phangan/2026/07/29/yoga-class-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EventService excludes unrelated categories from an explicit wellness request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday")) {
      return new Response(`
        <html><body>
          Wednesday Jul 22, 2026
          <br>🕒 9:00 AM - 10:30 AM
          <br>Morning Yin Yoga and Sound Healing
          <br>📍 Orion Healing Centre
          <br>💰 500 THB
          <br>🔗 todo.today/wellness
          <br>🕒 9:00 PM - 2:00 AM
          <br>Techno Beach Party with DJ Nova
          <br>📍 Seaside Sunset Bar
          <br>💰 600 THB
          <br>🔗 todo.today/party
        </body></html>
      `, { status: 200 });
    }
    if (String(url).includes("phangan.events")) {
      return new Response("<html>No matching events</html>", { status: 200 });
    }
    if (String(url).includes("todo.today")) {
      return new Response("<html>fallback app page</html>", { status: 200 });
    }
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "Hi SIT, I'm Iklima. What's going on today around the island for wellness?",
      new Date("2026-07-22T01:00:00.000Z"),
    );
    input.userContext = { firstName: "Iklima" };
    const result = await searchLiveEvents(input);

    assert.equal(result.fallback, false);
    assert.match(result.response ?? "", /Welcome to Koh Phangan, Iklima/);
    assert.match(result.response ?? "", /Morning Yin Yoga and Sound Healing/);
    assert.doesNotMatch(result.response ?? "", /Techno Beach Party/);
    assert.doesNotMatch(result.response ?? "", /island-wide event landscape/);
    assert.match(result.response ?? "", /what fits today: relaxing, spiritual, movement-based, or more social/);
    assert.equal(result.diagnostics?.searchMode, "filtered");
    assert.deepEqual(result.diagnostics?.appliedFilters, {
      categories: ["wellness"],
      audience: undefined,
      area: undefined,
    });
    assert.equal(result.diagnostics?.filteredOutCount, 1);
    assert.deepEqual(result.diagnostics?.categoriesReturned, ["Yoga, wellness and breathwork"]);
    assert.doesNotMatch(result.response ?? "", /\b(?:high|medium|low) confidence\b/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EventService uses physical-health context to prioritize movement without broadening wellness", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday")) {
      return new Response(`
        <html><body>
          Wednesday Jul 22, 2026
          <br>🕒 9:00 AM - 10:00 AM
          <br>Morning Sound Healing
          <br>📍 Orion Healing Centre
          <br>🕒 10:00 AM - 11:30 AM
          <br>Acro Yoga Movement Class
          <br>📍 Ethos Shala
          <br>🕒 9:00 PM - 2:00 AM
          <br>Techno Beach Party
          <br>📍 Seaside Sunset Bar
        </body></html>
      `, { status: 200 });
    }
    if (String(url).includes("phangan.events")) return new Response("<html>No matches</html>", { status: 200 });
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "What are today's wellness events?",
      new Date("2026-07-22T01:00:00.000Z"),
    );
    input.userContext = { purpose: "wellness", purposeDetail: "wellness-physical" };
    const result = await searchLiveEvents(input);
    const response = result.response ?? "";

    assert.ok(response.indexOf("Acro Yoga Movement Class") < response.indexOf("Morning Sound Healing"));
    assert.doesNotMatch(response, /Techno Beach Party/);
    assert.deepEqual(result.diagnostics?.appliedFilters?.categories, ["wellness"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explicit music search returns only primary music experiences", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday")) {
      return new Response(`
        <html><body>
          Monday Jul 27, 2026
          <br>🕒 10:00 AM - 12:00 PM
          <br>Acro Yoga Jam
          <br>📍 Labracadabra
          <br>🕒 11:00 AM - 1:00 PM
          <br>Holotropic Breathwork
          <br>📍 Orion Healing
          <br>🕒 5:00 PM - 8:00 PM
          <br>Sunset DJ Set
          <br>📍 Tiki Beach Resort
          <br>🕒 7:30 PM - 9:00 PM
          <br>Bhakti Kirtan & Sacred Sound
          <br>📍 Arcana
          <br>🕒 7:30 PM - 10:00 PM
          <br>Acoustic Night: Live Music Performance
          <br>📍 Rasta Home
        </body></html>
      `, { status: 200 });
    }
    if (String(url).includes("phangan.events")) return new Response("<html>No matches</html>", { status: 200 });
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "I'm looking for music today.",
      new Date("2026-07-27T01:00:00.000Z"),
    );
    const result = await searchLiveEvents(input);

    assert.match(result.response ?? "", /Sunset DJ Set/);
    assert.match(result.response ?? "", /Acoustic Night: Live Music Performance/);
    assert.doesNotMatch(result.response ?? "", /Acro Yoga Jam|Holotropic Breathwork|Bhakti Kirtan/);
    assert.match(result.response ?? "", /music-focused events/);
    assert.match(result.response ?? "", /open to conscious events where music plays a central role/);
    assert.equal(result.diagnostics?.searchMode, "filtered");
    assert.equal(result.diagnostics?.filterDecisions?.find(item => item.event.includes("Sunset DJ Set"))?.primaryExperience, "music");
    assert.equal(result.diagnostics?.filterDecisions?.find(item => item.event.includes("Bhakti Kirtan"))?.matchRole, "secondary");
    assert.match(result.diagnostics?.filterDecisions?.find(item => item.event.includes("Bhakti Kirtan"))?.reason ?? "", /music is secondary/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EventService hides an event already finished in Thailand regardless of browser timezone", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday")) {
      return new Response(`
        <html><body>
          Wednesday Jul 22, 2026
          <br>🕒 9:00 AM - 10:00 AM
          <br>Morning Yin Yoga
          <br>📍 Orion Healing Centre
          <br>🕒 4:00 PM - 5:30 PM
          <br>Afternoon Breathwork
          <br>📍 Ethos Shala
        </body></html>
      `, { status: 200 });
    }
    if (String(url).includes("phangan.events")) return new Response("<html>No matches</html>", { status: 200 });
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "What's happening today for wellness?",
      new Date("2026-07-22T08:00:00.000Z"),
      "America/New_York",
    );
    const result = await searchLiveEvents(input);

    assert.doesNotMatch(result.response ?? "", /Morning Yin Yoga/);
    assert.match(result.response ?? "", /Afternoon Breathwork/);
    assert.equal(result.diagnostics?.destinationTimezone, "Asia/Bangkok");
    assert.equal(result.diagnostics?.browserTimezone, "America/New_York");
    assert.equal(result.diagnostics?.filteringCutoff, "2026-07-22T15:00:00+07:00");
    assert.match(result.diagnostics?.filterDecisions?.find(item => item.event.includes("Morning Yin Yoga"))?.reason ?? "", /ended before the Koh Phangan cutoff/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EventService recommends an event starting in one hour in Thailand when the browser shows another day", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday")) {
      return new Response(`
        <html><body>
          Wednesday Jul 22, 2026
          <br>🕒 1:30 AM - 3:00 AM
          <br>Late Night Sound Healing
          <br>📍 Ethos Shala
        </body></html>
      `, { status: 200 });
    }
    if (String(url).includes("phangan.events")) return new Response("<html>No matches</html>", { status: 200 });
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "What's happening today for wellness?",
      new Date("2026-07-21T17:30:00.000Z"),
      "America/Los_Angeles",
    );
    const result = await searchLiveEvents(input);

    assert.equal(input.timeWindow.startTime, "2026-07-22T00:00:00+07:00");
    assert.equal(input.clock.destinationCurrentTime, "2026-07-22T00:30:00+07:00");
    assert.match(result.response ?? "", /Late Night Sound Healing/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filtered Exa fallback cannot broaden a wellness request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    if (String(url).includes("phangantoday") || String(url).includes("phangan.events")) {
      return new Response("<html>No structured events</html>", { status: 200 });
    }
    if (String(url).includes("api.exa.ai")) {
      return new Response(JSON.stringify({
        answer: [
          "Here is everything happening today:",
          "• Sunset Yoga and Breathwork - July 22 at 5pm - Ethos Shala",
          "• Techno Beach Party with DJ Nova - July 22 at 10pm - Seaside Bar",
          "Would you like music, wellness, or something social?",
        ].join("\n"),
        citations: [{ url: "https://phangan.events/" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const input = createLiveEventSearchInput(
      "What's happening today for wellness?",
      new Date("2026-07-22T01:00:00.000Z"),
    );
    const result = await searchLiveEvents(input, "test-key");

    assert.match(result.response ?? "", /Sunset Yoga and Breathwork/);
    assert.doesNotMatch(result.response ?? "", /Techno Beach Party|Would you like music/);
    assert.match(result.response ?? "", /relaxation, breathwork, yoga, movement/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Event validator rejects dated candidates outside the requested window", () => {
  const window = resolveEventTimeWindow("tomorrow", FIXED_NOW);
  const result = validateEventAnswerWindow([
    "Good event - July 8 at 8pm - Lighthouse",
    "Stale event - July 7 at 9pm - Somewhere",
  ].join("\n"), window);

  assert.match(result.answer ?? "", /Good event/);
  assert.doesNotMatch(result.answer ?? "", /Stale event/);
  assert.equal(result.rejectedCandidates.length, 1);
  assert.match(result.rejectedCandidates[0]!.reason, /outside Tomorrow window/);
});

test("Event validator allows late-night event after midnight inside tonight window", () => {
  const window = resolveEventTimeWindow("tonight", FIXED_NOW);
  const result = validateEventAnswerWindow("After midnight set - July 8 at 1am - Jungle", window);

  assert.match(result.answer ?? "", /After midnight set/);
  assert.equal(result.rejectedCandidates.length, 0);
});
