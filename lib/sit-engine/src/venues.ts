import type { VenueLocationReference } from "./types.js";

export interface VenueData {
  id: string;
  name: string;
  aliases: string[];
  area: string;
  nearbyLandmark?: string;
  googleMapsUrl: string;
  transportNotes: {
    fromThongSala: string;
    fromSrithanu: string;
    walkNote?: string;
    routeOptions?: Array<{
      origin: string;
      name: string;
      conditions: string;
      guidance: string;
      sourceExpert?: string;
      verifiedAt?: string;
    }>;
  };
  localInsight: string;
}

const VENUES: VenueData[] = [
  {
    id: "ethos-cafe",
    name: "ETHOS Wholefood Cafe & Shala",
    aliases: ["ethos cafe", "ethos café", "ethos shala", "ethos wholefood cafe", "ethos"],
    area: "Central Srithanu",
    nearbyLandmark: "In the heart of Srithanu, close to the village's cafe and yoga cluster.",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=ETHOS+Wholefood+Cafe+and+Shala+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~12 min by scooter or taxi",
      fromSrithanu: "A few minutes from central Srithanu; walkable from much of the village",
      walkNote: "The cafe is set back from the main traffic rather than directly on the busy road.",
    },
    localInsight: "It is both a wholefood cafe and an active yoga shala, so check the current class schedule if that is why you're going.",
  },
  {
    id: "lighthouse",
    name: "Lighthouse",
    aliases: ["lighthouse"],
    area: "Haad Rin (south tip)",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Lighthouse+Bungalows+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~30 min by scooter / 400–500 THB taxi",
      fromSrithanu: "~30–35 min by scooter / 500 THB taxi",
      walkNote: "Final stretch from the road is a short walk down.",
    },
    localInsight: "Go before midnight — it fills fast on party nights.",
  },
  {
    id: "secret-mountain",
    name: "Secret Mountain",
    aliases: ["secret mountain"],
    area: "Hills above Srithanu (west coast)",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Secret+Mountain+Bar+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~15 min by scooter",
      fromSrithanu: "5–10 min by scooter up the hill",
      walkNote: "Scooter access only — steep road, not walkable.",
    },
    localInsight: "GPS is unreliable here. Follow the signs or ask locally.",
  },
  {
    id: "haad-rin",
    name: "Haad Rin",
    aliases: ["haad rin"],
    area: "South tip of the island",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Haad+Rin+Beach+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~30 min by scooter / songthaew 80–150 THB",
      fromSrithanu: "~35 min by scooter",
    },
    localInsight: "Haad Rin and Srithanu feel like different islands. Decide which vibe you want before committing.",
  },
  {
    id: "srithanu",
    name: "Srithanu",
    aliases: ["srithanu", "sri thanu", "siruthanu"],
    area: "West coast, 8 km north of Thong Sala",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Srithanu+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~10 min by scooter / songthaew 80 THB",
      fromSrithanu: "You're here",
      routeOptions: [
        {
          origin: "Thong Sala",
          name: "Main road",
          conditions: "Very flat and comfortable.",
          guidance: "This is the easier option for a relaxed ride.",
          sourceExpert: "SIT founder local knowledge",
          verifiedAt: "2026-07-29",
        },
        {
          origin: "Thong Sala",
          name: "Beach road",
          conditions: "Narrower, less comfortable, and a little dark in places, but without large cars or trucks.",
          guidance: "Ride slowly and take your time.",
          sourceExpert: "SIT founder local knowledge",
          verifiedAt: "2026-07-29",
        },
      ],
    },
    localInsight: "The wellness, yoga, and coworking hub. Srithanu and Hinkong blend into each other.",
  },
  {
    id: "hinkong",
    name: "Hin Kong (Hinkong)",
    aliases: ["hin kong", "hinkong"],
    area: "West coast, just south of Srithanu",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Hin+Kong+Beach+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~10 min by scooter",
      fromSrithanu: "15 min walk along the beach / 5 min by scooter",
    },
    localInsight: "Low-tide sunsets here are genuinely world-class. Less crowded than Srithanu.",
  },
  {
    id: "thong-sala",
    name: "Thong Sala",
    aliases: ["thong sala"],
    area: "Main town & ferry pier",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Thong+Sala+Koh+Phangan",
    transportNotes: {
      fromThongSala: "You're here",
      fromSrithanu: "~10 min by scooter / songthaew 80 THB",
    },
    localInsight: "Best grocery stores, immigration office, and night market on the island.",
  },
  {
    id: "eden-club",
    name: "Eden Club",
    aliases: ["eden club"],
    area: "Haad Rin area",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Eden+Club+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~30 min by scooter",
      fromSrithanu: "~35 min by scooter",
    },
    localInsight: "Outdoor jungle setting. Smaller and more intimate than the main Haad Rin venues.",
  },
  {
    id: "chaloklum",
    name: "Chaloklum",
    aliases: ["chaloklum"],
    area: "North coast",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Chaloklum+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~25 min by scooter",
      fromSrithanu: "~20 min by scooter",
    },
    localInsight: "Quieter fishing village feel. Boat trips to Koh Ma and Sail Rock depart from here.",
  },
  {
    id: "shivari",
    name: "Shivari",
    aliases: ["shivari"],
    area: "Srithanu",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Shivari+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~12 min by scooter",
      fromSrithanu: "5 min by scooter / 10 min walk",
    },
    localInsight: "Popular retreat and event venue. Usually has workshops and gatherings across the week.",
  },
  {
    id: "agama",
    name: "Agama Yoga",
    aliases: ["agama"],
    area: "Srithanu",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Agama+Yoga+School+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~12 min by scooter",
      fromSrithanu: "5–10 min by scooter",
    },
    localInsight: "One of the most established yoga schools on the island. Month-long intensives fill up fast.",
  },
  {
    id: "baan-tai",
    name: "Baan Tai",
    aliases: ["baan tai"],
    area: "South coast (between Thong Sala and Haad Rin)",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Baan+Tai+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~10 min by scooter",
      fromSrithanu: "~20 min by scooter",
    },
    localInsight: "The jungle party corridor. Many of the midweek electronic music events happen here.",
  },
  {
    id: "haad-yuan",
    name: "Haad Yuan",
    aliases: ["haad yuan"],
    area: "Southeast coast",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Haad+Yuan+Beach+Koh+Phangan",
    transportNotes: {
      fromThongSala: "~30 min by scooter + short walk / longtail from Haad Rin (~15 min)",
      fromSrithanu: "~40 min by scooter",
    },
    localInsight: "One of the best swimming beaches. Quieter than the west coast, harder to reach — that's the point.",
  },
];

export const VENUE_DB: Record<string, VenueData> = Object.fromEntries(
  VENUES.flatMap(venue => venue.aliases.map(alias => [alias, venue])),
);

export const KNOWN_VENUE_KEYS: string[] = Object.keys(VENUE_DB).sort((a, b) => b.length - a.length);

export function extractVenueFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  return KNOWN_VENUE_KEYS.find(key => lower.includes(key));
}

export function getVenueByReference(reference: string): VenueData | undefined {
  const normalized = reference.toLowerCase();
  return VENUE_DB[normalized] ?? VENUES.find(venue => venue.id === normalized);
}

function normalizeVenueText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanLocationSubject(value: string): string | undefined {
  const cleaned = value
    .trim()
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+(?:in|on)\s+koh\s+phangan$/i, "")
    .trim();
  if (!cleaned || /^(it|there|that|that one|this one|the place|the venue|send(?: me)?(?: the)?|share(?: the)?|give(?: me)?(?: the)?)$/i.test(cleaned)) return undefined;
  return cleaned;
}

export function extractLocationSubject(text: string, allowBare = false): string | undefined {
  const trimmed = text.trim();
  const patterns = [
    /^i\s+am\s+not\s+asking\s+(?:for|about)\s+.+?[.!?,;]?\s*i\s+am\s+asking(?:\s+(?:for|about))?\s+(.+)$/i,
    /^(?:actually[,]?\s*)?(?:i\s+mean|i\s+meant)\s+(.+)$/i,
    /^where(?:\s+is|'s)\s+(?:the\s+)?(?:location\s+(?:of|for)\s+)?(.+)$/i,
    /^(?:i\s+(?:want|need)\s+)?(?:the\s+)?(?:location(?:\s+pin)?|pin|address|google\s+maps?)\s+(?:for|of|to)\s+(.+)$/i,
    /^(?:send|share|give)(?:\s+me)?\s+(?:the\s+)?(?:location|pin|address|google\s+maps?)(?:\s+(?:for|of|to))?\s+(.+)$/i,
    /^(.+?)\s+(?:location|location\s+pin|pin|address)$/i,
    /\bwhere(?:\s+is|'s)\s+(?:the\s+)?(?:location\s+(?:of|for)\s+)?(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return cleanLocationSubject(match[1]);
  }

  if (!allowBare || trimmed.includes("?") || trimmed.split(/\s+/).length > 10) return undefined;
  if (/^(what|where|when|how|why|who|which|can|could|do|does|is|are|i want|i need|send|share|give|location|pin|address|maps?|google maps?)\b/i.test(trimmed)) return undefined;
  return cleanLocationSubject(trimmed);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

export function venueNamesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeVenueText(left);
  const normalizedRight = normalizeVenueText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = normalizedLeft.split(" ");
  const rightTokens = normalizedRight.split(" ");
  const [shorter, longer] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];
  return shorter.every(token => longer.some(candidate => {
    if (`${token}s` === candidate || `${candidate}s` === token) return true;
    const tolerance = Math.min(token.length, candidate.length) >= 8 ? 2 : Math.min(token.length, candidate.length) >= 5 ? 1 : 0;
    return editDistance(token, candidate) <= tolerance;
  }));
}

export function findVenueLocationReference(
  query: string,
  references: VenueLocationReference[] = [],
): VenueLocationReference | undefined {
  const subject = extractLocationSubject(query, true);
  const normalizedQuery = normalizeVenueText(subject ?? query);
  if (!normalizedQuery) return undefined;

  return references.find(reference => {
    const candidates = [reference.id, reference.name, ...(reference.aliases ?? [])]
      .map(normalizeVenueText)
      .filter(Boolean);
    return candidates.some(candidate => venueNamesMatch(normalizedQuery, candidate));
  });
}

export function buildVenueGoogleMapsSearchUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} Koh Phangan`)}`;
}

export function buildVenueGoogleMapsDirectionsUrl(name: string, origin = "Thong Sala"): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin} Koh Phangan`)}&destination=${encodeURIComponent(`${name} Koh Phangan`)}&travelmode=driving`;
}

export function isVenueRouteQuestion(text: string): boolean {
  return /\b(road|route|way there|flat|steep|hilly|hill|easy|difficult|hard to reach|road condition|ride|drive)\b/i.test(text);
}

function routeOrigin(text: string): string {
  if (/\b(?:thong\s*sala|tongsala)\b/i.test(text)) return "Thong Sala";
  if (/\b(?:sri\s*thanu|srithanu)\b/i.test(text)) return "Sri Thanu";
  if (/\bhaad\s*rin\b/i.test(text)) return "Haad Rin";
  return "Thong Sala";
}

export function formatVenueRouteAnswer(
  name: string,
  question: string,
  verifiedNote?: string,
  routeOptions?: VenueData["transportNotes"]["routeOptions"],
): string {
  const origin = routeOrigin(question);
  const matchingRouteOptions = routeOptions?.filter(option => option.origin === origin) ?? [];
  const hasSteepWarning = Boolean(verifiedNote && /\bsteep|scooter access only|not walkable\b/i.test(verifiedNote));
  const assessment = matchingRouteOptions.length > 0
    ? [
        `You have ${matchingRouteOptions.length} route options:`,
        ...matchingRouteOptions.map(option => `• ${option.name}: ${option.conditions} ${option.guidance}`),
      ]
    : [
        hasSteepWarning
          ? `I wouldn't describe this route as flat and easy. ${verifiedNote}`
          : verifiedNote
            ? `I don't have a verified gradient or road-surface assessment for the whole route. What I do know: ${verifiedNote}`
            : "I don't have verified road-condition details for this route, so I can't honestly confirm that it is flat and easy.",
      ];

  return [
    `Road to ${name} from ${origin}:`,
    "",
    ...assessment,
    "",
    "Google Maps directions:",
    buildVenueGoogleMapsDirectionsUrl(name, origin),
    "",
    "Check the final access road with the venue before riding, especially after rain.",
  ].join("\n");
}

export function formatVenueLocationReference(reference: VenueLocationReference): string {
  return [
    `📍 ${reference.name}`,
    reference.area ? `\nArea:\n${reference.area}` : "",
    `\nGoogle Maps:\n${reference.googleMapsUrl}`,
    "\nThis is the location connected to the event listing I showed you.",
  ].filter(Boolean).join("\n");
}

export function formatVenueSearchLocation(name: string): string {
  return [
    `📍 ${name}`,
    "",
    "Google Maps:",
    buildVenueGoogleMapsSearchUrl(name),
    "",
    "I don't have a verified landmark or transport note for this venue yet, so check the Maps result before heading out.",
  ].join("\n");
}

export function formatVenueCard(venue: VenueData): string {
  const transportLines = [`• From Thong Sala: ${venue.transportNotes.fromThongSala}`];
  if (venue.transportNotes.fromSrithanu !== "You're here") {
    transportLines.push(`• From Srithanu: ${venue.transportNotes.fromSrithanu}`);
  }
  if (venue.transportNotes.walkNote) {
    transportLines.push(`• Note: ${venue.transportNotes.walkNote}`);
  }

  const locationDetails = [
    `📍 ${venue.name}`,
    ``,
    `Area:`,
    venue.area,
  ];
  if (venue.nearbyLandmark) {
    locationDetails.push(``, `Nearby landmark:`, venue.nearbyLandmark);
  }

  return [
    ...locationDetails,
    ``,
    `Google Maps:`,
    venue.googleMapsUrl,
    ``,
    `How to get there:`,
    ...transportLines,
    ``,
    `Local Insight:`,
    venue.localInsight,
  ].join("\n");
}

export function buildLocationAnswer(question: string): string {
  const q = question.toLowerCase();

  for (const key of KNOWN_VENUE_KEYS) {
    if (q.includes(key)) {
      return formatVenueCard(VENUE_DB[key]!);
    }
  }

  if (/airport|fly|flight/.test(q)) {
    return [
      "📍 Thong Sala Pier (main arrival point)",
      "",
      "Area:",
      "Thong Sala — main town",
      "",
      "Google Maps:",
      "https://www.google.com/maps/search/?api=1&query=Thong+Sala+Pier+Koh+Phangan",
      "",
      "How to get there:",
      "• Fly to Koh Samui (USM), then take the Lomprayah ferry — 30 min",
      "• Bangkok → Samui: ~1 hour, several flights daily",
      "• Budget route: Surat Thani + night ferry (~4 hours, cheaper)",
      "",
      "Local Insight:",
      "Book Lomprayah online — it sells out around Full Moon week.",
    ].join("\n");
  }

  if (/ferry|boat|from samui|from koh tao|from surat/.test(q)) {
    return [
      "📍 Thong Sala Pier",
      "",
      "Area:",
      "Main town",
      "",
      "Google Maps:",
      "https://www.google.com/maps/search/?api=1&query=Thong+Sala+Pier+Koh+Phangan",
      "",
      "How to get there:",
      "• From Koh Samui: 30–45 min (Lomprayah or Seatran)",
      "• From Koh Tao: 1.5–2 hours",
      "• From Surat Thani: 3–4 hours (night ferry available)",
      "",
      "Local Insight:",
      "Book Lomprayah online. Seatran is walk-on but slower.",
    ].join("\n");
  }

  return "Which place do you want the pin for?";
}
