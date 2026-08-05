# SIT Agent Runtime

## Purpose

The SIT Agent Runtime is the implementation path from a deterministic conversation pipeline with an LLM copy-editing layer to a model-led, tool-grounded Local Intelligence System.

It does not replace THE_SIT_MIND, DISCOVERY_ENGINE, or DECISION_ENGINE. Those documents remain the product authority. This document describes how their existing principles become observable software behavior.

## Why the Current LLM Layer Is Not Enough

The canonical runner currently selects intent, state transitions, services, filters, and fallbacks before the LLM is called. The LLM receives the deterministic draft and can rewrite its language, but it cannot repair an objective that was lost, a category that was broadened, an incorrect follow-up interpretation, or an unnecessary Discovery question.

This produces natural language on top of occasionally brittle decisions.

The target is a hybrid system:

```text
Traveler message
-> request mode
-> model-led conversation plan
-> active task and immutable constraints
-> grounded tool calls
-> decision
-> natural SIT response
-> validated state update
```

The model owns semantic interpretation and judgment. Deterministic services continue to own current facts, destination time, event filtering, venue records, knowledge retrieval, and persistence.

## Rollout Strategy

### Stage 0: Shadow Agent

The first implementation runs the proposed agent beside the canonical runner in Developer Mode.

The Shadow Agent receives:

- the current user message
- the active task and Conversation Contract
- conversation memory and recent turns
- the canonical decision
- grounded service evidence
- the canonical customer-facing answer

It produces:

- Information Mode or Decision Mode
- relationship to the active task
- current traveler objective
- known constraints and their sources
- missing context that would materially change the answer
- required services
- proposed Conversation Contract
- a concise decision summary
- a proposed customer response
- material differences from the canonical result

The Shadow Agent never changes messages, state, service routing, or customer behavior. It is available only when Developer Mode is active and `SIT_AGENT_SHADOW_ENABLED=true`.

### Stage 1: Evaluation Baseline

Real failed conversations become permanent evaluation cases. Initial groups include:

- explicit wellness context surviving Discovery
- refinements such as "only wellness" and "only free" preserving the active request
- date changes modifying rather than replacing the task
- location answers satisfying an active venue contract
- factual sequences suppressing Discovery
- unrelated new objectives replacing stale location or event context
- honest unknown answers with useful search fallbacks

Each candidate runtime is measured against the same cases before receiving customer-facing authority.

### Stage 2: Agent Tool Planning

After shadow decisions are reliable, the agent may select typed read-only services. The service interfaces remain the authority for events, knowledge, locations, plans, recommendations, and destination context.

Tool results must be validated before they enter the response. The agent may request another tool only when evidence required by the active objective is still missing.

### Stage 3: Agent Response Authority

The agent may produce the customer-facing response only after it consistently passes the evaluation baseline. State changes remain validated against the active-task ownership invariant and typed memory rules.

Rollout should be gradual:

```text
Developer shadow
-> internal founder testing
-> small beta percentage
-> monitored default
```

The deterministic runner remains an operational fallback until the agent path is proven stable.

### Stage 4: Learning From Corrections

Founder corrections and successful real conversations become reviewed examples. They improve prompts, evaluation criteria, service contracts, and retrieval quality.

Fine-tuning is considered only after the examples are numerous, consistent, and representative. It is appropriate for stable conversation and decision patterns, not for current event, venue, or operating information.

## Shadow Agent Safety Boundary

The Shadow Agent is disabled by default and requires all of the following:

- Developer trace mode
- a development server or `SIT_DEVELOPER_MODE_ENABLED=true`
- `SIT_AGENT_SHADOW_ENABLED=true`
- `OPENAI_API_KEY`

Failure, timeout, invalid JSON, or a missing key is isolated inside the developer trace. It cannot alter the canonical response or persisted state.

## Configuration

```text
SIT_AGENT_SHADOW_ENABLED=false
SIT_DEVELOPER_MODE_ENABLED=false
SIT_AGENT_MODEL=gpt-5.6-sol
SIT_AGENT_REASONING_EFFORT=medium
SIT_AGENT_TIMEOUT_MS=20000
OPENAI_API_KEY=
```

Model selection must be evaluated on SIT's real conversation set. Higher reasoning effort is not a substitute for explicit success criteria, correct state ownership, reliable tools, or evidence validation.

## Developer Console

The Shadow Agent panel exposes application-level reasoning only:

- current objective
- mode and action
- active-task relationship
- known and missing context
- services requested
- Conversation Contract
- preserved constraints
- confidence
- concise decision summary
- proposed response
- canonical comparison

It does not expose hidden chain-of-thought.

## Current Status

Stage 0 is wired into the server and Developer Console. It is disabled until an API key and the shadow feature flag are configured. Mocked API tests verify isolation, prompt context, structured output parsing, and failure handling.

The Shadow Agent does not yet call SIT services or answer travelers. Those capabilities belong to later stages and require evaluation evidence before activation.
