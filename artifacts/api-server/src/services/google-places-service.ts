import {
  createGoogleMapsRecommendationService,
  type PlaceRecommendationRequest,
  type PlaceRecommendationResult,
  type RecommendationService,
} from "@workspace/sit-engine";

const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
].join(",");

type FetchLike = typeof fetch;

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
}

function buildTextQuery(request: PlaceRecommendationRequest): string {
  return `${request.query.replace(/[?!.]+$/g, "").trim()} near ${request.area}, Koh Phangan, Thailand`;
}

function formatResult(request: PlaceRecommendationRequest, places: GooglePlace[]): PlaceRecommendationResult | undefined {
  const usable = places
    .filter(place => place.businessStatus !== "CLOSED_PERMANENTLY" && place.displayName?.text && place.googleMapsUri)
    .slice(0, 5);
  if (usable.length === 0) return undefined;
  const options = usable.map((place, index) => {
    const rating = typeof place.rating === "number"
      ? ` — ${place.rating.toFixed(1)}★${place.userRatingCount ? ` (${place.userRatingCount} reviews)` : ""}`
      : "";
    const address = place.formattedAddress ? `\n   ${place.formattedAddress}` : "";
    return `${index + 1}. ${place.displayName!.text}${rating}${address}\n   ${place.googleMapsUri}`;
  });
  return {
    answer: [
      `Here are real options near ${request.area} that match your request:`,
      ...options,
      "Google Places data can change, so check today's opening hours before going.",
    ].join("\n\n"),
    area: request.area,
    category: request.category,
    googleMapsUrls: usable.map(place => place.googleMapsUri!),
  };
}

export function createGooglePlacesRecommendationService(
  apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl: FetchLike = fetch,
): RecommendationService {
  const fallback = createGoogleMapsRecommendationService();
  return {
    async recommend(request, context) {
      if (!apiKey) return fallback.recommend(request, context);
      try {
        const response = await fetchImpl(GOOGLE_PLACES_TEXT_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
          },
          body: JSON.stringify({ textQuery: buildTextQuery(request), pageSize: 5, languageCode: "en" }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return fallback.recommend(request, context);
        const live = formatResult(request, (await response.json() as GooglePlacesResponse).places ?? []);
        return live ?? fallback.recommend(request, context);
      } catch {
        return fallback.recommend(request, context);
      }
    },
  };
}
