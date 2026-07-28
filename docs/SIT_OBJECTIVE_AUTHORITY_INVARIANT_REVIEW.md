# SIT Objective Authority Invariant: Architecture Review

## Document Status

- Audience: CTO, founders, product architecture, AI engineering
- Review date: 28 July 2026
- Scope: Ownership authority over the Active Conversation Task
- Purpose: Determine whether internal workflows may replace the traveler's active objective
- Change policy: This is an architecture review. It does not modify product behavior or source code.

## Executive Verdict

The proposed invariant is necessary, but its wording requires one important distinction:

> The traveler owns semantic authority over the objective. The Conversation Orchestrator owns mechanical authority over task state.

The traveler decides what SIT is helping with. Only the Conversation Orchestrator may technically commit that objective to state.

No internal workflow should be allowed to originate or silently activate a different user objective.

## Does This Authority Already Exist?

It is implied in the current architecture documents, but it is not explicit enough.

The architecture already states that:

- The Active Conversation Task owns the current objective.
- Traveler context may enrich but must not replace an explicit request.
- Restarting requires a new user objective.
- Only the canonical runner may replace a task.
- A Conversation Contract is superseded when the user starts a new task.

These rules appear in:

- `docs/SIT_DECISION_PROCESS_CTO_REVIEW.md`, particularly the Active Conversation Task, transition rules, and centralized task transition sections.
- `docs/SIT_CONVERSATION_CONTRACT_ARCHITECTURE_REVIEW.md`, particularly the contract lifecycle and architectural invariants.

What is missing is an explicit prohibition:

> No internal workflow may originate or silently activate a different user objective.

## Current Implementation Assessment

This invariant is not currently enforced because the implemented `ConversationState` does not yet contain a first-class Active Conversation Task.

It contains:

- conversation context
- conversation memory
- conversation turns

It does not contain one owned active objective with a controlled lifecycle.

Current authority is therefore fragmented.

| Workflow | May it replace the objective architecturally? | Current behavior |
| --- | --- | --- |
| Discovery | No | Can become the effective objective through fallback |
| Legacy onboarding | No | Can take control when no direct intent matches |
| Fallback logic | No | Defaults to onboarding |
| Service fallback | No | Can emit untracked clarification text |
| Intent router | No | Effectively selects a new workflow |
| Clarification logic | No | Is not represented as a task-owned transition |
| Conversation Orchestrator | Yes, but only with traveler authority | Currently selects behavior without an objective invariant |

The clearest current violation occurs when failure to detect a direct request activates onboarding and changes the effective mode to Discovery.

The intent router also maps `general_chat` to `continue_onboarding`.

This means classification failure can silently become an objective change.

## Challenge To The Proposed Rule

The proposed rule says:

> The system may only continue, clarify, complete, or abandon the current task.

This is directionally correct, but slightly too restrictive.

Two additional transitions are necessary.

### Modify

The traveler may change one constraint while preserving the objective.

Examples:

- `Tomorrow instead`
- `Only Sri Thanu`
- `After 6pm`
- `Only free`

These messages modify the current task. They do not replace it.

### Suspend For A Child Task

The traveler may ask a supporting factual question while another task remains contextually relevant.

Example:

```text
SIT recommends an event at Arcana.

Traveler: Where is Arcana?
```

The location question may be a child task supporting the event task rather than a replacement of the event objective.

After answering it, SIT may retain the event context. It must not automatically resume an unrelated Discovery or onboarding workflow.

The system may also propose another objective, but it cannot activate that objective until the traveler accepts it.

## Objective Authority Invariant

The architecture should formally adopt the following invariant:

> Every Active Conversation Task must originate from a traveler request or the traveler's acceptance of a system proposal. No internal workflow may create, replace, broaden, or resume an objective independently. Only the Conversation Orchestrator may commit task transitions, and every objective-changing transition must contain evidence of traveler intent.

This creates two distinct forms of authority.

### Semantic Authority

The traveler owns:

- the objective
- explicit constraints
- objective changes
- acceptance of a system-proposed objective
- abandonment or replacement through a new request

### Mechanical Authority

The Conversation Orchestrator owns:

- creating task state from traveler intent
- committing valid task transitions
- applying traveler-authorized modifications
- opening and closing Conversation Contracts
- completing or closing tasks
- recording why a task changed

## Internal Workflow Authority

Internal components may provide evidence and propose transitions. They may not commit objective changes.

```text
Intent Router
  -> proposes an interpretation

Discovery
  -> proposes a clarification

Service
  -> returns evidence, ambiguity, or failure

Fallback
  -> reports inability to fulfil the task

Conversation Contract
  -> reports fulfilment, decline, or ambiguity

Conversation Orchestrator
  -> validates and commits the transition
```

### Discovery

Discovery may clarify or enrich an eligible Decision task.

It may not:

- replace the objective
- become the objective
- resume automatically after an Information request
- broaden explicit traveler constraints

### Legacy Onboarding

Legacy onboarding must have no independent task authority.

It may run only when:

- a Decision task makes Discovery eligible
- the traveler accepts the interaction
- the questions materially improve the current decision

Incomplete onboarding is not a pending objective.

### Fallback Logic

Fallback may report that the current task cannot be fulfilled.

It may not choose a different task to keep the conversation moving.

A failed location lookup must remain a location task. It must not become Discovery, onboarding, knowledge search, or general chat unless the traveler changes direction.

### Service Fallback

Services return structured outcomes such as:

- resolved
- ambiguous
- needs clarification
- unavailable
- not found

They do not own conversation transitions and cannot create a new objective through response text.

### Intent Router

The Intent Router proposes what the traveler may mean.

It does not own the Active Conversation Task and cannot replace it.

Classification failure must mean:

```text
The current message was not confidently understood.
```

It must never mean:

```text
Resume onboarding.
```

### Clarification Logic

Clarification remains inside the current task and its Conversation Contract.

It may resolve missing information, narrow ambiguity, or record that the traveler declined to answer.

It cannot silently redirect the conversation to a different objective.

## Allowed System Actions

Without a new traveler objective, SIT may:

- continue the task
- clarify the task
- gather evidence
- refine inferred context without changing explicit constraints
- apply traveler-authorized modifications
- complete the task
- close it unresolved with a recorded reason
- decline for safety or insufficient evidence
- suspend it for a traveler-initiated child task
- propose a different objective without activating it

## Prohibited System Actions

SIT may never silently:

- restart onboarding
- resume old Discovery
- broaden the request
- replace the objective after service failure
- convert a fallback into a different task
- interpret classification failure as permission to change objectives
- allow a Conversation Contract to outlive its parent task
- activate a system suggestion without traveler acceptance

## Transition Evidence

Every objective-changing transition should be attributable to traveler evidence.

Examples include:

- a direct new request
- an explicit correction
- a clear modification such as `Tomorrow instead`
- acceptance of a system proposal
- an explicit cancellation or refusal

The transition record should make it possible to answer internally:

- Which traveler message authorized this transition?
- Was the objective continued, modified, suspended, replaced, completed, or closed?
- Which component proposed the transition?
- Why did the Conversation Orchestrator accept it?

## Final Ownership Model

```text
Traveler
= owns the objective

Conversation Orchestrator
= owns task transitions

Active Conversation Task
= stores the objective

Conversation Contract
= stores the expected next response

Internal workflows
= provide evidence and transition proposals only
```

## Final Assessment

The Objective Authority Invariant should become a formal architectural invariant.

The Active Conversation Task provides continuity.

The Conversation Contract preserves turn-level expectations.

The Objective Authority Invariant prevents internal workflows from taking control of either one.

The recommended final architecture is:

```text
One traveler-owned objective

stored in one Active Conversation Task

transitioned by one Conversation Orchestrator

with zero internal workflows allowed to replace it independently
```

This closes the remaining authority gap while preserving the system's ability to clarify, modify, complete, decline, and support traveler-initiated child tasks.
