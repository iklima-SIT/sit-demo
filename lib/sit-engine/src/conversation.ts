/**
 * SIT conversation engine — pure TypeScript, no framework dependencies.
 *
 * This module is the single source of truth for SIT's conversational logic.
 * It is imported by:
 *   - artifacts/api-server  (Twilio WhatsApp webhook)
 *
 * The React frontend (artifacts/sit-demo) contains an inline copy of this
 * logic in src/pages/chat.tsx. Any changes here should be kept in sync there.
 */

import type { UserContext, SITResponse, SITBrief } from "./types.js";

// ─── Parsing helpers ──────────────────────────────────────────────────────────

export function detectPurpose(t: string): string | undefined {
  if (/wellness|yoga|health|spiritual|retreat|meditation|healing|detox|cleanse|mindful|ceremony/.test(t)) return "wellness";
  if (/music|party|parties|dance|dj|full.?moon|nightlife|rave|festival|electronic/.test(t)) return "music";
  if (/work|remote|laptop|productivity|cowork|startup|digital.?nomad|freelan|build/.test(t)) return "remote-work";
  if (/romance|partner|love|honeymoon|couple|girlfriend|boyfriend|romantic/.test(t)) return "romance";
  if (/community|friends|belong|connect|tribe/.test(t)) return "community";
  if (/nature|jungle|beach|swim|hike|outdoor|island|waterfall/.test(t)) return "nature";
  if (/move|relocate|live here|settle|expat|emigrat|permanent/.test(t)) return "moving";
  if (/not.?sure|unsure|don.?t know|open|flexible|reset|escape|break|burnout|tired|overwhelm|change/.test(t)) return "unsure";
  return undefined;
}

export function detectDuration(t: string): string | undefined {
  if (/\b[345]\s*days?|\bfew days\b|long.?weekend/.test(t)) return "short";
  if (/\b(6|7|8|9|10)\s*days?|\bone\s*week|\b1\s*week/.test(t)) return "week";
  if (/\b(2|3|4)\s*weeks?|couple.?of?.?weeks|fortnight|10.?days/.test(t)) return "few-weeks";
  if (/\b(1|2|3)\s*months?|30.?days|60.?days/.test(t)) return "months";
  if (/long.?term|indefinite|moving|settling|permanent/.test(t)) return "long-term";
  return undefined;
}

export function detectScooter(t: string): string | undefined {
  if (/\byes\b|\bi do\b|i ride|i drive|can ride|comfortable|no problem|definitely/.test(t)) return "yes";
  if (/\bno\b|can.?t|don.?t ride|not comfortable|never ridden|afraid|too risky/.test(t)) return "no";
  if (/learn|trying|beginner|not confident|getting there/.test(t)) return "learning";
  if (/prefer not|taxi|grab|songthaew|rather not|avoid it/.test(t)) return "prefer-not";
  return undefined;
}

export function detectSociability(t: string): string | undefined {
  if (/alone|solo|myself|introvert|quiet|private|mostly.?alone|own.?pace/.test(t)) return "alone";
  if (/balanc|mix|both|middle|sometimes|depends|flexible/.test(t)) return "balanced";
  if (/social|people|meet|outgoing|extrovert|very.?social|love.?people|lots.?of/.test(t)) return "social";
  return undefined;
}

// ─── Acknowledgments ──────────────────────────────────────────────────────────

function ack(purpose: string): string {
  const map: Record<string, string> = {
    wellness: "A lot of people come here for exactly that.",
    music: "You've picked the right island for it.",
    "remote-work": "Smart call — the infrastructure here has gotten serious.",
    romance: "Koh Phangan delivers on that one, when you know where to look.",
    community: "This island is unusually good at building that kind of thing.",
    nature: "There's more of it than the Instagram version lets on.",
    moving: "Interesting. A few thousand people have made exactly that move.",
    unsure: "Honestly, that's a valid way to arrive. Sometimes the island decides for you.",
  };
  return map[purpose] ?? "Good to know.";
}

// ─── Core conversation function ───────────────────────────────────────────────

/**
 * processMessage — given a raw user message and the current conversation
 * context, returns SIT's next response and the updated context.
 *
 * This is the primary entry point called by both the WhatsApp webhook and
 * the frontend chat engine.
 */
export function processMessage(userMessage: string, ctx: UserContext): SITResponse {
  const t = userMessage.toLowerCase();
  const c: UserContext = { ...ctx, lastActiveAt: Date.now() };

  // Extract signals from every message, regardless of which question we asked.
  // This lets users answer multiple things at once ("I'm coming for wellness, 10 days").
  if (!c.purpose) c.purpose = detectPurpose(t);
  if (!c.duration) c.duration = detectDuration(t);
  if (!c.scooter) c.scooter = detectScooter(t);
  if (!c.sociability) c.sociability = detectSociability(t);

  c.exchangeCount++;

  // ── Step 1: Establish purpose ──────────────────────────────────────────────
  if (!c.purpose) {
    return {
      message: "I'm not quite reading where you're at yet. What's pulling you to Koh Phangan — wellness, work, music, nature, or something else?",
      suggestions: ["Wellness", "Music & parties", "Remote work", "Romance", "Community", "Nature", "Moving here", "Not sure yet"],
      updatedContext: c,
    };
  }

  // ── Step 2: Purpose-specific follow-up (asked once) ───────────────────────
  if (!c.purposeFollowUpAsked) {
    c.purposeFollowUpAsked = true;
    const a = ack(c.purpose);
    const followUps: Record<string, { message: string; suggestions?: string[] }> = {
      wellness: {
        message: `${a} What draws you specifically — rest, spirituality, personal growth, or something more physical?`,
        suggestions: ["Rest & relaxation", "Spirituality", "Personal growth", "Physical health", "A mix"],
      },
      music: {
        message: `${a} Are you chasing great music, the social energy, or the all-night experience?`,
        suggestions: ["Great music", "Social energy", "All-night parties", "All of it"],
      },
      "remote-work": {
        message: `${a} Are you already productive working remotely, or are you hoping the island helps you find a better rhythm?`,
        suggestions: ["Already productive", "Looking for a better routine", "Bit of both"],
      },
      romance: {
        message: `${a} Are you traveling with a partner, or coming solo with that in mind?`,
        suggestions: ["With a partner", "Solo, open to it"],
      },
      community: {
        message: `${a} What kind of community matters to you — creative, spiritual, wellness-focused, entrepreneurial, or just genuine human connection?`,
        suggestions: ["Creative", "Spiritual", "Wellness", "Entrepreneurial", "Human connection"],
      },
      nature: {
        message: `${a} What's your speed — active (hiking, swimming), or more contemplative (sunsets, quiet beaches)?`,
        suggestions: ["Active — hiking & swimming", "Contemplative — sunsets & quiet", "Both"],
      },
      moving: {
        message: `${a} What do you hope will actually be different in your life if you make the move?`,
      },
      unsure: {
        message: `${a} Are you more in need of genuine rest, or are you hoping something will happen here?`,
        suggestions: ["Genuine rest", "Looking for something to happen", "Somewhere between the two"],
      },
    };
    return { ...(followUps[c.purpose] ?? { message: "Tell me more about what you're hoping for." }), updatedContext: c };
  }

  // ── Step 3: Duration ───────────────────────────────────────────────────────
  if (!c.duration && !c.durationAsked) {
    c.durationAsked = true;
    return {
      message: "How long are you here for?",
      suggestions: ["3–5 days", "1 week", "2–4 weeks", "1–3 months", "Long-term"],
      updatedContext: c,
    };
  }

  // ── Step 4: Scooter ────────────────────────────────────────────────────────
  if (!c.scooter && !c.scooterAsked) {
    c.scooterAsked = true;
    return {
      message: "Do you ride a scooter?",
      suggestions: ["Yes", "No", "Still learning", "I'd rather not"],
      updatedContext: c,
    };
  }

  // ── Step 5: Sociability ────────────────────────────────────────────────────
  if (!c.sociability && !c.sociabilityAsked) {
    c.sociabilityAsked = true;
    return {
      message: "One more thing — how social do you want this trip to be?",
      suggestions: ["Mostly on my own", "Balanced", "Very social"],
      updatedContext: c,
    };
  }

  // ── Step 6: Generate the SIT Brief ────────────────────────────────────────
  // Triggered after at least 4 exchanges with purpose established.
  // buildBrief() uses the accumulated context to generate the personalized brief.
  if (c.purpose && c.exchangeCount >= 4 && !c.briefGenerated) {
    c.briefGenerated = true;
    return {
      message: "I think I have a clear enough picture. Let me put your SIT Brief together.",
      briefReady: true,
      updatedContext: c,
    };
  }

  // ── Step 7: Open-ended post-brief conversation ─────────────────────────────
  const ongoing = [
    "What else is on your mind about the trip?",
    "That's a fair question. What's driving it for you?",
    "Makes sense. Anything specific you want me to factor into your plan?",
    "Worth thinking about. What matters most to you there?",
    "Good point. Is there anything else I should know?",
  ];
  return {
    message: ongoing[c.exchangeCount % ongoing.length],
    updatedContext: c,
  };
}

// ─── Brief builder ────────────────────────────────────────────────────────────

/**
 * buildBrief — generates a personalized SIT Brief from the accumulated
 * UserContext. Called after processMessage returns { briefReady: true }.
 *
 * On the frontend this renders as a rich card (BriefCard component).
 * On the WhatsApp webhook the result is formatted as plain text by
 * formatBriefForWhatsApp() in the route handler.
 */
export function buildBrief(ctx: UserContext): SITBrief {
  const lookingForMap: Record<string, string> = {
    wellness: "You're looking for a genuine reset — not just a spa break, but something that actually shifts how you feel. Koh Phangan has the infrastructure for that, but the quality gap between good and bad is wide. The right experience here can be transformative.",
    music: "You want to be somewhere that feels alive — good music, interesting people, and a scene that goes beyond the obvious. Koh Phangan has that, but you have to know where to look past the Full Moon narrative.",
    "remote-work": "You're looking for a base that works — reliable internet, an environment that doesn't drain you, and enough stimulation to stay motivated. The challenge isn't finding those things here; it's managing the pull of everything else the island offers.",
    romance: "You're looking for an environment that naturally creates the conditions for connection — beautiful, unhurried, and soft enough to let something real happen. Koh Phangan can do that, if you stay in the right area.",
    community: "You're looking to belong to something while you're here — not just meet people, but actually feel like you're part of a scene. That's more achievable on Koh Phangan than most places, because the community is unusually porous.",
    nature: "You want the island that's actually there, not the filtered version. Real beaches, real jungle, and the kind of quiet you can't find in a resort. That Koh Phangan absolutely exists — it's just not on the main road.",
    moving: "You're not just visiting — you're evaluating. You want to know if this is a place you could actually build a life. That's a different question from whether you enjoy a holiday, and it requires a different kind of investigation.",
    unsure: "You're open, which is actually the best way to arrive. You're looking for something — you're just not sure what it is yet. Koh Phangan tends to show you quickly. The people who thrive here are usually the ones who don't have a rigid plan.",
  };

  const lookingFor = lookingForMap[ctx.purpose ?? "unsure"] ?? lookingForMap["unsure"]!;

  const avoid: string[] = [];
  if (ctx.scooter === "no" || ctx.scooter === "prefer-not") {
    avoid.push("Accommodation in remote areas — without a scooter, transport costs become a daily friction that compounds fast");
  }
  if (ctx.purpose === "wellness") {
    avoid.push("Booking ceremonies or retreats without researching the facilitator — the quality range here is extreme");
    avoid.push("Wellness packages marketed heavily online — the best teachers rarely need to advertise hard");
  }
  if (ctx.purpose === "music") {
    avoid.push("Planning your whole trip around Full Moon — it's a party, not a music festival, and most serious music happens on other nights");
    avoid.push("Judging the island's music scene by Haad Rin alone — that's the smallest slice of what's here");
  }
  if (ctx.purpose === "remote-work") {
    avoid.push("Expecting full productivity from day one — the first two weeks here are almost always an adjustment period");
  }
  if (ctx.sociability === "alone") {
    avoid.push("Party areas if you value peace — Haad Rin doesn't sleep");
  }
  if (avoid.length === 0) {
    avoid.push("Tourist traps around Haad Rin during peak season — quality drops and prices don't");
    avoid.push("Rushing to cover the whole island — depth beats coverage here");
  }

  let stayArea: string;
  if (ctx.scooter === "no" || ctx.scooter === "prefer-not") {
    stayArea = "Srithanu or Thong Sala — both walkable, both coastal, both have everything you need within reach. Don't let anyone convince you to book remotely without a scooter.";
  } else {
    const areaMap: Record<string, string> = {
      wellness: "Srithanu — the island's wellness hub. Most of what you're after is within five minutes of each other, with good cafés and a quieter, intentional energy.",
      music: "Baan Tai or Haad Rin — depending on how deep into the scene you want to go. Baan Tai puts you near the jungle venues; Haad Rin is closer to the classic energy.",
      romance: "Hinkong — quieter, more intimate, and the sunsets are genuinely world-class. Worth the extra few minutes from town.",
      "remote-work": "Srithanu or Thong Sala — both have reliable wifi, coworking options, and enough café culture to keep you functional on long work days.",
      community: "Srithanu — that's where the recurring events, yoga classes, and social circles concentrate. Proximity to the action matters here.",
      nature: "North coast — Ban Tai, Chaloklum, or the hills above Srithanu. You'll wake up in it rather than drive to it.",
      moving: "Don't commit to one area on arrival. Spend time in Srithanu, Thong Sala, and the north coast before deciding where you'd actually live.",
    };
    stayArea = areaMap[ctx.purpose ?? ""] ?? "Srithanu — versatile, beautiful, and a strong base for most intentions. Easy to expand from once you have your bearings.";
  }

  const experienceMap: Record<string, string[]> = {
    wellness: [
      "One week at a reputable yoga school — consistency matters more than intensity",
      "A cacao or sound healing session with a vetted facilitator",
      "Daily morning swim at a quiet beach before the heat sets in",
      "At least three days with no agenda — let the island suggest things",
    ],
    music: [
      "A sunset gathering at Secret Mountain or similar — this is where the real music scene lives",
      "At least one Ecstatic Dance — no alcohol, no phones, a completely different energy from a party",
      "One quiet evening at a beach bar to balance the intensity",
      "Follow the artists, not the venues — the best nights are announced last minute",
    ],
    "remote-work": [
      "Lock down a coworking space with reliable internet in week one — don't try to work from cafés full-time",
      "Build one recurring activity into your schedule from the start — yoga, beach sport, anything social",
      "Take at least one full day off per week — overworking here is common and counterproductive",
      "Attend a coworking social event — the quality of people working on this island is unusually high",
    ],
    romance: [
      "Sunset at Hinkong — at low tide, a sunset picnic on the flats; at high tide, SUP out at golden hour",
      "A private longtail boat trip to a quiet beach, arrangeable for $50–80",
      "Dinner in Thong Sala proper — one good evening in town changes the texture of the trip",
    ],
    community: [
      "Find one recurring class and go every single time — yoga, dance, breathwork, anything",
      "Sunset gatherings — they repeat weekly and the same faces show up",
      "A coworking space membership even if you're not working — the social value is worth it",
      "Women's circles or men's groups if that resonates — both are active and well-run here",
    ],
    nature: [
      "Jungle hike to the viewpoint — underrated and genuinely undercrowded",
      "Swimming at Haad Yuan or Thong Nai Pan Noi — swimmable, beautiful, and quieter than the famous spots",
      "Snorkel trip to Sail Rock if you dive at all — one of Southeast Asia's best sites",
      "One night somewhere with no light pollution — the sky is remarkable",
    ],
    moving: [
      "Spend time in three different areas before deciding where you'd live — they feel entirely different",
      "Visit during a regular week, not Full Moon — that's not what daily life here looks like",
      "Connect with long-term expats, not tourists — they'll give you the real picture",
      "Try a co-living space as a testing ground before committing to a rental",
    ],
    unsure: [
      "Give yourself the first 2–3 days with no agenda at all",
      "A sunset gathering to feel the social energy of the island",
      "One beach that nobody told you to go to — ask a local",
      "Eat where there are no menus in English",
    ],
  };

  const experiences = experienceMap[ctx.purpose ?? "unsure"] ?? experienceMap["unsure"]!;

  const insightMap: Record<string, string> = {
    wellness: "Ecstatic Dance is the most misunderstood event on the island. Most people avoid it thinking it's a party. It's not — no alcohol, no phones, complete presence. It can be one of the most disarming experiences here.",
    music: "Full Moon is the island's biggest marketing asset and its most overrated event. The people who know Koh Phangan's music scene properly often skip it entirely. The real nights happen on a Tuesday with 200 people who actually care about the music.",
    "remote-work": "Productivity usually drops for the first 2–3 weeks, then exceeds where you started. People who expect day-one output tend to leave frustrated. The ones who give it time often extend their stay by months.",
    romance: "Hinkong at low tide has a specific silence that's rare on a tourist island. The shallow water extends hundreds of metres and the light at 5pm is unlike anywhere else. It's one of those places that actually delivers.",
    community: "Community here forms around recurrence, not events. Showing up once builds nothing. Showing up to the same yoga class three times a week — that's where the real connections happen.",
    nature: "There are beaches on the north coast that don't appear on any major travel site. They're swimmable, quiet, and genuinely beautiful. Ask a local who's been here longer than a season — not a hotel.",
    moving: "The first year of moving to Koh Phangan is a honeymoon. The second is when the real picture appears. The people who make it work long-term treat it like a real base — with structure, purpose, and income.",
    unsure: "People often arrive at Koh Phangan not knowing what they need. A surprising number leave knowing exactly who they want to become. It's what happens when you slow down enough to hear yourself.",
  };

  const localInsight = insightMap[ctx.purpose ?? "unsure"] ?? insightMap["unsure"]!;

  return { lookingFor, avoid, stayArea, experiences, localInsight };
}
