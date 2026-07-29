import test from "node:test";
import assert from "node:assert/strict";
import {
  createConversationServices,
  createInitialConversationState,
  runConversationTurn,
  type ConversationServices,
  type ConversationState,
} from "./index.js";

function cloneState(state: ConversationState): ConversationState {
  return JSON.parse(JSON.stringify(state)) as ConversationState;
}

function testServices(): ConversationServices {
  return createConversationServices({
    events: {
      async search(request) {
        return { response: `EVENT:${request.queryText}`, fallback: false, sources: ["test"] };
      },
    },
    knowledge: {
      async search(query) {
        return { answer: `KNOWLEDGE:${query}` };
      },
    },
  });
}

function profileReadyState(): ConversationState {
  const state = createInitialConversationState();
  state.context.firstName = "Alex";
  state.context.firstNameAsked = true;
  state.context.age = 29;
  state.context.ageAsked = true;
  state.context.genderIdentity = "not-shared";
  state.context.genderIdentityAsked = true;
  return state;
}

async function assertParity(message: string, state: ConversationState = createInitialConversationState()) {
  const services = testServices();
  const web = await runConversationTurn({
    message,
    state: cloneState(state),
    channel: "web",
    services,
    devTrace: true,
  });
  const whatsapp = await runConversationTurn({
    message,
    state: cloneState(state),
    channel: "whatsapp",
    services,
    devTrace: true,
  });

  assert.equal(web.decision?.intent, whatsapp.decision?.intent);
  assert.equal(web.decision?.requiredService, whatsapp.decision?.requiredService);
  assert.deepEqual(web.decision?.memoryUpdates, whatsapp.decision?.memoryUpdates);
  assert.deepEqual(web.updatedState.memory, whatsapp.updatedState.memory);
  assert.equal(web.messages.map(m => m.text).join("\n"), whatsapp.messages.map(m => m.text).join("\n"));
  assert.notEqual(web.decision?.action, "continue_onboarding");
  assert.notEqual(whatsapp.decision?.action, "continue_onboarding");

  return web;
}

test("adapter parity: live party question", async () => {
  const output = await assertParity("What parties are happening tonight?");
  assert.equal(output.decision?.intent, "live_event_search");
  assert.equal(output.decision?.requiredService, "events");
  assert.match(output.messages[0]!.text, /EVENT:/);
});

test("adapter parity: Lighthouse location", async () => {
  const output = await assertParity("Send me the Lighthouse location.");
  assert.equal(output.decision?.intent, "location_request");
  assert.equal(output.decision?.requiredService, "location");
  assert.match(output.messages[0]!.text, /Lighthouse/);
});

test("adapter parity: definition question", async () => {
  const output = await assertParity("What is ecstatic dance?");
  assert.equal(output.decision?.intent, "definition");
  assert.equal(output.decision?.requiredService, "knowledge");
  assert.match(output.messages[0]!.text, /KNOWLEDGE:/);
});

test("adapter parity: date follow-up stays in event context", async () => {
  const state = createInitialConversationState();
  state.memory.lastTopic = "events";
  const output = await assertParity("This Wednesday.", state);
  assert.equal(output.decision?.intent, "follow_up");
  assert.equal(output.decision?.requiredService, "events");
  assert.match(output.messages[0]!.text, /EVENT:/);
});

test("adapter parity: price follow-up is answered as a direct question", async () => {
  const state = createInitialConversationState();
  state.memory.lastVenue = "lighthouse";
  const output = await assertParity("How much is it?", state);
  assert.equal(output.decision?.requiredService, "knowledge");
  assert.match(output.messages[0]!.text, /KNOWLEDGE:/);
});

test("adapter parity: direct question during incomplete onboarding", async () => {
  const output = await assertParity("Where should I stay?");
  assert.equal(output.decision?.requiredService, "knowledge");
  assert.match(output.messages[0]!.text, /KNOWLEDGE:/);
});

test("human onboarding: start opens warmly and asks for a name", async () => {
  const output = await runConversationTurn({
    message: "",
    state: createInitialConversationState(),
    channel: "web",
    services: testServices(),
  });

  assert.match(output.messages.map(message => message.text).join("\n"), /good local friend/i);
  assert.match(output.messages.at(-1)!.text, /What should I call you/i);
  assert.equal(output.updatedState.context.firstNameAsked, true);
  assert.equal(output.suggestions, undefined);
});

test("human onboarding: profile questions flow before human need without blocking direct answers", async () => {
  const services = testServices();
  let state = createInitialConversationState();
  state.context.firstNameAsked = true;

  const name = await runConversationTurn({
    message: "Maya",
    state,
    channel: "web",
    services,
  });
  state = name.updatedState;
  assert.equal(state.context.firstName, "Maya");
  assert.match(name.messages[0]!.text, /Roughly how old/i);

  const age = await runConversationTurn({
    message: "32",
    state,
    channel: "web",
    services,
  });
  state = age.updatedState;
  assert.equal(state.context.age, 32);
  assert.match(age.messages[0]!.text, /only if you're comfortable/i);

  const gender = await runConversationTurn({
    message: "Prefer not to say",
    state,
    channel: "web",
    services,
  });
  assert.equal(gender.updatedState.context.genderIdentity, "not-shared");
  assert.match(gender.messages[0]!.text, /what are you hoping this island gives you/i);
});

test("pending onboarding pauses for a location request and preserves progress", async () => {
  const state = createInitialConversationState();
  state.context.firstNameAsked = true;

  const location = await runConversationTurn({
    message: "Where is Ethos Cafe",
    state,
    channel: "web",
    services: testServices(),
  });

  assert.equal(location.decision?.intent, "location_request");
  assert.equal(location.decision?.requiredService, "location");
  assert.match(location.messages[0]!.text, /ETHOS Wholefood Cafe & Shala/);
  assert.match(location.messages[0]!.text, /google\.com\/maps/);
  assert.match(location.messages[0]!.text, /Nearby landmark|Srithanu/);
  assert.equal(location.updatedState.context.firstName, undefined);
  assert.equal(location.updatedState.memory.onboardingPaused, true);
  assert.equal(location.updatedState.memory.onboardingStage, "purpose");
  assert.equal(location.updatedState.memory.currentMode, "information");

  const bareVenue = await runConversationTurn({
    message: "Ethos Cafe",
    state: location.updatedState,
    channel: "web",
    services: testServices(),
  });
  assert.equal(bareVenue.decision?.intent, "location_request");
  assert.match(bareVenue.messages[0]!.text, /ETHOS Wholefood Cafe & Shala/);
  assert.equal(bareVenue.updatedState.context.firstName, undefined);
  assert.doesNotMatch(bareVenue.messages[0]!.text, /Nice to meet you|how old/i);
});

test("event venue references survive the event turn and resolve an exact location follow-up", async () => {
  const services = createConversationServices({
    events: {
      async search() {
        return {
          response: "Yin Yoga & Sound Healing — Sabai Yin Yogashala",
          fallback: false,
          venueReferences: [{
            id: "sabai-yin-yogashala",
            name: "Sabai Yin Yogashala",
            aliases: ["Sabai Yin YogaShala"],
            area: "Sri Thanu",
            googleMapsUrl: "https://maps.example/sabai-yin-yogashala",
            sourceUrl: "https://todo.today/example",
          }],
        };
      },
    },
  });

  const events = await runConversationTurn({
    message: "Show me yoga events tomorrow",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const location = await runConversationTurn({
    message: "Where is the location of Sabai Yin YogaShala?",
    state: events.updatedState,
    channel: "web",
    services,
  });

  assert.equal(location.decision?.intent, "location_request");
  assert.equal(location.decision?.requiredService, "location");
  assert.match(location.messages[0]!.text, /Sabai Yin Yogashala/);
  assert.match(location.messages[0]!.text, /https:\/\/maps\.example\/sabai-yin-yogashala/);
  assert.equal(location.updatedState.memory.lastVenueReference?.name, "Sabai Yin Yogashala");
  assert.equal(location.updatedState.activeTask?.kind, "location");
  assert.equal(location.updatedState.activeTask?.status, "refinable");
  assert.equal(location.updatedState.activeTask?.contract, undefined);
});

test("compound locations and venue event follow-ups stay on the newly named venue", async () => {
  let eventServiceCalls = 0;
  const services = createConversationServices({
    events: {
      async search(request) {
        eventServiceCalls += 1;
        return {
          response: [
            "DJ Night: Mystic Bloom — 8:00 PM-11:00 PM, Tipsy Cocktail Bar",
            "Candlelit Sound Healing — 7:00 PM-9:00 PM, Ananda Yoga & Detox",
          ].join("\n"),
          fallback: false,
          events: [
            {
              id: "mystic-bloom",
              title: "DJ Night: Mystic Bloom",
              category: "Music and DJ sets",
              venue: "Tipsy Cocktail Bar",
              startTime: request.timeWindow.startTime,
              endTime: request.timeWindow.endTime,
              price: "Free",
              primaryExperience: "music",
              sourceUrl: "https://todo.today/mystic-bloom",
            },
            {
              id: "candlelit-sound-healing",
              title: "Candlelit Sound Healing",
              category: "Yoga, wellness and breathwork",
              venue: "Ananda Yoga & Detox",
              startTime: request.timeWindow.startTime,
              endTime: request.timeWindow.endTime,
              primaryExperience: "wellness",
              sourceUrl: "https://todo.today/candlelit-sound-healing",
            },
          ],
          venueReferences: [
            {
              id: "tipsy-cocktail-bar",
              name: "Tipsy Cocktail Bar",
              aliases: ["Tipsy Cocktail Bar"],
              googleMapsUrl: "https://maps.example/tipsy",
            },
            {
              id: "ananda-yoga-detox",
              name: "Ananda Yoga & Detox",
              aliases: ["Ananda Yoga"],
              googleMapsUrl: "https://maps.example/ananda",
            },
          ],
          timeWindow: request.timeWindow,
        };
      },
    },
  });

  const events = await runConversationTurn({
    message: "What's happening tonight?",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const ananda = await runConversationTurn({
    message: "where is ananda yoga",
    state: events.updatedState,
    channel: "web",
    services,
  });
  assert.match(ananda.messages[0]!.text, /Ananda Yoga & Detox/);

  const tipsyLocation = await runConversationTurn({
    message: "thank you, after yoga i want to go to a party, where is tipsy coctail bar",
    state: ananda.updatedState,
    channel: "web",
    services,
  });
  assert.match(tipsyLocation.messages[0]!.text, /Tipsy Cocktail Bar/);
  assert.doesNotMatch(tipsyLocation.messages[0]!.text, /Ananda Yoga & Detox/);

  const tipsyEvent = await runConversationTurn({
    message: "what is the event in tipsy coctail bar tonight?",
    state: tipsyLocation.updatedState,
    channel: "web",
    services,
  });
  const answer = tipsyEvent.messages[0]!.text;
  assert.match(answer, /At Tipsy Cocktail Bar tonight/i);
  assert.match(answer, /DJ Night: Mystic Bloom/);
  assert.doesNotMatch(answer, /Candlelit Sound Healing|island-wide event landscape/);
  assert.equal(eventServiceCalls, 1);
  assert.equal(tipsyEvent.updatedState.memory.lastEvent?.filters?.venue, "Tipsy Cocktail Bar");
});

test("an explicitly named venue returns a Maps search instead of asking for the venue again", async () => {
  const output = await runConversationTurn({
    message: "Where is Arcana?",
    state: createInitialConversationState(),
    channel: "web",
    services: testServices(),
  });

  assert.equal(output.decision?.intent, "location_request");
  assert.match(output.messages[0]!.text, /Arcana/);
  assert.match(output.messages[0]!.text, /google\.com\/maps\/search/);
  assert.doesNotMatch(output.messages[0]!.text, /Which place/i);
  assert.equal(output.updatedState.activeTask?.status, "refinable");
});

test("a missing venue creates a blocking contract that consumes the next venue answer", async () => {
  const services = testServices();
  const clarification = await runConversationTurn({
    message: "Send me the location",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });

  assert.match(clarification.messages[0]!.text, /Which place/i);
  assert.equal(clarification.updatedState.activeTask?.kind, "location");
  assert.equal(clarification.updatedState.activeTask?.status, "awaiting_clarification");
  assert.equal(clarification.updatedState.activeTask?.contract?.expectedAnswer, "venue");

  const answer = await runConversationTurn({
    message: "Sabai Yin YogaShala",
    state: clarification.updatedState,
    channel: "web",
    services,
    devTrace: true,
  });

  assert.equal(answer.decision?.intent, "location_request");
  assert.equal(answer.decision?.requiredService, "location");
  assert.match(answer.decision?.debugReason ?? "", /active location contract/i);
  assert.match(answer.messages[0]!.text, /Sabai Yin YogaShala/);
  assert.match(answer.messages[0]!.text, /google\.com\/maps\/search/);
  assert.doesNotMatch(answer.messages[0]!.text, /KNOWLEDGE:|Nice to meet you|how old/i);
  assert.equal(answer.updatedState.activeTask?.status, "refinable");
  assert.equal(answer.updatedState.activeTask?.contract, undefined);
});

test("a direct event request supersedes an unresolved location contract", async () => {
  const services = testServices();
  const clarification = await runConversationTurn({
    message: "Send me the location",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const replacement = await runConversationTurn({
    message: "What's happening tonight?",
    state: clarification.updatedState,
    channel: "web",
    services,
  });

  assert.equal(replacement.decision?.intent, "live_event_search");
  assert.equal(replacement.decision?.requiredService, "events");
  assert.match(replacement.messages[0]!.text, /EVENT:/);
  assert.equal(replacement.updatedState.activeTask?.kind, "event_search");
  assert.equal(replacement.updatedState.activeTask?.contract, undefined);
});

test("web and WhatsApp consume the same venue contract through the canonical runner", async () => {
  const services = testServices();
  const clarification = await runConversationTurn({
    message: "Send me the location",
    state: createInitialConversationState(),
    channel: "test",
    services,
  });
  const web = await runConversationTurn({
    message: "Sabai Yin YogaShala",
    state: cloneState(clarification.updatedState),
    channel: "web",
    services,
  });
  const whatsapp = await runConversationTurn({
    message: "Sabai Yin YogaShala",
    state: cloneState(clarification.updatedState),
    channel: "whatsapp",
    services,
  });

  assert.equal(web.decision?.intent, whatsapp.decision?.intent);
  assert.equal(web.decision?.requiredService, whatsapp.decision?.requiredService);
  assert.equal(web.messages[0]!.text, whatsapp.messages[0]!.text);
  assert.deepEqual(web.updatedState.activeTask, whatsapp.updatedState.activeTask);
});

function venueCorrectionServices(): ConversationServices {
  return createConversationServices({
    knowledge: {
      async search() {
        return { answer: null };
      },
    },
  });
}

function stateWithRecentEventVenues(): ConversationState {
  const state = createInitialConversationState();
  state.memory.lastEvent = {
    scope: "tomorrow",
    query: "yoga tomorrow",
    venueReferences: [
      {
        id: "seeds-of-dreams",
        name: "Seeds of Dreams",
        googleMapsUrl: "https://maps.example/seeds-of-dreams",
      },
      {
        id: "kaia-studio",
        name: "Kaia Studio",
        googleMapsUrl: "https://maps.example/kaia-studio",
      },
    ],
  };
  return state;
}

test("a newly named venue outranks the previously remembered location", async () => {
  const services = venueCorrectionServices();
  const seeds = await runConversationTurn({
    message: "Where is Seeds of Dreams?",
    state: stateWithRecentEventVenues(),
    channel: "web",
    services,
  });
  const kaia = await runConversationTurn({
    message: "Where is Kaia Studio?",
    state: seeds.updatedState,
    channel: "web",
    services,
  });

  assert.equal(kaia.decision?.intent, "location_request");
  assert.match(kaia.messages[0]!.text, /Kaia Studio/);
  assert.match(kaia.messages[0]!.text, /maps\.example\/kaia-studio/);
  assert.doesNotMatch(kaia.messages[0]!.text, /Seeds of Dreams/);
  assert.equal(kaia.updatedState.memory.lastVenue, "kaia-studio");
});

test("a venue correction refines the active location task without restarting onboarding", async () => {
  const services = venueCorrectionServices();
  const seeds = await runConversationTurn({
    message: "Where is Seeds of Dreams?",
    state: stateWithRecentEventVenues(),
    channel: "web",
    services,
  });
  const correction = await runConversationTurn({
    message: "I am not asking for Seeds of Dreams. I am asking Kaia Studio",
    state: seeds.updatedState,
    channel: "web",
    services,
    devTrace: true,
  });

  assert.equal(correction.decision?.intent, "location_request");
  assert.match(correction.decision?.debugReason ?? "", /venue correction/i);
  assert.match(correction.messages[0]!.text, /Kaia Studio/);
  assert.doesNotMatch(correction.messages[0]!.text, /Nice to meet you|how old/i);
});

test("an unrelated factual question replaces a completed location task", async () => {
  const services = venueCorrectionServices();
  const seeds = await runConversationTurn({
    message: "Where is Seeds of Dreams?",
    state: stateWithRecentEventVenues(),
    channel: "web",
    services,
  });
  const person = await runConversationTurn({
    message: "Who is Aliyah?",
    state: seeds.updatedState,
    channel: "web",
    services,
  });

  assert.equal(person.decision?.intent, "definition");
  assert.equal(person.decision?.requiredService, "knowledge");
  assert.match(person.messages[0]!.text, /I don't have reliable information/i);
  assert.match(person.messages[0]!.text, /Who is Aliyah\? Koh Phangan/);
  assert.match(person.messages[0]!.text, /google\.com\/search\?q=Who%20is%20Aliyah%3F%20Koh%20Phangan/);
  assert.doesNotMatch(person.messages[0]!.text, /Seeds of Dreams/);
  assert.equal(person.updatedState.activeTask?.kind, "knowledge");
});

test("pending onboarding pauses for an opening-hours request", async () => {
  const state = createInitialConversationState();
  state.context.firstNameAsked = true;
  const services = createConversationServices({
    knowledge: {
      async search() {
        return { answer: "ETHOS opening hours are returned from the venue knowledge source." };
      },
    },
  });

  const output = await runConversationTurn({
    message: "What time does Ethos Cafe open",
    state,
    channel: "web",
    services,
  });

  assert.equal(output.decision?.intent, "practical_information");
  assert.equal(output.decision?.requiredService, "knowledge");
  assert.match(output.messages[0]!.text, /opening hours/);
  assert.equal(output.updatedState.context.firstName, undefined);
  assert.equal(output.updatedState.memory.onboardingPaused, true);
  assert.equal(output.updatedState.memory.onboardingStage, "purpose");
});

test("pending onboarding pauses for a reservation request", async () => {
  const state = createInitialConversationState();
  state.context.firstNameAsked = true;
  const services = createConversationServices({
    knowledge: {
      async search() {
        return { answer: "You can walk in for the cafe; special classes may require booking." };
      },
    },
  });

  const output = await runConversationTurn({
    message: "Do I need a reservation at Ethos Cafe",
    state,
    channel: "whatsapp",
    services,
  });

  assert.equal(output.decision?.intent, "practical_information");
  assert.equal(output.decision?.requiredService, "knowledge");
  assert.match(output.messages[0]!.text, /walk in|booking/);
  assert.equal(output.updatedState.context.firstName, undefined);
  assert.equal(output.updatedState.memory.onboardingPaused, true);
  assert.equal(output.updatedState.memory.onboardingStage, "purpose");
});

test("an actual name resumes pending onboarding normally", async () => {
  const state = createInitialConversationState();
  state.context.firstNameAsked = true;
  state.memory.onboardingPaused = true;
  state.memory.currentMode = "information";

  const output = await runConversationTurn({
    message: "Iklima",
    state,
    channel: "web",
    services: testServices(),
  });

  assert.equal(output.decision?.intent, "onboarding");
  assert.equal(output.updatedState.context.firstName, "Iklima");
  assert.match(output.messages[0]!.text, /Roughly how old/i);
  assert.equal(output.updatedState.memory.onboardingPaused, false);
  assert.equal(output.updatedState.memory.currentMode, "discovery");
});

test("sprint 3: tomorrow does not produce tonight window", async () => {
  let capturedStart = "";
  let capturedLabel = "";
  const services = createConversationServices({
    events: {
      async search(request) {
        capturedLabel = request.timeWindow.label;
        capturedStart = request.timeWindow.startTime;
        return { response: "ok", fallback: false };
      },
    },
  });

  const output = await runConversationTurn({
    message: "What's happening tomorrow?",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });

  assert.equal(output.decision?.requiredService, "events");
  assert.equal(capturedLabel, "Tomorrow");
  assert.match(capturedStart, /T00:00:00\+07:00$/);
  assert.equal(output.updatedState.memory.lastTimeLabel, "Tomorrow");
});

test("explicit wellness event context bypasses discovery and reaches EventService as a constraint", async () => {
  let capturedFilters: unknown;
  const services = createConversationServices({
    events: {
      async search(request) {
        capturedFilters = request.filters;
        return {
          response: "Wellness events only",
          fallback: false,
          diagnostics: { searchMode: request.filters ? "filtered" : "broad" },
        };
      },
    },
  });

  const output = await runConversationTurn({
    message: "Hi SIT, I'm Iklima. I'll stay on Koh Phangan for 5 days. I want to know what's going on today around the island for wellness.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });

  assert.equal(output.decision?.intent, "live_event_search");
  assert.notEqual(output.decision?.action, "continue_onboarding");
  assert.deepEqual(capturedFilters, { categories: ["wellness"], audience: undefined, area: undefined });
  assert.equal(output.updatedState.context.firstName, "Iklima");
  assert.equal(output.updatedState.context.duration, "short");
  assert.equal(output.updatedState.context.purpose, "wellness");
  assert.equal(output.messages[0]!.text, "Wellness events only");
});

test("pending request: today's wellness task survives incomplete onboarding and is answered directly", async () => {
  let pendingDuringSearch: ConversationState["memory"]["pendingUserRequest"];
  const services = createConversationServices({
    events: {
      async search(request, context) {
        pendingDuringSearch = context.state.memory.pendingUserRequest;
        assert.equal(request.timeWindow.label, "Today");
        assert.deepEqual(request.filters?.categories, ["wellness"]);
        return { response: "Today's wellness events only", fallback: false };
      },
    },
  });

  const output = await runConversationTurn({
    message: "Hi SIT, I am Maya. I want to know today's wellness events on the island.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });

  assert.equal(output.decision?.intent, "live_event_search");
  assert.equal(output.updatedState.context.firstName, "Maya");
  assert.equal(output.updatedState.memory.onboardingPaused, true);
  assert.equal(pendingDuringSearch?.originalMessage, "Hi SIT, I am Maya. I want to know today's wellness events on the island.");
  assert.equal(pendingDuringSearch?.requestMode, "information");
  assert.equal(pendingDuringSearch?.requestedDate, "today");
  assert.equal(pendingDuringSearch?.requestedCategory, "wellness");
  assert.equal(pendingDuringSearch?.requestedScope, "island-wide");
  assert.equal(output.updatedState.memory.pendingUserRequest, undefined);
  assert.equal(output.updatedState.memory.originalRequest?.requestedCategory, "wellness");
  assert.equal(output.brief, undefined);
  assert.doesNotMatch(output.messages.map(message => message.text).join("\n"), /SIT Brief|put together a plan/i);
});

test("pending request: physical-health discovery context refines wellness without broadening events", async () => {
  const captured: Array<{ label: string; categories?: string[]; purposeDetail?: string }> = [];
  const services = createConversationServices({
    events: {
      async search(request) {
        const userContext = request.userContext as { purposeDetail?: string };
        captured.push({
          label: request.timeWindow.label,
          categories: request.filters?.categories,
          purposeDetail: userContext.purposeDetail,
        });
        return { response: "Yoga, movement, and recovery events only", fallback: false };
      },
    },
  });

  const first = await runConversationTurn({
    message: "I want to know today's wellness events.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const second = await runConversationTurn({
    message: "Physical health matters most to me.",
    state: first.updatedState,
    channel: "web",
    services,
  });

  assert.equal(second.decision?.intent, "follow_up");
  assert.deepEqual(captured, [
    { label: "Today", categories: ["wellness"], purposeDetail: undefined },
    { label: "Today", categories: ["wellness"], purposeDetail: "wellness-physical" },
  ]);
  assert.equal(second.updatedState.context.purposeDetail, "wellness-physical");
  assert.doesNotMatch(second.messages[0]!.text, /party|techno|live music/i);
});

test("pending request: only wellness preserves today's active result context", async () => {
  const captured: Array<{ label: string; categories?: string[] }> = [];
  const services = createConversationServices({
    events: {
      async search(request) {
        captured.push({ label: request.timeWindow.label, categories: request.filters?.categories });
        return { response: "Wellness only", fallback: false };
      },
    },
  });
  const first = await runConversationTurn({
    message: "I want to know today's wellness events.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const second = await runConversationTurn({
    message: "Only wellness.",
    state: first.updatedState,
    channel: "web",
    services,
  });

  assert.deepEqual(captured, [
    { label: "Today", categories: ["wellness"] },
    { label: "Today", categories: ["wellness"] },
  ]);
  assert.equal(second.updatedState.memory.originalRequest?.requestedDate, "today");
  assert.equal(second.updatedState.memory.lastEvent?.timeWindow?.label, "Today");
});

test("pending request: tomorrow instead changes only the date", async () => {
  const captured: Array<{ label: string; categories?: string[] }> = [];
  const services = createConversationServices({
    events: {
      async search(request) {
        captured.push({ label: request.timeWindow.label, categories: request.filters?.categories });
        return { response: "Filtered wellness events", fallback: false };
      },
    },
  });
  const first = await runConversationTurn({
    message: "I want to know today's wellness events.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  await runConversationTurn({
    message: "Tomorrow instead.",
    state: first.updatedState,
    channel: "web",
    services,
  });

  assert.deepEqual(captured, [
    { label: "Today", categories: ["wellness"] },
    { label: "Tomorrow", categories: ["wellness"] },
  ]);
});

test("pending request: show me everything broadens category but preserves today", async () => {
  const captured: Array<{ label: string; categories?: string[] }> = [];
  const services = createConversationServices({
    events: {
      async search(request) {
        captured.push({ label: request.timeWindow.label, categories: request.filters?.categories });
        return { response: "All event categories", fallback: false };
      },
    },
  });
  const first = await runConversationTurn({
    message: "I want to know today's wellness events.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const second = await runConversationTurn({
    message: "Show me everything.",
    state: first.updatedState,
    channel: "web",
    services,
  });

  assert.deepEqual(captured, [
    { label: "Today", categories: ["wellness"] },
    { label: "Today", categories: undefined },
  ]);
  assert.equal(second.updatedState.memory.lastEvent?.filters, undefined);
});

test("pending request: only Sri Thanu adds area while preserving today and wellness", async () => {
  let captured: { label: string; filters: unknown } | undefined;
  const services = createConversationServices({
    events: {
      async search(request) {
        captured = { label: request.timeWindow.label, filters: request.filters };
        return { response: "Sri Thanu wellness events", fallback: false };
      },
    },
  });
  const first = await runConversationTurn({
    message: "I want to know today's wellness events.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  await runConversationTurn({
    message: "Only Sri Thanu.",
    state: first.updatedState,
    channel: "web",
    services,
  });

  assert.deepEqual(captured, {
    label: "Today",
    filters: { categories: ["wellness"], audience: undefined, area: "Sri Thanu" },
  });
});

test("pending request: factual event request is never replaced by a brief or itinerary offer", async () => {
  const output = await runConversationTurn({
    message: "What are today's wellness events?",
    state: createInitialConversationState(),
    channel: "whatsapp",
    services: testServices(),
  });

  assert.equal(output.decision?.requiredService, "events");
  assert.equal(output.brief, undefined);
  assert.equal(output.planOptions, undefined);
  assert.doesNotMatch(output.messages.map(message => message.text).join("\n"), /SIT Brief|put together a plan/i);
});

test("music intent phrase is not parsed as the traveler's name", async () => {
  let capturedFirstName: string | undefined;
  const services = createConversationServices({
    events: {
      async search(_request, context) {
        capturedFirstName = context.state.context.firstName;
        return { response: "Primary music events only", fallback: false };
      },
    },
  });

  const output = await runConversationTurn({
    message: "I am looking for music today.",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });

  assert.equal(output.decision?.intent, "live_event_search");
  assert.equal(capturedFirstName, undefined);
  assert.equal(output.updatedState.context.firstName, undefined);
  assert.doesNotMatch(output.messages[0]!.text, /Looking For/);
});

test("discovery does not repeat an actionable need already stated in the same message", async () => {
  const output = await runConversationTurn({
    message: "I want wellness because I need proper rest.",
    state: profileReadyState(),
    channel: "web",
    services: testServices(),
  });

  assert.equal(output.updatedState.context.purpose, "wellness");
  assert.equal(output.updatedState.context.purposeDetail, "wellness-rest");
  assert.doesNotMatch(output.messages[0]!.text, /proper rest, spirituality/i);
  assert.match(output.messages[0]!.text, /scooter/i);
});

test("discovery hydrates known traveler context from remembered profile before asking", async () => {
  const state = createInitialConversationState();
  state.memory.userProfile = {
    firstName: "Maya",
    age: 32,
    genderIdentity: "not-shared",
    purpose: "wellness",
    purposeDetail: "wellness-rest",
    duration: "week",
  };

  const output = await runConversationTurn({
    message: "Let's keep going.",
    state,
    channel: "web",
    services: testServices(),
  });

  assert.equal(output.updatedState.context.firstName, "Maya");
  assert.equal(output.updatedState.context.purposeDetail, "wellness-rest");
  assert.doesNotMatch(output.messages[0]!.text, /what should i call you|how old|how do you identify|what are you hoping/i);
  assert.match(output.messages[0]!.text, /scooter/i);
});

test("time-only event follow-up retains the known category filter", async () => {
  const captured: Array<{ label: string; filters: unknown }> = [];
  const services = createConversationServices({
    events: {
      async search(request) {
        captured.push({ label: request.timeWindow.label, filters: request.filters });
        return { response: "Filtered events", fallback: false };
      },
    },
  });

  const first = await runConversationTurn({
    message: "What's happening today for wellness?",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  const second = await runConversationTurn({
    message: "What about tomorrow?",
    state: first.updatedState,
    channel: "web",
    services,
  });

  assert.equal(second.decision?.intent, "follow_up");
  assert.deepEqual(captured, [
    { label: "Today", filters: { categories: ["wellness"], audience: undefined, area: undefined } },
    { label: "Tomorrow", filters: { categories: ["wellness"], audience: undefined, area: undefined } },
  ]);
  assert.deepEqual(second.updatedState.memory.lastEvent?.filters, {
    categories: ["wellness"],
    audience: undefined,
    area: undefined,
  });
  assert.doesNotMatch(second.messages[0]!.text, /wellness or music|what kind of activities/i);
});

test("sprint 3: this Wednesday resolves before EventService receives request", async () => {
  const state = createInitialConversationState();
  state.memory.lastTopic = "events";
  let capturedLabel = "";
  const services = createConversationServices({
    events: {
      async search(request) {
        capturedLabel = request.timeWindow.label;
        return { response: "ok", fallback: false };
      },
    },
  });

  const output = await runConversationTurn({
    message: "This Wednesday?",
    state,
    channel: "web",
    services,
  });

  assert.equal(output.decision?.intent, "follow_up");
  assert.equal(output.trace?.onboardingTriggered, undefined);
  assert.equal(capturedLabel, "This Wednesday");
  assert.equal(output.updatedState.memory.lastTimeLabel, "This Wednesday");
});

test("sprint 3: web and WhatsApp receive same normalized window", async () => {
  const windows: string[] = [];
  const services = createConversationServices({
    events: {
      async search(request) {
        windows.push(`${request.timeWindow.label}:${request.timeWindow.startTime}:${request.timeWindow.endTime}`);
        return { response: "ok", fallback: false };
      },
    },
  });

  await runConversationTurn({
    message: "Tomorrow night music?",
    state: createInitialConversationState(),
    channel: "web",
    services,
  });
  await runConversationTurn({
    message: "Tomorrow night music?",
    state: createInitialConversationState(),
    channel: "whatsapp",
    services,
  });

  assert.equal(windows.length, 2);
  assert.equal(windows[0], windows[1]);
  assert.match(windows[0]!, /^Tomorrow Night:/);
});

test("discovery depth: human connection gets one more actionable follow-up before scooter", async () => {
  const services = testServices();
  let state = profileReadyState();

  const first = await runConversationTurn({
    message: "Community",
    state,
    channel: "web",
    services,
  });
  state = first.updatedState;
  assert.match(first.messages[0]!.text, /creative, spiritual, wellness/i);

  const second = await runConversationTurn({
    message: "Human connection",
    state,
    channel: "web",
    services,
  });

  assert.equal(second.updatedState.context.purposeDetail, "human-connection");
  assert.equal(second.updatedState.context.purposeDetailAsked, true);
  assert.match(second.messages[0]!.text, /What kind of connection/i);
  assert.doesNotMatch(second.messages[0]!.text, /scooter/i);
});

test("context-dependent discovery: actionable connection path asks group composition before practical context", async () => {
  const services = testServices();
  let state = profileReadyState();

  state = (await runConversationTurn({
    message: "Community",
    state,
    channel: "web",
    services,
  })).updatedState;
  state = (await runConversationTurn({
    message: "Human connection",
    state,
    channel: "web",
    services,
  })).updatedState;

  const output = await runConversationTurn({
    message: "Through yoga and wellness centers",
    state,
    channel: "web",
    services,
  });

  assert.equal(output.updatedState.context.purposeDetail, "connection-wellness");
  assert.equal(output.updatedState.context.groupCompositionAsked, true);
  assert.match(output.messages[0]!.text, /solo, with a partner, with friends/i);
  assert.doesNotMatch(output.messages[0]!.text, /scooter/i);
});

test("context-dependent discovery: group composition answer moves connection flow to practical context", async () => {
  const services = testServices();
  let state = profileReadyState();

  state = (await runConversationTurn({
    message: "Community",
    state,
    channel: "web",
    services,
  })).updatedState;
  state = (await runConversationTurn({
    message: "Human connection",
    state,
    channel: "web",
    services,
  })).updatedState;
  state = (await runConversationTurn({
    message: "Through yoga and wellness centers",
    state,
    channel: "web",
    services,
  })).updatedState;

  const output = await runConversationTurn({
    message: "Solo",
    state,
    channel: "web",
    services,
  });

  assert.equal(output.updatedState.context.groupComposition, "solo");
  assert.match(output.messages[0]!.text, /do you ride a scooter/i);
});

test("context-dependent discovery: non-connection wellness does not ask group composition", async () => {
  const services = testServices();
  let state = profileReadyState();

  state = (await runConversationTurn({
    message: "Wellness",
    state,
    channel: "web",
    services,
  })).updatedState;

  const output = await runConversationTurn({
    message: "Rest",
    state,
    channel: "web",
    services,
  });

  assert.equal(output.updatedState.context.purposeDetail, "wellness-rest");
  assert.equal(output.updatedState.context.groupCompositionAsked, false);
  assert.match(output.messages[0]!.text, /do you ride a scooter/i);
});
