# SIT Phase 2A: Server Knowledge and Persistent Sessions

## Architecture

Phase 2A moves SIT's canonical knowledge and conversation session state to the API server while preserving the Phase 1.5 conversation runner.

The canonical product behavior entry point remains `runConversationTurn()` in `@workspace/sit-engine`. Web and WhatsApp now pass turns through server-side repositories instead of relying on browser-only workbook data or a WhatsApp-only `Map`.

## Import Flow

Workbook import is reproducible:

1. Excel workbook is read by `xlsx`.
2. The canonical sheet is selected in priority order:
   - `V10_Master_Knowledge_Graph`
   - `Iklima`
   - first readable sheet
3. Rows are normalized by `normalizeKnowledgeRows()`.
4. Invalid rows are rejected with row-level errors.
5. A versioned JSON bundle and import report are written under `artifacts/api-server/data/knowledge/`.
6. `current.json` becomes the active server-side repository source.

Command:

```bash
pnpm import:sit-kb <path-to-xlsx>
```

Current imported version:

```text
sit-kb-20260711194409
```

## Schemas

`CanonicalKnowledgeCard` lives in `lib/sit-engine/src/knowledge-card.ts` and includes:

- identity and taxonomy: `id`, `category`, `subcategory`, `topic`, `masterCategory`
- traveler matching: `travelerType`, `recommendedFor`, `notRecommendedFor`
- insight fields: `myth`, `reality`, `deepLocalInsight`, `psychologicalLayer`, `aiRecommendationLogic`, `hiddenBenefit`, `hiddenRisk`
- scoring and business fields: `priorityScore`, `dataMoatScore`, `monetizationScore`, `investorValueScore`, `localityScore`
- provenance: `sourceExpert`, `confidence`, `updateFrequency`, `status`, `version`, `importedAt`

## Repositories

Created interfaces:

- `KnowledgeRepository`
  - `getById`
  - `search`
  - `filterByCategory`
  - `filterByTravelerType`
  - `getVersion`
  - `getImportMetadata`
  - `replace`

- `SessionRepository`
  - `create`
  - `load`
  - `loadOrCreate`
  - `update`
  - `reset`
  - `expire`

Development implementations:

- `FileKnowledgeRepository`
- `InMemoryKnowledgeRepository`
- `InMemorySessionRepository`

These are intentionally database-ready interfaces, not a full database migration.

## API Changes

Added endpoints:

- `POST /api/conversation/session`
- `POST /api/conversation/turn`
- `POST /api/conversation/reset`
- `GET /api/knowledge/version`
- `POST /api/knowledge/search`
- `POST /api/knowledge/import`

OpenAPI coverage was expanded in `lib/api-spec/openapi.yaml`.

## Channel Responsibilities

Web now:

- renders messages
- captures input
- stores a browser `userKey`
- calls backend conversation/session endpoints
- uploads workbook files to the backend import endpoint

WhatsApp now:

- parses Twilio input
- loads/updates the shared session repository
- calls `runConversationTurn()`
- formats output as TwiML

Both channels use `createApiConversationServices()` and the same server-side knowledge repository.

## Provenance

Knowledge answers can expose, in development/test traces:

- card ids
- knowledge version
- import timestamp
- lexical retrieval scores

This is returned on `RunConversationTurnOutput.knowledge` and is not rendered to normal users.

## Migration Notes

The browser workbook parser remains in the codebase as legacy/admin support, but production chat no longer uses browser-local KB search. The current UI upload flow sends the workbook to the API server, where it becomes available to all channels.

WhatsApp no longer owns its own in-memory session map. It uses `SessionRepository`.

## Tests Added

Added `artifacts/api-server/src/phase2a.test.ts` covering:

- workbook import
- invalid row rejection
- knowledge versioning
- same KB answer on Web and WhatsApp
- persistent follow-up memory across requests
- session reset
- session expiry
- direct question overriding onboarding after session reload

Existing engine tests continue to cover canonical runner parity.

## Remaining Risks

- Session persistence is still in-memory for development. A production deployment still needs a durable repository implementation.
- Knowledge search remains lexical by design. No embeddings/vector search were added in this phase.
- The Web frontend uses a thin fetch client rather than regenerated typed OpenAPI client bindings.
- Import validation requires `id`, `category`, and `topic`; other canonical fields are normalized with defaults when the workbook does not provide them.
- Existing event/date follow-up limitations remain intentionally unchanged.

