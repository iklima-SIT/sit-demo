# SIT Phase 1.5 Canonical Runner

Date: 2026-07-11

## Scope

Phase 1.5 completes the Phase 1 extraction by introducing a single channel-neutral conversation runner. It does not start Phase 2: no vector search, no UI redesign, no Exa replacement, and no new product features.

## Files Created

- `lib/sit-engine/src/services.ts`
  - Default service helpers and service factory.
  - Provides static location, lexical knowledge, placeholder plan, and fallback event service implementations.

- `lib/sit-engine/src/runner.test.ts`
  - Adapter parity tests for web and WhatsApp through the same runner.

- `artifacts/sit-demo/src/lib/conversation-services.ts`
  - Web service implementation wrapper.
  - Wraps `/api/events/search` behind the `EventService` interface.
  - Provides browser KB data to the engine knowledge service.

- `artifacts/api-server/src/services/event-service.ts`
  - Shared backend Exa/live-event service.
  - Owns event search window construction and Exa prompt construction.
  - Used by production event route, diagnostic route, and WhatsApp services.

- `artifacts/api-server/src/services/conversation-services.ts`
  - Backend service implementation wrapper for `runConversationTurn()`.

- `docs/SIT_PHASE_1_5_CANONICAL_RUNNER.md`
  - This document.

## Files Changed

- `lib/sit-engine/src/types.ts`
  - Added `ConversationChannel`, `RunConversationTurnInput`, `RunConversationTurnOutput`.
  - Added service interfaces:
    - `EventService`
    - `KnowledgeService`
    - `LocationService`
    - `PlanService`
    - `ConversationServices`

- `lib/sit-engine/src/conversation.ts`
  - Added `createInitialConversationState()`.
  - Added `startConversation()`.
  - Added `runConversationTurn()`.
  - Centralized one-turn decision flow, service calls, fallback decisions, and memory updates.

- `lib/sit-engine/src/intent-router.ts`
  - Added date follow-up detection for event-context replies such as `This Wednesday.`

- `lib/sit-engine/src/memory.ts`
  - Tightened pronoun follow-up resolution so `How much is it?` does not get misclassified as a location request.

- `lib/sit-engine/src/index.ts`
  - Exported runner, service interfaces, and service helpers.

- `artifacts/sit-demo/src/pages/chat.tsx`
  - Uses `runConversationTurn()`.
  - No longer calls event APIs directly.
  - No longer searches KB directly.
  - No longer resolves venues or mutates conversation memory.
  - Keeps rendering, input state, typing animation, suggestion chips, brief display, plan option display, file upload, and browser state persistence.

- `artifacts/api-server/src/routes/whatsapp.ts`
  - Uses `runConversationTurn()`.
  - No longer performs product routing, event fallback selection, KB skipping, manual `it` interpretation, or custom follow-up logic.
  - Only renders runner output as TwiML.

- `artifacts/api-server/src/routes/events.ts`
  - Thin route wrapper over `searchLiveEvents()`.

- `artifacts/api-server/src/routes/test-exa.ts`
  - Diagnostic route now calls the same event service as production.

## Service Interfaces

The engine depends on interfaces rather than channel implementations:

```ts
interface EventService {
  search(query, context): Promise<EventSearchResult>;
}

interface KnowledgeService {
  search(query, context): Promise<KnowledgeSearchResult>;
}

interface LocationService {
  resolve(query, memory): Promise<LocationResult>;
}

interface PlanService {
  generate(profile, duration): Promise<PlanResult>;
}
```

Web and WhatsApp now provide implementations of these interfaces. The runner selects services; adapters only provide them.

## Runner Flow

`runConversationTurn()` owns:

1. Empty/new-session onboarding entry via `startConversation()`.
2. User turn append.
3. Intent routing through `decideAssistantAction()`.
4. Event follow-up interpretation.
5. Location resolution.
6. Event service search.
7. Knowledge service search.
8. Planning option selection.
9. Onboarding state machine via `processMessage()`.
10. Brief generation via `buildBrief()`.
11. Fallback decisions.
12. Memory updates.
13. Developer trace attachment.

The runner returns:

```ts
{
  messages,
  updatedState,
  suggestions,
  brief,
  planOptions,
  trace,
  decision
}
```

## Adapter Responsibilities

Web adapter:

- Render chat messages.
- Capture input.
- Call `runConversationTurn()`.
- Persist `ConversationState` in React state.
- Display suggestions, brief, typing animation, file upload state, and plan buttons.

WhatsApp adapter:

- Read Twilio payload.
- Load/persist `ConversationState`.
- Call `runConversationTurn()`.
- Render messages, brief, suggestions, and plan options as TwiML text.

Adapters do not:

- Mutate conversation memory.
- Select services per intent.
- Construct event follow-up queries.
- Decide fallback copy.
- Resolve venue references.
- Decide whether onboarding runs.

## Event Logic Consolidation

`artifacts/api-server/src/services/event-service.ts` now owns:

- Koh Phangan timezone.
- Trusted event sources.
- Explicit date parsing.
- Tomorrow/tonight search windows.
- Exa query construction.
- Exa response cleanup.
- No-trusted-event detection.

Both routes now call the same service:

- `POST /api/events/search`
- `GET /api/test-exa`

## Tests Added

`lib/sit-engine/src/runner.test.ts` verifies web/WhatsApp parity for:

- `What parties are happening tonight?`
- `Send me the Lighthouse location.`
- `What is ecstatic dance?`
- `This Wednesday.`
- `How much is it?`
- A direct question during incomplete onboarding.

Each test checks:

- Same intent.
- Same selected service.
- Same memory updates.
- Same core answer content.
- No onboarding override.

## Verification

Commands run:

```text
pnpm --filter @workspace/sit-engine test
pnpm run typecheck
```

Results:

- Engine tests: passed, 13/13.
- Full workspace typecheck: passed.

## Remaining Risks

- WhatsApp uses the same `KnowledgeService` interface, but the current backend implementation does not yet load the full embedded SIT workbook data. The architecture no longer skips KB retrieval, but data parity is not complete.
- Web still owns browser-only workbook upload. The uploaded KB is passed into the runner via service implementation, but uploaded data is not shared with WhatsApp.
- The event service still uses Exa answer generation. Phase 1.5 only consolidated it; it did not make events structurally verified.
- `processMessage()` remains as the onboarding state machine inside the engine. It is canonical, but a future cleanup could fold it more directly into the runner.
- Session persistence is still channel-specific: React state for web, in-memory map for WhatsApp.
- Developer trace is returned by the runner but not persisted to logs or shown in a dev UI.

## Not Started

Phase 2 was not started. No vector database, semantic retrieval, event ingestion pipeline, UI redesign, or Exa replacement was introduced.
