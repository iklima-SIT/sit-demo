import assert from "node:assert/strict";
import test from "node:test";
import { createEventSearchRequest, resolveEventSearchFilters } from "./index.js";

test("explicit event categories become structured filters", () => {
  assert.deepEqual(resolveEventSearchFilters("What's happening today for wellness?"), {
    categories: ["wellness"],
    audience: undefined,
    area: undefined,
  });
  assert.deepEqual(resolveEventSearchFilters("Any techno around Sri Thanu tonight?"), {
    categories: ["techno"],
    audience: undefined,
    area: "Sri Thanu",
  });
  assert.deepEqual(resolveEventSearchFilters("Live music for families tomorrow"), {
    categories: ["live_music"],
    audience: "family",
    area: undefined,
  });
});

test("broad event requests do not invent filters", () => {
  const request = createEventSearchRequest("What's happening tonight?", new Date("2026-07-22T05:00:00.000Z"));
  assert.equal(request.filters, undefined);
});
