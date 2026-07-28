import assert from "node:assert/strict";
import test from "node:test";
import { classifyEventExperience } from "./index.js";

test("Bhakti Kirtan is a spiritual practice with music as a secondary tag", () => {
  const result = classifyEventExperience({ title: "Bhakti Kirtan & Sacred Sound", venue: "Arcana" });

  assert.equal(result.primaryExperience, "spiritual_practice");
  assert.ok(result.secondaryTags.includes("music"));
  assert.ok(result.secondaryTags.includes("community"));
  assert.ok(result.secondaryTags.includes("meditation"));
  assert.ok(result.secondaryTags.includes("conscious"));
});

test("Ecstatic Dance is conscious dance with music, movement, and community tags", () => {
  const result = classifyEventExperience({ title: "Sunday Ecstatic Dance", venue: "Pyramid" });

  assert.equal(result.primaryExperience, "conscious_dance");
  assert.ok(result.secondaryTags.includes("music"));
  assert.ok(result.secondaryTags.includes("movement"));
  assert.ok(result.secondaryTags.includes("community"));
});

test("Acro Yoga is movement rather than music or yoga discovery", () => {
  const result = classifyEventExperience({ title: "Acro Yoga Jam", venue: "Labracadabra" });

  assert.equal(result.primaryExperience, "movement");
  assert.ok(result.secondaryTags.includes("community"));
  assert.ok(result.secondaryTags.includes("fitness"));
  assert.ok(!result.secondaryTags.includes("music"));
});

test("DJ sets and live performances are primary music experiences", () => {
  assert.equal(classifyEventExperience({ title: "Sunset DJ Set", venue: "Tiki Beach" }).primaryExperience, "music");
  assert.equal(classifyEventExperience({ title: "Acoustic Night: Live Music Performance", venue: "Rasta Home" }).primaryExperience, "music");
});
