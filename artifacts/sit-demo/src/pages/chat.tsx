import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Upload, Database, X } from "lucide-react";
import { useLocation } from "wouter";
import type { KeyboardEvent, ChangeEvent } from "react";
import {
  type KBCard,
  EMBEDDED_KB,
  searchKBWithScore,
  parseXlsxToCards,
} from "@/lib/knowledge-base";

// ─── Types ───────────────────────────────────────────────────────────────────

type Sender = "sit" | "user";

interface TextMessage {
  id: string;
  type: "text";
  sender: Sender;
  text: string;
  timestamp: Date;
}

interface BriefMessage {
  id: string;
  type: "brief";
  sender: "sit";
  brief: SITBrief;
  timestamp: Date;
}

type Message = TextMessage | BriefMessage;

interface SITBrief {
  lookingFor: string;
  avoid: string[];
  stayArea: string;
  experiences: string[];
  localInsight: string;
}

interface UserContext {
  purpose?: string;
  purposeFollowUpAsked: boolean;
  duration?: string;
  durationAsked: boolean;
  scooter?: string;
  scooterAsked: boolean;
  sociability?: string;
  sociabilityAsked: boolean;
  exchangeCount: number;
  briefGenerated: boolean;
}

interface SITResponse {
  message: string;
  suggestions?: string[];
  briefReady?: boolean;
  updatedContext: UserContext;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function detectPurpose(t: string): string | undefined {
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

function detectDuration(t: string): string | undefined {
  if (/\b[345]\s*days?|\bfew days\b|long.?weekend/.test(t)) return "short";
  if (/\b(6|7|8|9|10)\s*days?|\bone\s*week|\b1\s*week/.test(t)) return "week";
  if (/\b(2|3|4)\s*weeks?|couple.?of?.?weeks|fortnight|10.?days/.test(t)) return "few-weeks";
  if (/\b(1|2|3)\s*months?|30.?days|60.?days/.test(t)) return "months";
  if (/long.?term|indefinite|moving|settling|permanent/.test(t)) return "long-term";
  return undefined;
}

function detectScooter(t: string): string | undefined {
  if (/\byes\b|\bi do\b|i ride|i drive|can ride|comfortable|no problem|definitely/.test(t)) return "yes";
  if (/\bno\b|can.?t|don.?t ride|not comfortable|never ridden|afraid|too risky/.test(t)) return "no";
  if (/learn|trying|beginner|not confident|getting there/.test(t)) return "learning";
  if (/prefer not|taxi|grab|songthaew|rather not|avoid it/.test(t)) return "prefer-not";
  return undefined;
}

function detectSociability(t: string): string | undefined {
  if (/alone|solo|myself|introvert|quiet|private|mostly.?alone|own.?pace/.test(t)) return "alone";
  if (/balanc|mix|both|middle|sometimes|depends|flexible/.test(t)) return "balanced";
  if (/social|people|meet|outgoing|extrovert|very.?social|love.?people|lots.?of/.test(t)) return "social";
  return undefined;
}

// ─── Intent Classification ───────────────────────────────────────────────────

/**
 * Returns true when the user is asking for a DEFINITION of something —
 * "What is X?", "Explain X", "Tell me about X" — with no time reference.
 * These should never trigger live event search.
 */
function isDefinitionQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/\b(tonight|today|this week|this weekend|right now|happening now|what.?s on)\b/.test(t)) return false;
  return /^(what is|what'?s a |what are|explain|describe|tell me (what|about)|how does|what do you mean|define)\b/i.test(t);
}

/**
 * Returns true when the user is asking what is happening RIGHT NOW or tonight/today.
 * Only fires on explicit temporal + event signals — never on definition questions.
 */
function isEventQuery(text: string): boolean {
  if (isDefinitionQuestion(text)) return false;
  const t = text.toLowerCase();
  // Must have a temporal signal OR an explicit "what's on / what's happening" phrase
  const temporal = /\b(tonight|today|this (week|weekend|evening)|right now|happening now|what'?s on|what is on|what'?s going on|what'?s happening)\b/.test(t);
  // Must have event intent
  const eventIntent = /\b(event|events|party|parties|on|going on|happening|schedule|agenda|live|music|show)\b/.test(t);
  return temporal && eventIntent || /\b(what'?s on|what is on|any (events|parties|shows) (tonight|today))\b/.test(t);
}

async function searchEvents(query: string): Promise<{ response: string | null; fallback: boolean }> {
  try {
    const res = await fetch("/api/events/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { response: null, fallback: true };
    return (await res.json()) as { response: string | null; fallback: boolean };
  } catch {
    return { response: null, fallback: true };
  }
}

function getEventInsight(purpose?: string): string {
  const map: Record<string, string> = {
    wellness:      "Morning events and sound healing nights are where the wellness crowd goes. Skip Haad Rin entirely.",
    music:         "Full Moon is the most marketed and often the least interesting night. The jungle parties midweek are where serious music happens.",
    romance:       "Sunset beach gatherings around Hinkong are the right pace. Avoid Haad Rin if atmosphere matters.",
    community:     "Recurring weekly events are how the island works. Show up twice and you'll start recognising faces.",
    "remote-work": "One social event per week is enough — the coworking crowd and the nomad meetups are your best options.",
    nature:        "Sunrise beach swims and the occasional jungle hike meetup happen spontaneously — ask locally.",
    moving:        "Weekly recurring events attract long-term residents, not tourists. That's your crowd.",
    unsure:        "When in doubt, find a sunset gathering first. Low pressure, good mix of people, easy to leave.",
  };
  return map[purpose ?? "unsure"] ?? map["unsure"]!;
}

function buildEventFallback(): string {
  return [
    "I couldn't verify tonight's schedule.",
    "",
    "Places I'd check first:",
    "",
    "• Secret Mountain — sunset gatherings & jungle music",
    "• Agama Yoga — community events & workshops",
    "• Srithanu beachfront — weekly Ecstatic Dance (usually Sundays)",
    "• Orion Healing — retreats & plant medicine ceremonies",
    "• Haad Rin — live music nightly (louder, more touristy)",
    "",
    "Local Insight:",
    "Best nights are announced same-day. Follow venue Instagram pages for last-minute events.",
  ].join("\n");
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

// ─── Conversation Engine ──────────────────────────────────────────────────────

function processMessage(userMessage: string, ctx: UserContext): SITResponse {
  const t = userMessage.toLowerCase();
  const c = { ...ctx };

  if (!c.purpose) c.purpose = detectPurpose(t);
  if (!c.duration) c.duration = detectDuration(t);
  if (!c.scooter) c.scooter = detectScooter(t);
  if (!c.sociability) c.sociability = detectSociability(t);

  c.exchangeCount++;

  if (!c.purpose) {
    return {
      message: "What's bringing you to Koh Phangan?",
      suggestions: ["Wellness", "Music & parties", "Remote work", "Romance", "Community", "Nature", "Moving here", "Not sure yet"],
      updatedContext: c,
    };
  }

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
    const fu = followUps[c.purpose] ?? { message: "Tell me more." };
    return { ...fu, updatedContext: c };
  }

  if (!c.duration && !c.durationAsked) {
    c.durationAsked = true;
    return {
      message: "How long are you here for?",
      suggestions: ["3–5 days", "1 week", "2–4 weeks", "1–3 months", "Long-term"],
      updatedContext: c,
    };
  }

  if (!c.scooter && !c.scooterAsked) {
    c.scooterAsked = true;
    return {
      message: "Do you ride a scooter?",
      suggestions: ["Yes", "No", "Still learning", "I'd rather not"],
      updatedContext: c,
    };
  }

  if (!c.sociability && !c.sociabilityAsked) {
    c.sociabilityAsked = true;
    return {
      message: "One more thing — how social do you want this trip to be?",
      suggestions: ["Mostly on my own", "Balanced", "Very social"],
      updatedContext: c,
    };
  }

  const hasEnough = c.purpose && c.exchangeCount >= 4;
  if (hasEnough && !c.briefGenerated) {
    c.briefGenerated = true;
    return {
      message: "I think I have a clear enough picture. Let me put your SIT Brief together.",
      briefReady: true,
      updatedContext: c,
    };
  }

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

// ─── Brief Builder ────────────────────────────────────────────────────────────

function buildBrief(ctx: UserContext): SITBrief {
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

  const lookingFor = lookingForMap[ctx.purpose ?? "unsure"] ?? lookingForMap.unsure!;

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

  const experiences = experienceMap[ctx.purpose ?? "unsure"] ?? experienceMap.unsure!;

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

  const localInsight = insightMap[ctx.purpose ?? "unsure"] ?? insightMap.unsure!;

  return { lookingFor, avoid, stayArea, experiences, localInsight };
}

// ─── Mode detection ───────────────────────────────────────────────────────────
//
// DISCOVERY MODE — SIT is gathering context (purpose, duration, scooter, sociability).
//   KB cards are NEVER injected here. The conversation is focused and intentional.
//
// LOCAL EXPERT MODE — user has asked a direct question (or brief is generated).
//   KB cards are used ONLY when the relevance score clears the minimum threshold.
//   If no card clears the bar, SIT gives an honest answer and redirects.

/** Minimum relevance score a KB card must hit to appear in an expert response. */
const EXPERT_SCORE_MIN = 5;

/** Returns true if the message looks like a direct question the user expects answered. */
function isDirectQuestion(text: string): boolean {
  if (text.includes("?")) return true;
  return /^(what|where|when|how|who|which|is there|are there|can i|do you|is it|tell me about|recommend|suggest|any |does |will |should |could |find me|show me)/i.test(text.trim());
}

/** Clips raw KB prose to at most N sentences so it never becomes an essay. */
function firstSentences(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences.slice(0, n).join(" ").trim();
}

/**
 * Returns true if a KB card clearly belongs to a conflicting purpose category.
 * Used to prevent wellness cards surfacing for music users, etc.
 */
function isOffPurposeCard(card: KBCard, purpose: string): boolean {
  const cat = card.category.toLowerCase();
  const topic = card.topic.toLowerCase();
  if (purpose === "music") {
    return /yoga|ecstatic.?dance|meditation|breathwork|cacao|tantra|plant.?medicine|ceremony|sound.?healing|retreat|spiritual/.test(cat + " " + topic);
  }
  if (purpose === "wellness") {
    return /party.?intelligence|music.?intelligence|full.?moon|nightlife/.test(cat);
  }
  return false;
}

/**
 * Tries to build a direct, KB-backed answer to the user's question.
 * Format: short answer → bullet points if available → one-line local insight.
 * Returns null if no card clears the relevance threshold.
 */
function buildExpertAnswer(
  question: string,
  hits: { card: KBCard; score: number }[],
  purpose?: string
): string | null {
  const q = question.toLowerCase();
  // Filter out cards that clearly contradict the user's purpose
  const purposeFiltered = purpose
    ? hits.filter(h => !isOffPurposeCard(h.card, purpose))
    : hits;
  const strong = purposeFiltered.filter(h => h.score >= EXPERT_SCORE_MIN);

  // ── Real-time questions we genuinely can't answer ─────────────────────────
  if (/tonight|today|this week|what.?s on|happening now|event|schedule|lineup|right now/.test(q)) {
    const eventCard = strong.find(h =>
      /music|party|event|dance|dj|techno|house/.test(h.card.category.toLowerCase())
    );
    const insight = eventCard ? firstSentences(eventCard.card.localInsight || eventCard.card.description, 2) : null;
    if (insight && insight.length > 20) {
      return `No live event feed — I can't tell you what's on tonight.\n\n${insight}\n\nLocal insight:\nThe best nights are rarely the biggest ones — follow the artists, not the venues.`;
    }
    return null;
  }

  if (strong.length === 0) return null;

  const top = strong[0].card;

  // Build bullet points from bestFor field if it has structured data
  const bullets = top.bestFor
    ? top.bestFor.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2).slice(0, 4)
    : [];

  const mainAnswer = firstSentences(top.localInsight || top.description, 2);
  if (!mainAnswer || mainAnswer.length < 20) return null;

  const insightLine = top.localSecret
    ? firstSentences(top.localSecret, 1)
    : firstSentences(top.localInsight || top.description, 1);

  if (bullets.length >= 2) {
    return `${top.topic}:\n${bullets.map(b => `• ${b}`).join("\n")}\n\nLocal insight:\n${insightLine}`;
  }

  return `${mainAnswer}\n\nLocal insight:\n${insightLine}`;
}

/**
 * Honest fallback when KB has no high-relevance answer.
 * Short, direct, always ends with a redirect or question.
 */
function buildHonestFallback(question: string): string {
  const q = question.toLowerCase();

  if (/tonight|today|what.?s on|happening|event|schedule|lineup/.test(q)) {
    return "No live event feed — I can't tell you what's on right now.\n\nTell me what you're after:\n• Electronic / techno / house\n• Live band music\n• Sunset social gathering\n• Quieter bar scene\n\nI'll point you to the right type of venue.";
  }
  if (/cost|price|how much|expensive|cheap|budget/.test(q)) {
    return "Rough daily costs:\n• Budget: $30–50\n• Mid-range: $60–100\n• Comfortable: $100–150+\n\nLocal insight:\nAccommodation near the main areas is 30% cheaper if you book direct.";
  }
  if (/safe|dangerous|crime|scam/.test(q)) {
    return "Generally safe. Main risks:\n• Scooter accidents\n• Petty theft at Full Moon\n• Dodgy ceremony facilitators\n\nAnything specific you're worried about?";
  }
  if (/weather|rain|season|monsoon|best time/.test(q)) {
    return "Best months:\n• Feb – Aug: dry, sunny\n• Sep – Oct: occasional rain\n• Nov – Dec: rough — heavy rain, choppy seas\n\nWhen are you planning to come?";
  }
  if (/visa|stay|how long|legal/.test(q)) {
    return "Visa basics:\n• 30 days on arrival (most passports)\n• +30 day extension at Thong Sala immigration\n• Longer stays need a proper Thai visa\n\nWhat's your nationality?";
  }
  if (/sim|internet|wifi|data/.test(q)) {
    return "Connectivity:\n• AIS or DTAC — both solid coverage\n• Monthly SIM with unlimited data: ~$15–20\n• Most coworking spaces and cafés have reliable wifi\n\nAre you planning to work remotely?";
  }
  if (/food|eat|restaurant|cafe|coffee/.test(q)) {
    return "Food breakdown:\n• Street food: $2–5 per meal\n• Local restaurants: $5–10\n• Western / health cafés: $8–15\n\nLocal insight:\nThe best spots rarely have English menus out front.";
  }
  return "I don't have a specific answer for that. Tell me more and I'll give you what I do know.";
}

// ─── Brief Card ───────────────────────────────────────────────────────────────

function BriefCard({ brief }: { brief: SITBrief }) {
  return (
    <div className="bg-gradient-to-b from-primary/12 to-primary/5 border border-primary/20 rounded-2xl rounded-tl-sm overflow-hidden w-full">
      <div className="px-4 py-3 border-b border-primary/15 flex items-center gap-2.5">
        <div className="w-1 h-4 rounded-full bg-primary flex-none" />
        <span className="text-[11px] font-bold tracking-widest uppercase text-primary/80">Your SIT Brief</span>
      </div>
      <div className="px-4 py-4 flex flex-col gap-4 text-[13.5px] leading-relaxed">
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">What I think you're looking for</h3>
          <p className="text-white/80">{brief.lookingFor}</p>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">What I'd avoid</h3>
          <ul className="flex flex-col gap-1.5">
            {brief.avoid.map((a, i) => (
              <li key={i} className="flex gap-2 text-white/75">
                <span className="text-primary/50 flex-none mt-0.5">—</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">Where I'd suggest staying</h3>
          <p className="text-white/80">{brief.stayArea}</p>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">Experiences I'd prioritize</h3>
          <ul className="flex flex-col gap-1.5">
            {brief.experiences.map((e, i) => (
              <li key={i} className="flex gap-2 text-white/75">
                <span className="text-primary/50 flex-none mt-0.5">—</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="w-full h-px bg-white/5" />
        <section>
          <h3 className="text-[10px] tracking-widest uppercase text-white/35 font-bold mb-1.5">One local insight</h3>
          <p className="text-white/75 italic">{brief.localInsight}</p>
        </section>
      </div>
    </div>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

const INITIAL_CTX: UserContext = {
  purposeFollowUpAsked: false,
  durationAsked: false,
  scooterAsked: false,
  sociabilityAsked: false,
  exchangeCount: 0,
  briefGenerated: false,
};

export default function ChatScreen() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<UserContext>(INITIAL_CTX);
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showPlans, setShowPlans] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [locked, setLocked] = useState(true);

  // Knowledge base
  const [knowledgeBase, setKnowledgeBase] = useState<KBCard[]>(EMBEDDED_KB);
  const [kbStatus, setKbStatus] = useState<"embedded" | "uploaded" | "loading">("embedded");
  const [kbBannerVisible, setKbBannerVisible] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, showPlans]);

  const addMsg = (msg: Omit<TextMessage, "id" | "timestamp"> | Omit<BriefMessage, "id" | "timestamp">) => {
    setMessages(prev => [
      ...prev,
      { ...msg, id: Math.random().toString(36).slice(2), timestamp: new Date() } as Message,
    ]);
  };

  const sitSay = async (text: string, typingMs = 1100) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, typingMs));
    setIsTyping(false);
    addMsg({ type: "text", sender: "sit", text });
  };

  // Boot sequence
  useEffect(() => {
    const boot = async () => {
      await sitSay("Hey. I'm SIT — local intelligence for Koh Phangan.", 900);
      await sitSay("Before I recommend anything, I need to understand you.", 700);
      await sitSay("What's bringing you to the island?", 900);
      setSuggestions(["Wellness", "Music & parties", "Remote work", "Romance", "Community", "Nature", "Moving here", "Not sure yet"]);
      setLocked(false);
      inputRef.current?.focus();
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── File upload handler ────────────────────────────────────────────────────

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setKbStatus("loading");
    try {
      const cards = await parseXlsxToCards(file);
      if (cards.length === 0) throw new Error("No cards found");
      setKnowledgeBase(cards);
      setKbStatus("uploaded");
      setKbBannerVisible(true);
      setTimeout(() => setKbBannerVisible(false), 4000);
    } catch {
      setKbStatus("embedded");
      setKbBannerVisible(false);
    }
  };

  // ─── Send handler ───────────────────────────────────────────────────────────

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || locked) return;

    setInputValue("");
    setSuggestions([]);
    setLocked(true);

    addMsg({ type: "text", sender: "user", text: trimmed });

    const isQuestion = isDirectQuestion(trimmed);
    const isPostBrief = context.briefGenerated;

    // ── EVENT QUERY — fires at any point in the conversation ─────────────────
    if (isEventQuery(trimmed)) {
      await sitSay("Let me check what's on...", 600);
      const { response, fallback } = await searchEvents(trimmed);
      if (fallback || !response) {
        await sitSay(buildEventFallback(), 1200);
      } else {
        const insight = getEventInsight(context.purpose);
        await sitSay(`${response}\n\nLocal Insight:\n${insight}`, 1200);
      }
      setLocked(false);
      inputRef.current?.focus();
      return;
    }

    // ── POST-BRIEF: LOCAL EXPERT MODE ────────────────────────────────────────
    // Brief has been shown — user is now asking follow-up questions or exploring.
    // Answer directly from KB when relevant. Never inject unrelated cards.
    if (isPostBrief) {
      // Detect "yes I want a plan" — only if plans haven't been shown yet
      const wantsPlan = !showPlans && /\b(yes|yeah|sure|plan|please|definitely|ok|okay|yep|yup|would love|sounds good|go ahead)\b/i.test(trimmed);
      if (wantsPlan) {
        await sitSay("Here are a few options:", 800);
        setShowPlans(true);
        setLocked(false);
        inputRef.current?.focus();
        return;
      }

      if (isQuestion) {
        const hits = searchKBWithScore(trimmed, context.purpose, knowledgeBase, 5);
        const expertAnswer = buildExpertAnswer(trimmed, hits, context.purpose);
        if (expertAnswer) {
          await sitSay(expertAnswer, 1200);
        } else {
          await sitSay(buildHonestFallback(trimmed), 1100);
        }
      } else {
        // Not a question — brief conversational acknowledgment, keep door open
        const acks = [
          "Good to know. Anything else you want to nail down before you arrive?",
          "Makes sense. What else is on your radar?",
          "Worth keeping in mind. Anything specific you want me to look into?",
          "Fair enough. What else would be useful to know?",
          "Noted. Is there anything about the island you're unsure about?",
        ];
        await sitSay(acks[context.exchangeCount % acks.length], 1000);
        setContext(prev => ({ ...prev, exchangeCount: prev.exchangeCount + 1 }));
      }
      setLocked(false);
      inputRef.current?.focus();
      return;
    }

    // ── DISCOVERY MODE ────────────────────────────────────────────────────────
    // SIT is gathering context (purpose, duration, scooter, sociability).
    // Run the state machine. KB cards are NEVER injected into discovery responses —
    // the conversation is focused on understanding the user, not demonstrating knowledge.

    const response = processMessage(trimmed, context);
    setContext(response.updatedContext);

    if (response.briefReady) {
      // ── Brief generation ───────────────────────────────────────────────────
      await sitSay(response.message, 1400);
      setIsTyping(true);
      await new Promise(r => setTimeout(r, 2200));
      setIsTyping(false);
      addMsg({ type: "brief", sender: "sit", brief: buildBrief(response.updatedContext) });
      await sitSay("Want me to put together a plan for your stay?", 1300);
      setLocked(false);
      return;
    }

    if (isQuestion) {
      // ── Question mid-discovery: answer first, then continue gathering context ──
      const hits = searchKBWithScore(trimmed, context.purpose, knowledgeBase, 5);
      const expertAnswer = buildExpertAnswer(trimmed, hits, context.purpose);
      if (expertAnswer) {
        await sitSay(expertAnswer, 1200);
      } else {
        await sitSay(buildHonestFallback(trimmed), 1000);
      }
      await new Promise(r => setTimeout(r, 350));
      await sitSay(response.message, 900);
      // Only show chips if purpose is still unknown
      if (!response.updatedContext.purpose && response.suggestions?.length) {
        setSuggestions(response.suggestions);
      }
    } else {
      // ── Pure discovery: show state machine response only — no KB injection ──
      await sitSay(response.message, 1100);
      // Only show chips if purpose is still unknown
      if (!response.updatedContext.purpose && response.suggestions?.length) {
        setSuggestions(response.suggestions);
      }
    }

    setLocked(false);
    inputRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  const kbCardCount = knowledgeBase.length;

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-[hsl(240,12%,3%)] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,hsl(250_80%_60%_/_0.07),transparent)]" />

      <div
        className="w-full max-w-[430px] h-[100dvh] flex flex-col relative z-10 border-x border-white/[0.04] shadow-2xl"
        style={{ background: "hsl(240 10% 4% / 0.7)", backdropFilter: "blur(24px)" }}
      >
        {/* Header */}
        <header
          className="flex-none px-5 py-3.5 flex items-center justify-between border-b border-white/[0.06]"
          style={{ background: "hsl(240 10% 4% / 0.85)", backdropFilter: "blur(16px)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-none">
              <span className="text-primary font-bold text-sm leading-none">S</span>
            </div>
            <div>
              <h1 className="font-bold text-white text-[15px] leading-tight tracking-tight">SIT</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-none" />
                <span className="text-[10px] text-white/40 font-semibold tracking-widest uppercase">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* KB indicator */}
            <button
              data-testid="button-kb-status"
              onClick={() => fileInputRef.current?.click()}
              title={`Knowledge base: ${kbCardCount} cards${kbStatus === "uploaded" ? " (custom)" : " (embedded)"} — click to upload`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/[0.08] hover:border-primary/30 hover:bg-primary/10 transition-all group"
            >
              <Database className="w-3 h-3 text-white/30 group-hover:text-primary/60 transition-colors" />
              <span className="text-[10px] text-white/25 group-hover:text-white/50 font-medium transition-colors">
                {kbStatus === "loading" ? "..." : `${kbCardCount}`}
              </span>
              {kbStatus === "uploaded" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-none" />
              )}
            </button>

            <span className="text-[10px] text-white/20 tracking-widest font-semibold uppercase hidden sm:block">Don't Just SIT.</span>

            {/* Upload button */}
            <button
              data-testid="button-upload-kb"
              onClick={() => fileInputRef.current?.click()}
              title="Upload knowledge base (.xlsx)"
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/[0.08] hover:border-primary/30 hover:bg-primary/10 transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-white/30 hover:text-primary/60" />
            </button>
          </div>
        </header>

        {/* KB upload banner */}
        <AnimatePresence>
          {kbBannerVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 py-2.5 flex items-center justify-between bg-emerald-500/10 border-b border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[12px] text-emerald-300 font-medium">
                    Knowledge base updated — {kbCardCount} cards loaded
                  </span>
                </div>
                <button
                  onClick={() => setKbBannerVisible(false)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          data-testid="input-file-upload"
          onChange={handleFileChange}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3 scroll-smooth">
          <AnimatePresence initial={false}>
            {messages.map(msg => {
              if (msg.type === "brief") {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="self-start w-[92%]"
                  >
                    <BriefCard brief={msg.brief} />
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className={`max-w-[82%] ${msg.sender === "sit" ? "self-start" : "self-end"}`}
                >
                  <div
                    className={`px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed whitespace-pre-line ${
                      msg.sender === "sit"
                        ? "bg-primary/[0.13] text-white border border-primary/[0.18] rounded-tl-sm"
                        : "text-white border border-white/[0.08] rounded-tr-sm"
                    }`}
                    style={msg.sender === "user" ? { background: "hsl(240 10% 12% / 0.9)" } : {}}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              );
            })}

            {isTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="self-start"
              >
                <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-primary/[0.1] border border-primary/[0.15] flex gap-1.5 items-center">
                  {[0, 0.18, 0.36].map((delay, i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/50"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 0.75, delay, ease: "easeInOut" }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Plan buttons */}
          {showPlans && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="flex flex-col gap-2 self-start w-[92%] mt-1"
            >
              {["3-Day Plan", "7-Day Plan", "1-Month Plan"].map(plan => (
                <button
                  key={plan}
                  data-testid={`plan-${plan}`}
                  onClick={() => setLocation("/tagline")}
                  className="w-full py-3.5 px-5 rounded-xl border border-primary/20 text-white/85 font-medium hover:bg-primary/10 hover:border-primary/35 hover:text-white active:scale-[0.98] transition-all flex items-center justify-between text-[14px]"
                  style={{ background: "hsl(250 80% 60% / 0.07)" }}
                >
                  <span>{plan}</span>
                  <span className="text-primary/50 text-base">→</span>
                </button>
              ))}
            </motion.div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input area */}
        <div
          className="flex-none border-t border-white/[0.06]"
          style={{ background: "hsl(240 10% 4% / 0.9)", backdropFilter: "blur(16px)" }}
        >
          {/* Suggestion chips */}
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-3 pb-0 overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pb-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      data-testid={`suggestion-${s.replace(/\s+/g, "-").toLowerCase()}`}
                      disabled={locked}
                      onClick={() => handleSend(s)}
                      className="px-3.5 py-2 rounded-full text-[13px] font-medium border border-white/[0.1] text-white/70 hover:text-white hover:border-white/20 hover:bg-white/5 active:scale-95 transition-all disabled:opacity-30"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text input row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={onKey}
              disabled={locked}
              placeholder="Type a message..."
              data-testid="input-message"
              className="flex-1 rounded-full px-5 py-3 text-[14.5px] text-white placeholder:text-white/20 outline-none transition-all disabled:opacity-30 border"
              style={{
                background: "hsl(240 10% 9%)",
                borderColor: "hsl(240 10% 16%)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "hsl(250 80% 60% / 0.4)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "hsl(240 10% 16%)"; }}
            />
            <button
              onClick={() => handleSend(inputValue)}
              disabled={!inputValue.trim() || locked}
              data-testid="button-send"
              className="w-11 h-11 rounded-full flex items-center justify-center flex-none transition-all active:scale-90 disabled:opacity-25"
              style={{
                background: "hsl(250 80% 60%)",
                boxShadow: inputValue.trim() && !locked ? "0 0 20px hsl(250 80% 60% / 0.35)" : "none",
              }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
