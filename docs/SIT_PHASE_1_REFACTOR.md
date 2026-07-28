# SIT Phase 1 Refactor

Date: 2026-07-11

## Scope

Phase 1 was a behavior-preserving extraction. The goal was not to redesign the UI, add product features, replace Exa, add vector search, or change the SIT brand voice. The goal was to move product decision logic out of `chat.tsx` and into a canonical shared engine used by both the web chat and WhatsApp adapter.

## Files Created

- `lib/sit-engine/src/intent-router.ts`
  - Owns intent classification and direct-request detection.
  - Supports `live_event_search`, `location_request`, `definition`, `recommendation`, `planning`, `advice`, `onboarding`, `general_chat`, and `follow_up`.

- `lib/sit-engine/src/memory.ts`
  - Owns conversation memory helpers.
  - Resolves references such as `where is it?`, `send location`, `that one`, and pending event follow-ups.

- `lib/sit-engine/src/venues.ts`
  - Owns structured venue data and Google Maps answer formatting.
  - Removes venue data from React components.

- `lib/sit-engine/src/knowledge.ts`
  - Owns KB card typing, lexical ranking, expert-answer formatting, and honest fallback copy.
  - Keeps current embedded knowledge behavior without introducing vector search.

- `lib/sit-engine/src/intent-router.test.ts`
  - Adds unit tests for Phase 1 behavior boundaries.

- `docs/SIT_PHASE_1_REFACTOR.md`
  - This implementation note.

## Files Changed

- `lib/sit-engine/src/types.ts`
  - Added typed schemas for:
    - `Intent`
    - `ConversationState`
    - `ConversationTurn`
    - `ConversationMemory`
    - `VenueReference`
    - `EventReference`
    - `KnowledgeReference`
    - `AssistantDecision`
    - developer trace metadata

- `lib/sit-engine/src/conversation.ts`
  - Kept `processMessage()` and `buildBrief()`.
  - Added `decideAssistantAction()` as the canonical decision API.
  - Moved the browser-facing SIT onboarding copy into the shared engine so the web adapter can use the canonical source.

- `lib/sit-engine/src/index.ts`
  - Exported the new engine modules and types.

- `lib/sit-engine/package.json`
  - Added a test script using Node's built-in test runner via `tsx`.

- `lib/sit-engine/tsconfig.json`
  - Excluded test files from declaration output.

- `artifacts/sit-demo/package.json`
  - Added `@workspace/sit-engine` as a workspace dependency.

- `artifacts/sit-demo/src/lib/knowledge-base.ts`
  - Kept browser-only workbook parsing.
  - Re-exported KB types and ranking helpers from `@workspace/sit-engine`.

- `artifacts/sit-demo/src/pages/chat.tsx`
  - Removed inline product logic for:
    - intent regex
    - onboarding state machine
    - venue database
    - location answer formatting
    - expert KB answer building
    - honest fallback logic
  - Kept rendering, input state, message state, loading animation, suggestion chips, file upload, and service calls.
  - Calls `decideAssistantAction()` before choosing adapter behavior.

- `artifacts/api-server/src/routes/whatsapp.ts`
  - Uses `decideAssistantAction()` before rendering TwiML.
  - Stores session as `{ context, memory }`.
  - Keeps WhatsApp as an adapter over the shared engine.

- `pnpm-lock.yaml`
  - Updated after adding the `sit-engine` test dependency and frontend workspace dependency.

## Architectural Decisions

- The canonical engine lives in `lib/sit-engine`.
- The engine decides intent, action, required service, memory updates, and debug reason.
- The web UI still performs the actual `/api/events/search` call because Phase 1 does not replace the existing event API path.
- The browser-only `.xlsx` parser remains in `artifacts/sit-demo/src/lib/knowledge-base.ts` because it depends on `FileReader`.
- Knowledge ranking is now exported from `lib/sit-engine`; Phase 1 preserves lexical ranking and does not add semantic search.
- Venue data is structured in `venues.ts`, but remains static data for now.
- Developer trace is available only through the engine decision object when `devTrace` is enabled; it is not rendered to end users.

## Tests Added

`lib/sit-engine/src/intent-router.test.ts` covers:

- Direct question must override onboarding.
- Location follow-up resolves `lastVenue`.
- Definition does not trigger event search.
- Live event question triggers event service.
- Repeated venue name does not restart onboarding.
- Web and WhatsApp adapters can receive the same engine decision.
- Developer trace includes detected intent, selected service, and onboarding decision.

## Verification

Commands run:

```text
pnpm --filter @workspace/sit-engine test
pnpm run typecheck:libs
pnpm --filter @workspace/sit-demo run typecheck
pnpm --filter @workspace/api-server run typecheck
```

Results:

- Engine tests: passed, 7/7.
- Library typecheck: passed.
- Web typecheck: passed.
- API typecheck: passed after forcing stale `api-zod` declaration output to regenerate.

## Remaining Risks

- `chat.tsx` is much smaller but still owns adapter orchestration for events, knowledge, location rendering, and message timing. A later phase should introduce a cleaner web adapter boundary.
- Exa is still answer-generation based. Phase 1 intentionally did not replace it with structured event extraction.
- Knowledge retrieval is still lexical and card-score based. Phase 1 intentionally did not add vector search.
- Venue data is structured but still static source code, not a data service.
- WhatsApp can now use the shared decision layer, but it still lacks the same full KB/event service capabilities as the web adapter.
- Developer trace is available in engine decisions, but there is no persisted trace log or dev UI yet.

## Not Started

Phase 2 work was not started. No vector database, event ingestion service, structured Exa validation pipeline, new UI, or new product feature was introduced.
