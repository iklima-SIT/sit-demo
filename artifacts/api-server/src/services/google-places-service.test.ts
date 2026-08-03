import assert from "node:assert/strict";
import test from "node:test";
import { createInitialConversationState } from "@workspace/sit-engine";
import { createGooglePlacesRecommendationService } from "./google-places-service";

test("Google Places recommendations return named, grounded local options", async () => {
  let requestBody = "";
  const service = createGooglePlacesRecommendationService("test-key", async (_url, init) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ places: [{
      id: "real-place",
      displayName: { text: "Island Acai Kitchen" },
      formattedAddress: "Hinkong, Ko Pha-ngan",
      rating: 4.7,
      userRatingCount: 82,
      googleMapsUri: "https://maps.google.com/?cid=123",
      businessStatus: "OPERATIONAL",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const result = await service.recommend({
    query: "where can I find healty food like asai bowl?",
    area: "Hinkong",
    category: "restaurant",
  }, createInitialConversationState());

  assert.match(requestBody, /asai bowl/i);
  assert.match(result.answer, /Island Acai Kitchen/);
  assert.match(result.answer, /4\.7/);
  assert.match(result.answer, /maps\.google\.com/);
});
