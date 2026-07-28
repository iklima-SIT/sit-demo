# SIT Architecture Audit

Date: 2026-07-11  
Scope: architecture review before a major refactor. This audit describes the existing codebase only; it does not propose bug fixes as implementation work.

## Executive Summary

SIT currently works as a polished web demo, but its product brain is concentrated in one large frontend component: `artifacts/sit-demo/src/pages/chat.tsx`. That file owns conversation flow, onboarding, intent detection, memory, location handling, knowledge retrieval, event routing, API calls, and UI rendering.

The repository also contains a cleaner shared engine package, `lib/sit-engine`, and an Express backend, `artifacts/api-server`, but the live web demo does not use the shared engine. This creates two different SIT brains: one for WhatsApp and one for the browser.

The strongest parts of the system are the mobile chat UI, the embedded SIT knowledge base, the clear initial onboarding model, and the decision to isolate Exa calls behind the backend. The weakest parts are duplicated conversation logic, regex-heavy intent classification, frontend-owned product logic, prompt-dependent live event correctness, empty database infrastructure, and a mismatch between generated API tooling and actual API usage.

## 1. Current Folder Structure

High-level workspace:

```text
.
├── artifacts/
│   ├── sit-demo/          # Main Vite React web demo
│   ├── api-server/        # Express backend
│   └── mockup-sandbox/    # Replit mockup sandbox, not active SIT product path
├── attached_assets/       # Uploaded prompt notes and SIT master workbook
├── lib/
│   ├── api-client-react/  # Orval-generated React API client
│   ├── api-spec/          # OpenAPI spec and Orval config
│   ├── api-zod/           # Orval-generated Zod response schemas
│   ├── db/                # Drizzle/Postgres skeleton
│   └── sit-engine/        # Shared pure TypeScript conversation engine
├── scripts/               # Minimal workspace scripts package
├── package.json
├── pnpm-workspace.yaml
└── replit.md
```

Important product files:

```text
artifacts/sit-demo/src/pages/chat.tsx
artifacts/sit-demo/src/pages/tagline.tsx
artifacts/sit-demo/src/lib/knowledge-base.ts
artifacts/sit-demo/src/lib/kb-data.ts
artifacts/sit-demo/src/App.tsx
artifacts/sit-demo/src/index.css

artifacts/api-server/src/app.ts
artifacts/api-server/src/index.ts
artifacts/api-server/src/routes/events.ts
artifacts/api-server/src/routes/test-exa.ts
artifacts/api-server/src/routes/whatsapp.ts
artifacts/api-server/src/routes/health.ts

lib/sit-engine/src/conversation.ts
lib/sit-engine/src/types.ts
lib/db/src/schema/index.ts
lib/api-spec/openapi.yaml
```

## 2. Conversation Flow

The browser conversation is implemented in `artifacts/sit-demo/src/pages/chat.tsx`.

Startup flow:

1. The chat boots with three SIT messages.
2. It asks: "What's bringing you to the island?"
3. It displays suggestion chips for purpose categories.
4. It unlocks the input.

Runtime flow in `handleSend()`:

1. Add the user message.
2. Check memory-first location follow-ups.
3. Classify the message intent.
4. Handle event follow-up memory.
5. Handle location/directions.
6. Handle live event queries.
7. If post-brief, answer from KB or show plan buttons.
8. If discovery mode, run the local `processMessage()` state machine.
9. Generate the SIT Brief once enough context exists.

The code has a useful high-level separation between discovery mode and local expert mode, but this separation is expressed as condition ordering inside one large function rather than as independent modules.

## 3. Onboarding Flow

Onboarding is a deterministic state machine:

1. Detect purpose.
2. Ask one purpose-specific follow-up.
3. Ask scooter availability.
4. Ask sociability.
5. Generate SIT Brief when enough context exists.
6. Ask whether the user wants a plan.

The same conceptual flow exists in two places:

- Browser copy: `artifacts/sit-demo/src/pages/chat.tsx`
- Shared package: `lib/sit-engine/src/conversation.ts`

The shared package says it is the single source of truth, but the browser does not import it. This is the most important architecture inconsistency.

What exists:

- Purpose detection by regex.
- Purpose-specific follow-up suggestions.
- Scooter and sociability detection.
- Brief generation from accumulated context.

What is missing:

- A durable session model.
- A formal state machine.
- Tests for transitions.
- A canonical shared engine used by all channels.
- A way to version onboarding questions and measure failures.

## 4. Intent Detection

Intent detection is regex-based and lives in `chat.tsx`.

Current intent buckets:

- `location`
- `event_live`
- `definition`
- `recommendation`
- `planning`
- `advice`
- `general`

The classifier order is important:

1. Definition question.
2. Live event query.
3. Location/directions.
4. Planning.
5. Advice.
6. Recommendation.
7. General.

Strengths:

- It avoids treating definition questions as event searches.
- It has explicit location follow-up handling.
- It tries to require both temporal and event signals for live events.

Weaknesses:

- Regex intent logic is brittle and hard to reason about.
- Intent and response generation are coupled in the same component.
- Temporal language is partially handled in frontend and partially in backend.
- Follow-up meaning depends on hidden component memory.
- There is no confidence score or fallback-to-clarification policy.

This part should be rewritten as an independent intent router with tests.

## 5. Memory Implementation

There are two memory systems.

Frontend memory:

```ts
context: UserContext
conversationMemory: useRef({
  lastVenue?: string
  lastTopic?: string
  pendingEventFollowUp?: "tomorrow" | "narrow"
})
```

`context` drives onboarding and brief generation. `conversationMemory` handles local follow-ups such as "location?", "yes please", or event narrowing.

Backend WhatsApp memory:

```ts
const sessions = new Map<string, UserContext>();
```

It is keyed by WhatsApp sender and has a 24-hour TTL.

What exists:

- In-memory session state.
- Venue follow-up memory.
- Pending event follow-up memory.
- WhatsApp TTL.

What is missing:

- Persistent user/session storage.
- Shared memory schema across web and WhatsApp.
- Explicit conversation event log.
- Separate short-term, profile, and retrieval memory.
- Reset/start-over semantics.
- Observability for why a reply was chosen.

## 6. Live Event Architecture

Live events are handled by the backend route:

```text
POST /api/events/search
```

Frontend:

- Detects event intent in `chat.tsx`.
- Calls `fetch("/api/events/search")`.
- Displays Exa response or local fallback.
- Stores event follow-up state.

Backend:

- Uses `Asia/Bangkok` as Koh Phangan timezone.
- Builds a search window.
- Sends a natural-language query to Exa Answer API.
- Restricts verification to trusted event sources.
- Returns `{ response, fallback, sources }`.

Trusted sources currently include:

- `phangan.events`
- `@phangan.events`
- `@retromountainphangan`
- `@_happy_people_events_`
- `@phanganism`
- `@bambuhuts`
- `@edengarden_kohphangan`
- `@holice___`
- `@secret.mountain.phangan`

What exists:

- Backend-owned API key usage.
- Timezone-aware current time.
- Tonight/tomorrow/date search window logic.
- Source whitelist in prompt.

What is missing:

- Structured event model.
- Event cache.
- Source ingestion layer.
- Deduplication.
- Venue normalization.
- Confidence scoring.
- Hard validation that event date/time is inside the search window.
- Source freshness tracking.
- Tests around date boundaries such as 01:00 after midnight.

This should become an independent Live Event Service.

## 7. Exa Integration

Exa is called directly from `events.ts` and `test-exa.ts` using `fetch("https://api.exa.ai/answer")`.

Current pattern:

1. Build a long natural-language search query.
2. Ask Exa to answer directly.
3. Clean citation markers.
4. Return the answer to frontend.

Strength:

- The API key is server-side.
- Exa is isolated from the browser.
- There is a diagnostic endpoint.

Risk:

- Exa is being used as both search engine and answer generator.
- The app relies heavily on prompt compliance.
- The returned answer is not parsed into a strict schema.
- Citations are counted but not validated.
- The source whitelist is a prompt instruction, not a software-enforced rule.

Recommended target architecture:

1. Exa Search/Answer fetches candidate source pages/posts.
2. A parser extracts event candidates.
3. A validator checks date, time, venue, source, and freshness.
4. A formatter creates the final SIT answer.
5. The frontend never sees raw Exa prose as truth.

## 8. Maps / Location Handling

Location handling is fully frontend-local in `chat.tsx`.

It includes:

- A hardcoded `VENUE_DB`.
- Known venue aliases.
- Google Maps search URLs.
- Travel time text from Thong Sala and Srithanu.
- Airport/ferry special cases.
- Last venue memory for follow-up pins.

Strengths:

- Fast.
- Deterministic.
- Useful for demo behavior.
- Does not hallucinate a map pin when the venue is unknown.

Weaknesses:

- Venue data is hardcoded inside a UI component.
- No source, coordinates, or canonical venue IDs.
- No separation between areas, venues, piers, and transport routes.
- No server/API route for location.
- No connection to master data.

This should become a Location/Venue Service backed by structured data.

## 9. Knowledge Retrieval

Knowledge retrieval lives in:

```text
artifacts/sit-demo/src/lib/knowledge-base.ts
artifacts/sit-demo/src/lib/kb-data.ts
attached_assets/SIT_V10_Knowledge_Graph_Adapted.xlsx
```

Current model:

- `kb-data.ts` embeds 159 cards generated from the SIT workbook.
- `knowledge-base.ts` defines `KBCard`.
- It supports uploaded `.xlsx` parsing in the browser.
- Search is token overlap plus purpose/category boost plus priority/confidence.
- Expert answers are generated from the top scoring card if it passes relevance gates.

Strengths:

- Master data is represented in a simple card model.
- Embedded data makes the demo self-contained.
- Upload parser supports multiple workbook shapes.
- There is a minimum score gate.
- Off-purpose cards are filtered for some purposes.

Weaknesses:

- Retrieval is lexical only.
- No embeddings or semantic search.
- No server-side canonical KB.
- Uploading a workbook changes only local browser state.
- No provenance shown to users.
- No versioning or migration pipeline from workbook to app data.
- `extractKBInsight()` exists but is not central to the active flow.

This should become an independent Knowledge Service with a reproducible import pipeline.

## 10. UI Architecture

The frontend is a Vite React app using:

- React 19
- Wouter
- Framer Motion
- Tailwind CSS v4
- Radix-derived UI components
- Lucide icons

Routes:

```text
/          ChatScreen
/tagline   TaglineScreen
*          NotFound
```

UI strengths:

- The chat shell feels focused and polished.
- The mobile-first max-width layout is appropriate.
- Suggestion chips are simple and effective.
- The Brief Card is visually distinct.
- Upload and KB status affordances exist.

UI architecture weaknesses:

- UI rendering and product logic are in the same file.
- Many imported UI components are unused boilerplate.
- Chat messages have no durable IDs beyond random strings.
- There is no component boundary for message list, input bar, suggestions, brief, or plan picker.
- Plan buttons navigate to a tagline page rather than a real plan.

What should be kept:

- The mobile chat shell.
- The message bubble styling direction.
- The suggestion chip interaction.
- The brief card concept.

What should be removed or reduced:

- Product logic inside the React component.
- Hardcoded venue database inside the UI file.
- Unused UI component surface if the app remains focused.

## 11. Backend Architecture

The backend is an Express 5 service.

Routes:

```text
GET  /api/healthz
POST /api/whatsapp
POST /api/events/search
GET  /api/test-exa
```

Middleware:

- Pino HTTP logging.
- CORS.
- JSON body parsing.
- URL-encoded body parsing.

Strengths:

- Small, understandable backend.
- API key stays server-side.
- WhatsApp webhook exists as a second channel.
- Logging is present.

Weaknesses:

- No auth.
- No rate limiting.
- No persistent session store.
- No structured event model.
- No OpenAPI coverage for non-health endpoints.
- `lib/db` is included but has no schema.
- The web app does not use the shared conversation engine through the backend.
- There are TypeScript project-reference issues in backend typecheck until libs are built.

## 12. Data Flow

Browser chat data flow:

```text
User input
  -> ChatScreen.handleSend()
  -> memory-first guards
  -> classifyIntent()
  -> one of:
     - local venue DB
     - /api/events/search
     - local KB search
     - local onboarding state machine
  -> React state messages
  -> rendered chat UI
```

Live event data flow:

```text
User asks event question
  -> frontend regex event intent
  -> POST /api/events/search
  -> backend builds Exa prompt
  -> Exa Answer API
  -> backend cleans answer
  -> frontend fallback/follow-up handling
  -> chat message
```

WhatsApp data flow:

```text
Twilio webhook
  -> /api/whatsapp
  -> in-memory session Map
  -> lib/sit-engine.processMessage()
  -> optional buildBrief()
  -> TwiML response
```

Knowledge data flow:

```text
SIT workbook
  -> generated kb-data.ts
  -> browser imports EMBEDDED_KB
  -> token scoring in knowledge-base.ts
  -> expert answer builder in chat.tsx
```

## 13. State Management

Current state is React-local:

- `messages`
- `context`
- `isTyping`
- `suggestions`
- `showPlans`
- `inputValue`
- `locked`
- `knowledgeBase`
- `kbStatus`
- `kbBannerVisible`

Additional non-rendering state:

- `conversationMemory` via `useRef`.

This is acceptable for a demo but not for a production assistant. The state machine is implicit in condition order, which makes logic bugs likely.

Production target:

- Conversation state should live in a core engine.
- UI state should stay in React.
- User/session state should persist server-side.
- Memory should be typed and versioned.
- Every assistant reply should carry a reason/trace in dev mode.

## 14. Parts That Are Well Designed

Keep these:

- The pnpm workspace separation between app, backend, and libraries.
- The idea of a pure `sit-engine` package.
- Backend-only Exa API key usage.
- The embedded KB card model as a first iteration.
- The mobile-first chat UI.
- The SIT Brief as a structured output object.
- The distinction between discovery mode and local expert mode.
- The idea of trusted event sources.
- Venue follow-up memory for "location?".
- The workbook as canonical master data.

## 15. Parts That Should Be Completely Rewritten

Rewrite these:

- `chat.tsx` as an architecture boundary. It should become UI orchestration only.
- Intent detection as ad hoc regex scattered in the UI.
- Live event verification as prompt-only logic.
- Venue database as hardcoded frontend object.
- Knowledge retrieval as pure token overlap.
- Duplication between frontend `processMessage()` and `lib/sit-engine`.
- Plan flow placeholder that leads to `/tagline`.

The rewrite should not mean throwing away product behavior. It means extracting the behavior into explicit services and tested modules.

## 16. Technical Debt

Major technical debt:

- Duplicate conversation engines.
- One giant frontend file.
- Regex intent routing without tests.
- Prompt instructions used where deterministic validation is needed.
- Empty DB layer included in runtime package graph.
- OpenAPI/generated client covers only health check.
- Frontend bypasses generated API client.
- No persistent sessions.
- No event cache or source freshness model.
- No proper plan generator.
- No observability for decisions.
- Typecheck issues in API workspace due project references and existing WhatsApp implicit `any`s.
- Replit/template boilerplate remains in docs and package structure.

Minor technical debt:

- Random message IDs.
- UI component library surface is much larger than current app needs.
- Workbook upload is useful for demo but not a controlled production data workflow.
- `test-exa` duplicates some event prompt/window logic.

## 17. Prompt Engineering vs Actual Software Logic

Current split:

Software logic handles:

- Onboarding state.
- Basic intent routing.
- Local venue pins.
- Local KB scoring.
- Event search window construction.
- Whether to call Exa.
- Fallback display in the frontend.

Prompt engineering handles:

- Whether Exa uses only trusted sources.
- Whether Exa excludes stale events.
- Whether Exa respects the search window.
- Whether Exa returns concise and citation-free answers.
- Whether Exa admits no trusted event was found.

This is the core reliability issue. For SIT, prompt engineering should influence tone and summarization, not decide truth.

Target split:

Software logic should own:

- Date windows.
- Source allowlists.
- Event extraction.
- Event validation.
- Confidence.
- Venue matching.
- User/session memory.
- Intent routing.
- Retrieval ranking.
- Safety/fallback decisions.

Prompting should own:

- Natural wording.
- Concise formatting.
- SIT voice.
- Clarifying question phrasing.
- Summarizing validated data.

## What Exists

- A working React chat demo.
- A basic backend.
- A WhatsApp webhook.
- A shared conversation engine package.
- An embedded SIT knowledge base.
- Client-side workbook upload/parser.
- Exa live event endpoint.
- Hardcoded venue/location answers.
- Generated API client/zod infrastructure.
- Empty Drizzle/Postgres infrastructure.

## What Is Missing

- One canonical conversation engine used everywhere.
- Durable sessions.
- Structured event ingestion and validation.
- Structured venue database.
- Server-side knowledge service.
- Proper plan generation.
- Full OpenAPI spec.
- Tests for conversation, intent, dates, retrieval, and event boundaries.
- Admin/import pipeline for the SIT workbook.
- Observability/debug traces.
- Production security controls: auth, rate limits, webhook validation, secret hygiene.

## What Should Be Kept

- Mobile chat UX direction.
- SIT Brief structure.
- Purpose/scooter/sociability onboarding concept.
- Workbook-backed knowledge model.
- Exa behind backend.
- Trusted source list concept.
- Separate `lib/sit-engine` package idea.
- Pino logging.
- pnpm workspace layout.

## What Should Be Removed

- Duplicate inline conversation engine in the frontend.
- Product decision logic from `chat.tsx`.
- Prompt-only event truth validation.
- Hardcoded venue data inside UI.
- Placeholder plan flow as the real product outcome.
- Replit placeholder docs once architecture is settled.

## What Should Become Independent Services

1. Conversation Service
   - Owns state machine, memory schema, intent routing, reply decisions.
   - Used by web and WhatsApp.

2. Knowledge Service
   - Owns workbook import, card versioning, retrieval, ranking, provenance.

3. Live Event Service
   - Owns source ingestion, Exa calls, validation, caching, event schema.

4. Location/Venue Service
   - Owns canonical venues, aliases, map URLs, areas, transport notes.

5. Plan Service
   - Owns 3-day, 7-day, and 1-month itinerary generation from profile, KB, events, and locations.

6. Channel Adapters
   - Web adapter and WhatsApp adapter should call the same core services but render differently.

## Recommended Refactor Direction

Phase 1: Extract without changing behavior.

- Move intent detection from `chat.tsx` into a shared module.
- Move venue DB and location formatting into a shared module.
- Make the browser use `lib/sit-engine`.
- Add tests around current behavior before changing product decisions.

Phase 2: Make data structured.

- Create event, venue, knowledge card, user context, and conversation turn schemas.
- Expand OpenAPI beyond health check.
- Use generated API client from frontend.
- Add server-side session persistence.

Phase 3: Replace brittle intelligence paths.

- Replace token-only KB retrieval with semantic or hybrid retrieval.
- Replace Exa answer-as-truth with candidate extraction plus validation.
- Replace placeholder plan buttons with real plan generation.

Phase 4: Productionize.

- Add rate limits, webhook validation, auth where needed, monitoring, and admin import tooling.
- Add eval datasets for conversations and live event boundary cases.

## Final Architectural Position

SIT should not be treated as a React component with clever conditionals. It should be treated as a multi-channel intelligence system:

- UI renders.
- Conversation engine decides.
- Knowledge service retrieves.
- Event service verifies.
- Location service resolves.
- Plan service composes.

The current demo is valuable because it proves the product feel. The major refactor should preserve that feel while moving truth, memory, and decision-making out of the UI and into explicit, testable services.
