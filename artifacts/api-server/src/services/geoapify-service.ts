import {
  createGoogleMapsRecommendationService,
  type PlaceCategory,
  type PlaceRecommendationRequest,
  type PlaceRecommendationResult,
  type RecommendationService,
} from "@workspace/sit-engine";

const GEOAPIFY_PLACES_URL = "https://api.geoapify.com/v2/places";
const KOH_PHANGAN_RECT = "rect:99.90,9.62,100.11,9.84";

type FetchLike = typeof fetch;

interface GeoapifyProperties {
  name?: string;
  formatted?: string;
  address_line2?: string;
  lat?: number;
  lon?: number;
  distance?: number;
  categories?: string[];
  conditions?: string[];
  website?: string;
  catering?: { cuisine?: string; diet?: string };
}

interface GeoapifyResponse {
  features?: Array<{ properties?: GeoapifyProperties }>;
}

const AREA_COORDINATES: Record<string, { lon: number; lat: number }> = {
  "sri thanu": { lon: 99.965, lat: 9.758 },
  srithanu: { lon: 99.965, lat: 9.758 },
  hinkong: { lon: 99.982, lat: 9.749 },
  "thong sala": { lon: 99.995, lat: 9.709 },
  "baan tai": { lon: 100.025, lat: 9.704 },
  "haad rin": { lon: 100.067, lat: 9.676 },
  chaloklum: { lon: 100.003, lat: 9.787 },
};

const CATEGORY_FILTERS: Record<PlaceCategory, string> = {
  restaurant: "catering.restaurant,catering.cafe,catering.fast_food",
  cafe: "catering.cafe",
  pharmacy: "healthcare.pharmacy",
  coworking: "office.coworking",
  groceries: "commercial.supermarket,commercial.food_and_drink",
  scooter_rental: "rental,service.vehicle",
  local_service: "service,commercial",
};

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function searchTerms(query: string): string[] {
  const aliases: Record<string, string> = { asai: "acai", healthy: "health", healty: "health" };
  const ignored = new Set(["where", "can", "find", "food", "like", "near", "koh", "phangan"]);
  return [...new Set(normalize(query).match(/[a-z0-9]+/g)?.map(term => aliases[term] ?? term)
    .filter(term => term.length >= 4 && !ignored.has(term)) ?? [])];
}

function featureText(place: GeoapifyProperties): string {
  return normalize([
    place.name,
    ...(place.categories ?? []),
    ...(place.conditions ?? []),
    place.catering?.cuisine,
    place.catering?.diet,
  ].filter(Boolean).join(" "));
}

function scorePlace(place: GeoapifyProperties, terms: string[]): number {
  const text = featureText(place);
  return terms.reduce((score, term) => score + (text.includes(term) ? 10 : 0), 0)
    - Math.min((place.distance ?? 0) / 1000, 9);
}

function mapsUrl(place: GeoapifyProperties): string | undefined {
  if (typeof place.lat !== "number" || typeof place.lon !== "number") return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
}

function formatResult(request: PlaceRecommendationRequest, response: GeoapifyResponse): PlaceRecommendationResult | undefined {
  const terms = searchTerms(request.query);
  const usable = (response.features ?? [])
    .map(feature => feature.properties)
    .filter((place): place is GeoapifyProperties => Boolean(place?.name && mapsUrl(place)))
    .sort((left, right) => scorePlace(right, terms) - scorePlace(left, terms))
    .slice(0, 5);
  if (usable.length === 0) return undefined;

  const exactMatches = usable.filter(place => scorePlace(place, terms) > 0).length;
  const options = usable.map((place, index) => {
    const address = place.formatted || place.address_line2;
    const distance = typeof place.distance === "number" ? ` — about ${(place.distance / 1000).toFixed(1)} km away` : "";
    const website = place.website ? `\n   Website: ${place.website}` : "";
    return `${index + 1}. ${place.name}${distance}${address ? `\n   ${address}` : ""}\n   Map: ${mapsUrl(place)}${website}`;
  });

  return {
    answer: [
      `Here are real places near ${request.area}:`,
      ...options,
      exactMatches === 0
        ? "Geoapify does not confirm the exact menu item, so check the menu or message the venue before going."
        : "Check today's menu and opening hours before going, since island businesses change frequently.",
      "Powered by Geoapify and OpenStreetMap contributors.",
    ].join("\n\n"),
    area: request.area,
    category: request.category,
    googleMapsUrls: usable.map(place => mapsUrl(place)!),
  };
}

export function createGeoapifyRecommendationService(
  apiKey = process.env.GEOAPIFY_API_KEY,
  fetchImpl: FetchLike = fetch,
): RecommendationService {
  const fallback = createGoogleMapsRecommendationService();
  return {
    async recommend(request, context) {
      if (!apiKey) return fallback.recommend(request, context);
      const center = AREA_COORDINATES[normalize(request.area)] ?? { lon: 100.0136, lat: 9.7319 };
      const params = new URLSearchParams({
        categories: CATEGORY_FILTERS[request.category],
        filter: KOH_PHANGAN_RECT,
        bias: `proximity:${center.lon},${center.lat}`,
        limit: "20",
        lang: "en",
        apiKey,
      });
      try {
        const response = await fetchImpl(`${GEOAPIFY_PLACES_URL}?${params}`, {
          headers: { Accept: "application/geo+json,application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return fallback.recommend(request, context);
        const live = formatResult(request, await response.json() as GeoapifyResponse);
        return live ?? fallback.recommend(request, context);
      } catch {
        return fallback.recommend(request, context);
      }
    },
  };
}
