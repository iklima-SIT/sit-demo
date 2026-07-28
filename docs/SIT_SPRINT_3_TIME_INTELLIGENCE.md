# SIT Sprint 3: Time Intelligence and Date-Aware Event Search

## Architecture

Sprint 3 makes event time handling deterministic before any external provider call.

The canonical resolver lives in `lib/sit-engine/src/time-resolver.ts`. It is pure TypeScript, typed, fixed-clock testable, and shared by Web and WhatsApp through the canonical conversation runner. Adapters do not parse dates.

Flow:

1. Runner detects event intent or event follow-up.
2. Runner calls `createEventSearchRequest()`.
3. TimeResolver returns an explicit Asia/Bangkok `TimeWindow`.
4. Runner stores the window in conversation memory.
5. EventService receives only the normalized event request.
6. Exa prompt treats the normalized window as authoritative.
7. Lightweight validator rejects provider candidates with detectable dates outside the window.

## Supported Expressions

Supported minimum expressions:

- `now`
- `today`
- `tonight`
- `later tonight`
- `tomorrow`
- `tomorrow morning`
- `tomorrow afternoon`
- `tomorrow evening`
- `tomorrow night`
- `this morning`
- `this afternoon`
- `this evening`
- bare weekdays, Monday through Sunday
- `this Monday` through `this Sunday`
- `next Monday` through `next Sunday`
- `this weekend`
- `next weekend`
- specific dates: `July 18`, `18 July`, `2026-07-18`, `July 18, 2026`
- date ranges: `July 18 to July 20`, `Friday to Sunday`
- contextual event follow-ups preserve event context while changing only the normalized window.

## Window Rules

Timezone: `Asia/Bangkok`, emitted as explicit ISO-8601 values with `+07:00`.

- Today: `00:00:00 -> 23:59:59`
- Tonight: `18:00:00 today -> 06:00:00 following day`
- Later tonight: current local time -> `06:00:00 following day`
- Tomorrow: `00:00:00 -> 23:59:59`
- Tomorrow morning: `06:00:00 -> 12:00:00`
- Tomorrow afternoon: `12:00:00 -> 17:00:00`
- Tomorrow evening: `17:00:00 -> 22:00:00`
- Tomorrow night: `18:00:00 tomorrow -> 06:00:00 following day`
- This weekend: Friday `18:00:00 -> Monday 06:00:00`
- Next weekend: next Friday `18:00:00 -> following Monday 06:00:00`

## Assumptions

- Thailand has no daylight saving time, so the resolver emits `+07:00`.
- Bare weekdays resolve to the next occurrence in the current week, including today if applicable.
- Month/day dates without a year roll into next year only when that month/day has already passed.
- Provider candidates without detectable dates are treated as ambiguous rather than rejected in this sprint.

## Files Created

- `docs/SIT_SPRINT_3_TIME_INTELLIGENCE.md`

## Files Changed

- `lib/sit-engine/src/time-resolver.ts`
- `lib/sit-engine/src/types.ts`
- `lib/sit-engine/src/conversation.ts`
- `lib/sit-engine/src/index.ts`
- `lib/sit-engine/src/runner.test.ts`
- `artifacts/api-server/src/services/time-resolver.ts`
- `artifacts/api-server/src/services/time-resolver.test.ts`
- `artifacts/api-server/src/services/event-service.ts`
- `artifacts/api-server/src/services/conversation-services.ts`
- `artifacts/api-server/src/services/developer-console.ts`
- `artifacts/api-server/src/phase2a.test.ts`
- `artifacts/sit-demo/src/lib/conversation-api.ts`
- `artifacts/sit-demo/src/lib/conversation-services.ts`
- `artifacts/sit-demo/src/pages/chat.tsx`

## Service Contract Changes

`EventService.search()` now receives an `EventSearchRequest`:

```ts
{
  queryText,
  timeWindow: {
    label,
    startTime,
    endTime,
    timezone,
    granularity,
    sourceExpression,
    confidence,
    clarificationNeeded
  },
  userContext,
  sourceConstraints,
  originalText
}
```

The provider prompt may include the original wording only as secondary context. The normalized `startTime` and `endTime` are authoritative.

## Memory Changes

Conversation memory now stores:

- `lastTimeWindow`
- `lastTimeLabel`
- `lastTemporalExpression`

`lastEvent` also carries the normalized `timeWindow`.

## Developer Console

Developer Console now exposes:

- original temporal expression
- resolved label
- start time
- end time
- timezone
- resolver confidence
- provider query window
- event candidates rejected for being outside the window

This remains developer-only.

## Test Coverage

Fixed-clock tests cover:

- today
- tonight
- later tonight
- tomorrow
- tomorrow morning
- tomorrow afternoon
- tomorrow evening
- tomorrow night
- this Wednesday
- next Wednesday
- bare weekday
- this weekend
- next weekend
- specific date
- date range
- month boundary
- year boundary
- late-night event after midnight
- contextual event follow-up
- tomorrow does not produce tonight window
- returned dated events outside the window are rejected
- Web and WhatsApp receive the same normalized window
- direct event follow-ups do not restart onboarding

## Remaining Risks

- Provider prose can still be ambiguous when it omits explicit dates; those candidates are not fully rejected yet.
- This sprint does not build full multi-source event ingestion.
- Event validation is lightweight and line-based; structured event extraction belongs in a later Event Intelligence sprint.

