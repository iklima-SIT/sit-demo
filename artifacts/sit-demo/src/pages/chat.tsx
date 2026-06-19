import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Upload, Database, X } from "lucide-react";
import { useLocation } from "wouter";
import type { KeyboardEvent, ChangeEvent } from "react";
import {
  type KBCard,
  EMBEDDED_KB,
  searchKB,
  extractKBInsight,
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
      message: "I'm not quite reading where you're at yet. What's pulling you to Koh Phangan — wellness, work, music, nature, or something else?",
      suggestions: ["Wellness", "Music & parties", "Remote work", "Romance", "Community", "Nature", "Moving here", "Not sure yet"],
      updatedContext: c,
    };
  }

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
    const fu = followUps[c.purpose] ?? { message: "Tell me more about what you're hoping for." };
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
    wellness: "You're looking for a genuine reset — not just a spa break, but something that actually shifts how you feel. Koh Phangan has the infrastructure for that, but the quality gap between good and bad is wide. The right experience here can be transformative.",
    music: "You want to be somewhere that feels alive — good music, interesting people, and a scene that goes beyond the obvious. Koh Phangan has that, but you have to know where to look past the Full Moon narrative.",
    "remote-work": "You're looking for a base that works — reliable internet, an environment that doesn't drain you, and enough stimulation to stay motivated. The challenge isn't finding those things here; it's managing the pull of everything else the island offers.",
    romance: "You're looking for an environment that naturally creates the conditions for connection — beautiful, unhurried, and soft enough to let something real happen. Koh Phangan can do that, if you stay in the right area.",
    community: "You're looking to belong to something while you're here — not just meet people, but actually feel like you're part of a scene. That's more achievable on Koh Phangan than most places, because the community is unusually porous.",
    nature: "You want the island that's actually there, not the filtered version. Real beaches, real jungle, and the kind of quiet you can't find in a resort. That Koh Phangan absolutely exists — it's just not on the main road.",
    moving: "You're not just visiting — you're evaluating. You want to know if this is a place you could actually build a life. That's a different question from whether you enjoy a holiday, and it requires a different kind of investigation.",
    unsure: "You're open, which is actually the best way to arrive. You're looking for something — you're just not sure what it is yet. Koh Phangan tends to show you quickly. The people who thrive here are usually the ones who don't have a rigid plan.",
  };

  const lookingFor = lookingForMap[ctx.purpose ?? "unsure"] ?? lookingForMap.unsure;

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

  const experiences = experienceMap[ctx.purpose ?? "unsure"] ?? experienceMap.unsure;

  const insightMap: Record<string, string> = {
    wellness: "Ecstatic Dance is the most misunderstood event on the island. Most people avoid it thinking it's a party. It's not — no alcohol, no phones, complete presence required. It's one of the most disarming experiences here and worth trying once before you dismiss it.",
    music: "Full Moon is the island's biggest marketing asset and its most overrated event. The people who know Koh Phangan's music scene properly often skip it entirely. The real nights happen on a Tuesday, with 200 people who actually care about the music.",
    "remote-work": "Productivity usually drops for the first 2–3 weeks, then exceeds where you started. People who expect day-one output tend to leave frustrated. The ones who give it time often extend their stay by months.",
    romance: "Hinkong at low tide has a specific kind of silence that's rare on a tourist island. The shallow water extends hundreds of metres and the light at 5pm is unlike anywhere else. It's one of those places that actually works the way travel photographs promise.",
    community: "Community on Koh Phangan forms around recurrence, not events. Showing up once builds nothing. Showing up to the same yoga class three times a week — that's where the real connections happen. Consistency is the only strategy that works.",
    nature: "There are beaches on the north coast that don't appear on any major travel site and rarely show up on Instagram. They're swimmable, quiet, and genuinely beautiful. If you want them, ask a local who's been here longer than a season — not a hotel concierge.",
    moving: "The first year of moving to Koh Phangan is a honeymoon. The second is when the real picture appears. The people who make it work long-term treat it like a real base — with structure, purpose, and income — not an extended holiday.",
    unsure: "People often arrive at Koh Phangan not knowing what they need. A surprising number leave knowing exactly who they want to become. That's not a sales pitch — it's just what happens when you slow down enough to hear yourself.",
  };

  const localInsight = insightMap[ctx.purpose ?? "unsure"] ?? insightMap.unsure;

  return { lookingFor, avoid, stayArea, experiences, localInsight };
}

// ─── KB enrichment: append insight to a message if non-redundant ─────────────

function enrichWithKB(baseMessage: string, kbCards: KBCard[]): string {
  const insight = extractKBInsight(kbCards);
  if (!insight || insight.length < 20) return baseMessage;
  // Avoid appending if the insight is already largely covered in the base message
  const overlap = insight
    .toLowerCase()
    .split(" ")
    .filter(w => w.length > 4 && baseMessage.toLowerCase().includes(w));
  if (overlap.length > 5) return baseMessage;
  return `${baseMessage}\n\n${insight}`;
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

  const addMsg = (msg: Omit<Message, "id" | "timestamp">) => {
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
      await sitSay("Hey. I'm SIT — a local intelligence concierge for Koh Phangan.", 900);
      await sitSay("Before I recommend anything, I need to understand you first.", 700);
      await sitSay("Why are you coming to Koh Phangan?", 900);
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

    // Search KB with user message + current context
    const kbHits = searchKB(trimmed, context.purpose, knowledgeBase, 3);

    // Generate base response
    const response = processMessage(trimmed, context);
    setContext(response.updatedContext);

    if (response.briefReady) {
      await sitSay(response.message, 1400);
      setIsTyping(true);
      await new Promise(r => setTimeout(r, 2200));
      setIsTyping(false);
      addMsg({ type: "brief", sender: "sit", brief: buildBrief(response.updatedContext) });
      await sitSay("Would you like me to build a personalized plan for your stay?", 1300);
      setShowPlans(true);
      setLocked(false);
    } else {
      // Optionally enrich the response with KB insight
      const enriched = kbHits.length > 0
        ? enrichWithKB(response.message, kbHits)
        : response.message;

      await sitSay(enriched, 1100);
      if (response.suggestions?.length) setSuggestions(response.suggestions);
      setLocked(false);
      inputRef.current?.focus();
    }
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
