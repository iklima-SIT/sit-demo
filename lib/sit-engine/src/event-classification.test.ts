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

test("event classifications expose the human needs they may support", () => {
  const yoga = classifyEventExperience({ title: "Sunset Yin Yoga", venue: "Orion Healing" });
  const community = classifyEventExperience({ title: "Community Gathering", venue: "Sri Thanu" });

  assert.deepEqual(yoga.humanNeeds, ["burnout", "relaxation", "healing", "reset"]);
  assert.deepEqual(community.humanNeeds, ["connection", "belonging"]);
  assert.match(yoga.humanNeedReason, /relaxation/);
});

test("a sound bath is wellness even when its title mentions the full moon", () => {
  const result = classifyEventExperience({ title: "Full Moon Sound Bath", venue: "Sabai Yin Yogashala" });

  assert.equal(result.primaryExperience, "wellness");
  assert.ok(result.humanNeeds.includes("healing"));
});

test("Todo.Today yoga class names remain primary yoga without repeating the word yoga", () => {
  assert.equal(classifyEventExperience({ title: "Yin & Restorative w/ Jimmy", sourceCategory: "Wellness" }).primaryExperience, "yoga");
  assert.equal(classifyEventExperience({ title: "Vinyasa Flow w/ Fah", sourceCategory: "Wellness" }).primaryExperience, "yoga");
  assert.equal(classifyEventExperience({ title: "Hatha of Breath w/ Warren", sourceCategory: "Wellness" }).primaryExperience, "yoga");
});

test("Todo.Today taxonomy supplies primary experience and human need when the title is ambiguous", () => {
  const music = classifyEventExperience({ title: "Mystic Bloom", sourceCategory: "Music" });
  const social = classifyEventExperience({ title: "Connect in Awareness", sourceCategory: "Community & Social" });
  const tantra = classifyEventExperience({ title: "Path of Awakening", sourceCategory: "Tantra & Sensual Arts" });

  assert.equal(music.primaryExperience, "music");
  assert.ok(music.humanNeeds.includes("celebration"));
  assert.equal(social.primaryExperience, "community");
  assert.ok(social.humanNeeds.includes("belonging"));
  assert.equal(tantra.primaryExperience, "spiritual_practice");
  assert.ok(tantra.humanNeeds.includes("healing"));
});
