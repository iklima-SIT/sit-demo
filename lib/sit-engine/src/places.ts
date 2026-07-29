import type {
  PlaceCategory,
  PlaceRecommendationRequest,
  PlaceRecommendationResult,
  RecommendationService,
} from "./types.js";

const AREA_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Sri Thanu", pattern: /\b(?:sri\s*thanu|srithanu|siruthanu)\b/i },
  { label: "Thong Sala", pattern: /\b(?:thong\s*sala|tongsala)\b/i },
  { label: "Hinkong", pattern: /\b(?:hin\s*kong|hinkong)\b/i },
  { label: "Baan Tai", pattern: /\b(?:baan|ban)\s*tai\b/i },
  { label: "Haad Rin", pattern: /\bhaad\s*rin\b/i },
  { label: "Chaloklum", pattern: /\bchaloklum\b/i },
  { label: "Haad Yao", pattern: /\bhaad\s*yao\b/i },
  { label: "Haad Salad", pattern: /\bhaad\s*salad\b/i },
  { label: "Thong Nai Pan", pattern: /\bthong\s*nai\s*pan\b/i },
  { label: "Mae Haad", pattern: /\bmae\s*haad\b/i },
  { label: "Wok Tum", pattern: /\bwok\s*tum\b/i },
  { label: "North Koh Phangan", pattern: /\b(?:north|north coast|northern)\b/i },
  { label: "South Koh Phangan", pattern: /\b(?:south|south coast|southern)\b/i },
  { label: "East Koh Phangan", pattern: /\b(?:east|east coast|eastern)\b/i },
  { label: "West Koh Phangan", pattern: /\b(?:west|west coast|western)\b/i },
];

export function extractKohPhanganArea(text: string): string | undefined {
  return AREA_PATTERNS.find(area => area.pattern.test(text))?.label;
}

export function isPlaceRecommendationRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[’']/g, "'");
  return /\bwhere can i (?:rent|hire|buy|get)\b/.test(normalized)
    || /\bwhere should i (?:rent|hire|eat|work|shop)\b/.test(normalized)
    || /\b(?:recommend|suggest|find me)\b.{0,50}\b(?:scooter|motorbike|restaurant|cafe|coffee|pharmacy|cowork|grocery|groceries|supermarket|rental)\b/.test(normalized)
    || /\b(?:scooter|motorbike) rentals?\b/.test(normalized);
}

export function inferPlaceCategory(text: string): PlaceCategory {
  const normalized = text.toLowerCase();
  if (/\b(?:scooter|motorbike|bike)\b.{0,30}\b(?:rent|rental|hire)\b|\b(?:rent|rental|hire)\b.{0,30}\b(?:scooter|motorbike|bike)\b/.test(normalized)) return "scooter_rental";
  if (/\b(?:restaurant|where to eat|food)\b/.test(normalized)) return "restaurant";
  if (/\b(?:cafe|coffee)\b/.test(normalized)) return "cafe";
  if (/\bpharmacy\b/.test(normalized)) return "pharmacy";
  if (/\b(?:cowork|co-work|workspace)\b/.test(normalized)) return "coworking";
  if (/\b(?:grocery|groceries|supermarket)\b/.test(normalized)) return "groceries";
  return "local_service";
}

function categorySearch(category: PlaceCategory, originalQuery: string): string {
  const searches: Record<PlaceCategory, string> = {
    scooter_rental: "scooter rental",
    restaurant: "restaurant",
    cafe: "cafe",
    pharmacy: "pharmacy",
    coworking: "coworking space",
    groceries: "grocery store",
    local_service: originalQuery.replace(/[?!.]+$/g, "").trim(),
  };
  return searches[category];
}

function categoryLabel(category: PlaceCategory): string {
  const labels: Record<PlaceCategory, string> = {
    scooter_rental: "scooter rentals",
    restaurant: "restaurants",
    cafe: "cafes",
    pharmacy: "pharmacies",
    coworking: "coworking spaces",
    groceries: "grocery stores",
    local_service: "nearby options",
  };
  return labels[category];
}

export function buildGoogleMapsPlaceSearchUrl(search: string, area: string): string {
  const query = `${search} near ${area} Koh Phangan`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildPlaceAreaQuestion(category: PlaceCategory): string {
  const label = categoryLabel(category);
  return `Which area are you staying in on Koh Phangan? ${label.charAt(0).toUpperCase() + label.slice(1)} are very local, so I'll keep the options nearby and send you the current Google Maps results.`;
}

function practicalGuidance(category: PlaceCategory): string {
  if (category === "scooter_rental") {
    return "Before choosing, compare recent reviews and confirm the daily rate, deposit, helmet, brakes, tyres, and any existing damage. Photograph the scooter before riding away.";
  }
  return "Check the latest opening hours and recent reviews before going, since island businesses can change schedules quickly.";
}

export function createGoogleMapsRecommendationService(): RecommendationService {
  return {
    async recommend(request: PlaceRecommendationRequest): Promise<PlaceRecommendationResult> {
      const search = categorySearch(request.category, request.query);
      const nearbyUrl = buildGoogleMapsPlaceSearchUrl(search, request.area);
      const reviewedUrl = buildGoogleMapsPlaceSearchUrl(`well reviewed ${search}`, request.area);
      const label = categoryLabel(request.category);
      return {
        answer: [
          `Near ${request.area}, these Google Maps results are the best place to start:`,
          `• Nearby ${label}: ${nearbyUrl}`,
          `• Well-reviewed ${label}: ${reviewedUrl}`,
          "These links show the current businesses, ratings, opening hours, and routes around your area.",
          practicalGuidance(request.category),
        ].join("\n\n"),
        area: request.area,
        category: request.category,
        googleMapsUrls: [nearbyUrl, reviewedUrl],
      };
    },
  };
}

