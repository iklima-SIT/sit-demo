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
    wellness:      "Good choice.",
    music:         "Right island for it.",
    "remote-work": "Smart — the infrastructure here is solid.",
    romance:       "Right place, if you know where to go.",
    community:     "This island is unusually good at that.",
    nature:        "More of it than the Instagram version suggests.",
    moving:        "Interesting. A few thousand people have made that move.",
    unsure:        "That's a valid way to arrive.",
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
      message: "What's bringing you to Koh Phangan?",
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
        message: `${a} What specifically — rest, spirituality, personal growth, or something physical?`,
        suggestions: ["Rest", "Spirituality", "Personal growth", "Physical health", "A mix"],
      },
      music: {
        message: `${a} Music, social energy, or the all-night experience?`,
        suggestions: ["Great music", "Social energy", "All-night parties", "All of it"],
      },
      "remote-work": {
        message: `${a} Already productive remotely, or looking for a better rhythm?`,
        suggestions: ["Already productive", "Need a better routine", "Bit of both"],
      },
      romance: {
        message: `${a} Traveling with a partner, or solo?`,
        suggestions: ["With a partner", "Solo"],
      },
      community: {
        message: `${a} What type — creative, spiritual, wellness, or just genuine connection?`,
        suggestions: ["Creative", "Spiritual", "Wellness", "Entrepreneurial", "Human connection"],
      },
      nature: {
        message: `${a} Active (hiking, swimming) or contemplative (sunsets, quiet beaches)?`,
        suggestions: ["Active", "Contemplative", "Both"],
      },
      moving: {
        message: `${a} What needs to be different in your life if you make the move?`,
      },
      unsure: {
        message: `${a} Need genuine rest, or hoping something will happen here?`,
        suggestions: ["Genuine rest", "Looking for something", "Somewhere between"],
      },
    };
    return { ...(followUps[c.purpose] ?? { message: "Tell me more." }), updatedContext: c };
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
    wellness:      "A genuine reset — not a spa break. The quality gap here is extreme, so where you go matters.",
    music:         "Somewhere that feels alive beyond Full Moon. The real scene exists — you just have to know where to look.",
    "remote-work": "A base that actually works. The infrastructure is there; managing the island's pull on your focus is the challenge.",
    romance:       "Beautiful, unhurried, off the main drag. Koh Phangan delivers — in the right area.",
    community:     "To actually belong somewhere, not just pass through. More achievable here than most places.",
    nature:        "The real island, not the filtered version. Quiet beaches, actual jungle — it exists.",
    moving:        "To evaluate, not just visit. That's a different question and needs a different approach.",
    unsure:        "You're open. That's the best way to arrive — the island tends to show you quickly.",
  };

  const lookingFor = lookingForMap[ctx.purpose ?? "unsure"] ?? lookingForMap["unsure"]!;

  const avoid: string[] = [];
  if (ctx.scooter === "no" || ctx.scooter === "prefer-not") {
    avoid.push("Remote accommodation — transport costs compound fast without a scooter");
  }
  if (ctx.purpose === "wellness") {
    avoid.push("Unresearched ceremonies or retreats — quality range is extreme");
    avoid.push("Heavily marketed wellness packages — good teachers don't need to advertise hard");
  }
  if (ctx.purpose === "music") {
    avoid.push("Planning everything around Full Moon — it's a party, not a music festival");
    avoid.push("Judging the scene by Haad Rin — that's the smallest slice");
  }
  if (ctx.purpose === "remote-work") {
    avoid.push("Expecting full productivity in week one — adjustment period is real");
  }
  if (ctx.sociability === "alone") {
    avoid.push("Haad Rin — it doesn't sleep");
  }
  if (avoid.length === 0) {
    avoid.push("Haad Rin tourist traps — quality drops, prices don't");
    avoid.push("Trying to cover the whole island — depth beats coverage");
  }

  let stayArea: string;
  if (ctx.scooter === "no" || ctx.scooter === "prefer-not") {
    stayArea = "Srithanu or Thong Sala — walkable, coastal, everything within reach. Don't book remotely without a scooter.";
  } else {
    const areaMap: Record<string, string> = {
      wellness:      "Srithanu — the wellness hub. Everything within 5 minutes, quieter energy.",
      music:         "Baan Tai (jungle venues) or Haad Rin (classic scene) — depends how deep you want to go.",
      romance:       "Hinkong — quiet, intimate, world-class sunsets.",
      "remote-work": "Srithanu or Thong Sala — reliable wifi, coworking, good cafés.",
      community:     "Srithanu — recurring events and social circles concentrate here.",
      nature:        "North coast — Chaloklum or the hills above Srithanu. Wake up in it.",
      moving:        "Don't commit on arrival. Try three areas before deciding.",
    };
    stayArea = areaMap[ctx.purpose ?? ""] ?? "Srithanu — versatile base, easy to expand from.";
  }

  const experienceMap: Record<string, string[]> = {
    wellness: [
      "One week at a reputable yoga school — consistency beats intensity",
      "Cacao or sound healing with a vetted facilitator",
      "Daily morning swim before the heat hits",
      "3 days with zero agenda",
    ],
    music: [
      "Sunset gathering at Secret Mountain — that's where the serious music crowd is",
      "One jungle party midweek — smaller, better music, fewer tourists",
      "One beach bar evening to find the slower social side of the island",
      "Follow artists on Instagram, not venues — the best nights are announced same-day",
    ],
    "remote-work": [
      "Lock in coworking with reliable internet in week one",
      "One recurring activity from day one — yoga, sport, anything social",
      "At least one full day off per week",
      "Attend a coworking social — the people here are unusually good",
    ],
    romance: [
      "Sunset at Hinkong — low tide picnic or SUP at golden hour",
      "Private longtail to a quiet beach (~$60)",
      "One proper dinner in Thong Sala town",
    ],
    community: [
      "One recurring class — go every single time",
      "Weekly sunset gatherings — same faces, real connections",
      "Coworking membership even if you're not working",
      "Women's or men's circles if that resonates — both well-run",
    ],
    nature: [
      "Jungle hike to the viewpoint — genuinely undercrowded",
      "Haad Yuan or Thong Nai Pan Noi — swimmable and quiet",
      "Sail Rock snorkel trip — one of SE Asia's best sites",
      "One night with no light pollution",
    ],
    moving: [
      "3 areas minimum before deciding where to live",
      "Visit during a normal week — not Full Moon",
      "Talk to long-term expats, not tourists",
      "Try co-living before committing to a rental",
    ],
    unsure: [
      "First 2–3 days: no agenda",
      "One sunset gathering",
      "One beach nobody told you about — ask a local",
      "Eat where there's no English menu",
    ],
  };

  const experiences = experienceMap[ctx.purpose ?? "unsure"] ?? experienceMap["unsure"]!;

  const insightMap: Record<string, string> = {
    wellness:      "Ecstatic Dance is the most misunderstood event here. No alcohol, no phones — nothing like what people expect.",
    music:         "Full Moon is the island's most marketed and most overrated night. The real music happens on a Tuesday with 200 people who actually care.",
    "remote-work": "Most people are less productive in the first two weeks. The ones who give it time often extend their stay by months.",
    romance:       "Hinkong at low tide is one of those rare places that actually delivers what travel photos promise.",
    community:     "Community here forms around recurrence, not events. Show up to the same class three times a week — that's the only strategy that works.",
    nature:        "The best beaches aren't on any travel site. Ask a local who's been here longer than a season.",
    moving:        "Year one is a honeymoon. Year two is when the real picture appears.",
    unsure:        "A surprising number of people arrive not knowing what they need — and leave knowing exactly who they want to become.",
  };

  const localInsight = insightMap[ctx.purpose ?? "unsure"] ?? insightMap["unsure"]!;

  return { lookingFor, avoid, stayArea, experiences, localInsight };
}
