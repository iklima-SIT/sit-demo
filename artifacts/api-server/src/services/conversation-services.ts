import {
  createConversationServices,
  type ConversationServices,
} from "@workspace/sit-engine";
import { searchLiveEvents } from "./event-service";
import { knowledgeRepository, type KnowledgeRepository } from "../repositories/knowledge-repository";

function buildKnowledgeAnswer(hits: Awaited<ReturnType<KnowledgeRepository["search"]>>): string | null {
  if (hits.length === 0) return null;
  const top = hits[0]!.card;
  const insight = top.deepLocalInsight || top.reality || top.aiRecommendationLogic || top.myth;
  const recommendation = top.recommendedFor ? `Best for: ${top.recommendedFor}` : "";
  return [insight, recommendation].filter(Boolean).join("\n\n");
}

export function createApiConversationServices(repository: KnowledgeRepository = knowledgeRepository): ConversationServices {
  return createConversationServices({
    events: {
      async search(request) {
        const apiKey = process.env.EXA_API_KEY;
        const result = await searchLiveEvents(request, apiKey);
        return {
          response: result.response,
          fallback: result.fallback,
          sources: result.sources,
          venueReferences: result.venueReferences,
          fallbackMessage: result.fallbackMessage,
          timeWindow: result.timeWindow,
          rejectedCandidates: result.rejectedCandidates,
          diagnostics: result.diagnostics,
        };
      },
    },
    knowledge: {
      async search(query, context) {
        const hits = await repository.search(query, {
          purpose: context.purpose,
          travelerType: context.state.context.purpose,
          limit: 5,
        });
        const metadata = await repository.getImportMetadata();
        return {
          answer: buildKnowledgeAnswer(hits),
          references: hits.map((hit, index) => ({
            query,
            purpose: context.purpose,
            cardId: hit.card.id,
            topic: hit.card.topic,
            score: hit.score,
            used: index === 0,
            matchedBecause: `Lexical match against topic/category/insight fields for "${query}".`,
          })),
          version: metadata.version,
          importedAt: metadata.importedAt,
        };
      },
    },
  });
}
