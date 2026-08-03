import assert from "node:assert/strict";
import test from "node:test";
import { createInitialConversationState } from "@workspace/sit-engine";
import { createGeoapifyRecommendationService } from "./geoapify-service";

test("Geoapify recommendations return named local options and attribution", async () => {
  let requestedUrl = "";
  const service = createGeoapifyRecommendationService("test-key", async url => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ features: [{ properties: {
      name: "Island Acai Kitchen",
      formatted: "Hinkong, Ko Pha-ngan, Thailand",
      lat: 9.749,
      lon: 99.982,
      distance: 450,
      categories: ["catering.cafe"],
      catering: { cuisine: "acai;healthy" },
    } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const result = await service.recommend({
    query: "where can I find healty food like asai bowl?",
    area: "Hinkong",
    category: "restaurant",
  }, createInitialConversationState());

  assert.match(requestedUrl, /api\.geoapify\.com\/v2\/places/);
  assert.match(requestedUrl, /apiKey=test-key/);
  assert.match(result.answer, /Island Acai Kitchen/);
  assert.match(result.answer, /0\.5 km away/);
  assert.match(result.answer, /Powered by Geoapify/);
  assert.match(result.answer, /google\.com\/maps\/search/);
});

test("Geoapify failures fall back without inventing named venues", async () => {
  const service = createGeoapifyRecommendationService("test-key", async () => new Response("no", { status: 500 }));
  const result = await service.recommend({
    query: "healthy food",
    area: "Hinkong",
    category: "restaurant",
  }, createInitialConversationState());
  assert.match(result.answer, /Google Maps results/i);
  assert.doesNotMatch(result.answer, /Island Acai Kitchen/);
});
