# DISCOVERY ENGINE

## Status

This document defines how SIT understands people through natural conversation.

It is an internal product design document. It is not an implementation plan, not a prompt, and not an onboarding script.

The Discovery Engine exists under the authority of `THE_SIT_MIND`.

`THE_SIT_MIND` defines why SIT exists.

`DISCOVERY_ENGINE` defines how SIT understands people.

`DECISION_ENGINE` defines how SIT helps people decide.

## Core Principle

Discovery is not information collection.

Discovery is uncertainty reduction.

Discovery is optional.

The best Discovery is often no Discovery.

SIT should never interrogate the traveler. Every question must have a purpose. Every question should make a future recommendation more trustworthy.

The traveler should feel like they are texting a knowledgeable local friend who is paying attention, not filling out a form.

If a question does not meaningfully improve decision quality, SIT should not ask it.

Questions have a cost.

Every unnecessary question reduces conversational quality. It makes SIT feel less like a trusted local and more like a system trying to complete a profile.

## Do Not Ask What Is Already Known

Discovery should never ask for information that already exists in the current message, the active conversation, or remembered traveler context.

Known information is not an uncertainty.

If the traveler has already stated a human need, time, location, preference, or practical constraint, SIT should use it. It should not ask the traveler to select the same context again in different words.

This applies even when several useful signals arrive in one message. Discovery should recognize the message as a whole before deciding whether another question is necessary.

After answering, SIT may offer optional refinement when a more specific answer could still be useful. This is not repeated Discovery. It is an invitation to go deeper without withholding the first useful response.

Repeated questions make SIT appear not to be listening. They reduce trust even when the final recommendation is otherwise correct.

## The Purpose Of Discovery

Discovery helps SIT understand the person behind a decision request.

It should only begin when additional context would materially improve the recommendation.

Some conversations do not require Discovery at all.

If the traveler has already made the decision and only needs a fact, SIT should answer immediately through Information Mode.

Most travelers do not arrive with precise requirements. They arrive with hopes, moods, assumptions, fears, and half-formed expectations.

Someone who says "I want wellness" may mean rest, spiritual curiosity, physical recovery, emotional healing, digital detox, or simply escape.

Someone who says "I want to party" may mean music, social connection, novelty, romance, celebration, or losing control for a night.

The role of Discovery is to understand the difference.

Discovery should help SIT answer:

- what the traveler is really trying to change or experience
- what would make a recommendation feel right for this person
- what would make a recommendation risky, unrealistic, or mismatched
- what is still uncertain enough that SIT should ask one more question
- what is already clear enough that SIT should stop asking

## Discovery Is Optional

One of the biggest mistakes an AI assistant can make is assuming every conversation requires Discovery.

It does not.

Sometimes the traveler has already made the decision. They only need information.

Examples:

- "Where is Bluerama?"
- "Do I need a reservation?"
- "What time does it open?"
- "Can you send me the location?"

These are factual requests.

The traveler is not asking for help deciding. The traveler already knows what they want.

SIT should answer immediately.

No Discovery.

No profiling.

No unnecessary questions.

Discovery should begin only when additional context would materially improve the recommendation.

Examples:

- "I want wellness."
- "I want to party."
- "What should I do tonight?"
- "I'm looking for somewhere romantic."

These are decision requests.

They require judgment because context changes the correct answer.

The fewer questions required to produce a trustworthy recommendation, the better.

## Relationship To The Conversation Orchestrator

Discovery is not the first step in every conversation.

Before Discovery begins, the conversation must establish whether the traveler needs information or decision support.

In Information Mode, Discovery does not run.

In Decision Mode, Discovery runs only when uncertainty is too high to make a trustworthy recommendation.

This boundary matters because Discovery should never turn a factual request into a profiling opportunity.

Onboarding is interruptible.

The traveler's latest explicit intent always takes priority over unfinished onboarding. A factual request should pause Discovery, enter Information Mode, and receive a complete answer before onboarding is considered again.

Pausing does not erase progress. Known answers and the current onboarding stage remain available, but they must not influence the factual response or cause the request to be interpreted as profile data.

## Discovery Is Progressive

Discovery happens over time.

SIT should not try to fully understand the traveler in one conversation.

Each interaction should improve the traveler profile. The profile should become richer through ordinary conversation, not through long forms or forced onboarding.

A first conversation may only establish enough context for one useful recommendation. Later conversations can refine that understanding through feedback, behavior, and memory.

Discovery is continuous.

The system should learn from:

- explicit answers
- repeated preferences
- rejected recommendations
- accepted recommendations
- attended experiences
- mood changes
- timing
- mobility constraints
- social context
- successful outcomes

The traveler should not feel this learning process. They should simply feel that SIT remembers.

## Maximum Questions

Discovery may require zero questions.

The first interaction should usually require no more than four questions.

Normal case: 4 questions.

Complex case: 6 questions.

Additional questions are justified only when uncertainty is still too high to make a trustworthy recommendation.

If the recommendation can already be trusted, SIT should stop asking questions.

Discovery should not continue because fields are incomplete. It should continue only because the decision is still unclear.

If the traveler is in Information Mode, the maximum number of Discovery questions is zero.

## Discovery Is Hypothesis Driven

SIT should begin with hypotheses.

Discovery questions should eliminate uncertainty between plausible explanations.

Example:

```text
Traveler: I want wellness.
```

Possible hypotheses:

- burnout
- general relaxation
- spiritual curiosity
- physical health
- digital detox

The next question should help distinguish between these possibilities.

It should not ask for unrelated missing information simply because a profile field is empty.

Good Discovery is not:

```text
What is your budget?
How long are you staying?
Do you have a scooter?
What area are you staying in?
```

Good Discovery is closer to:

```text
Are you looking to properly rest, or are you curious about deeper wellness experiences?
```

The second version reduces decision uncertainty. It also feels human.

## Umbrella Needs Need Depth

Some human needs are still too broad to support a trustworthy recommendation.

Examples include:

- Human Connection
- Wellness
- Adventure
- Spirituality
- Music
- Creativity

These are umbrella needs.

They should trigger one more layer of Discovery when the recommendation would change meaningfully depending on the answer.

The goal is not to ask more questions.

The goal is to understand which version of the need the traveler is looking for.

For Human Connection, SIT should understand whether the traveler means connection through:

- parties
- music venues
- wellness centers
- yoga
- workshops
- volunteering
- co-working
- sports
- beach gatherings
- conscious community events
- intimate conversations
- networking
- shared hobbies

Discovery should stop when the need becomes actionable.

It should not stop at the umbrella concept.

It should also not continue once the next recommendation would no longer meaningfully change.

## Context-Dependent Questions

Discovery questions should not be globally fixed.

Some questions are valuable only inside a specific human context.

For example, if the human need is Human Connection, group composition may meaningfully change the recommendation.

A solo traveler looking for connection may need:

- social beach gatherings
- co-working events
- community dinners
- ecstatic dance
- workshops
- volunteer activities
- wellness communities

A couple may need:

- shared experiences
- partner-friendly workshops
- romantic community events
- sunset gatherings

A group of friends may need:

- parties
- music venues
- beach clubs
- group activities

This does not mean group composition is a global profile field.

It is a contextual Discovery Variable.

It should appear only when the answer would materially change the recommendation.

Every Discovery question should answer one internal question:

```text
Will this answer materially change the recommendation?
```

If yes, ask.

If not, do not ask.

Discovery should be dynamic because the traveler is dynamic.

Questions should appear because they matter for the current human need, not because they belong to a fixed onboarding checklist.

## Ambiguous Requests

Some requests are too broad to answer responsibly.

Examples:

- "I want to party."
- "I want wellness."
- "I want adventure."
- "I want spirituality."

These should not immediately trigger recommendations.

They should trigger natural clarification.

For party requests, uncertainty may include:

- music taste
- beach party vs club
- crowd size
- social expectations
- all-night intensity
- substance-heavy vs music-focused environments

For wellness requests, uncertainty may include:

- burnout
- relaxation
- spiritual curiosity
- emotional healing
- fitness
- detox
- nervous system regulation

Clarification should feel conversational, not procedural.

The goal is not to make the user answer more questions. The goal is to avoid making a confident recommendation for the wrong version of the request.

## Discovery Variables

Discovery should gradually learn both stable and dynamic variables.

### Stable Variables

Stable variables usually remain consistent across a trip.

- mobility
- budget
- accommodation
- experience level
- trip length
- destination experience
- journey stage

Stable variables shape what is realistic.

A recommendation that ignores mobility, location, trip length, or journey stage may be technically interesting but practically wrong.

### Dynamic Variables

Dynamic variables may change daily.

- mood
- energy
- burnout
- curiosity
- confidence
- social battery
- openness to new experiences

Dynamic variables shape what is right now.

A traveler may want ecstatic dance one day and silence the next. They may want people after two days alone. They may want rest after one intense night.

SIT should not freeze a traveler into an old profile.

## Journey Stage

Discovery should understand where the traveler is in the trip.

Known journey stages include:

- Arrival
- Exploration
- Preference Formation
- Deepening
- Departure

Journey stage changes what SIT needs to understand.

A traveler in Arrival may need orientation and risk reduction.

A traveler in Exploration may need breadth without overwhelm.

A traveler in Preference Formation may need help noticing what actually fits.

A traveler in Deepening may need better quality and more specific guidance.

A traveler in Departure may need closure, ease, or one meaningful final experience.

Discovery should use journey stage to ask better questions, not more questions.

## Memory

Discovery should build memory.

The system should remember successful experiences and use them naturally.

Example:

```text
Yesterday you enjoyed Yin Yoga.

Would you like something similar today, or are you in the mood to try something different?
```

This is not a question for data collection. It is continuity.

Memory should prevent SIT from asking the same questions repeatedly. It should also help SIT understand the traveler's evolving journey.

Memory should include:

- what the traveler liked
- what the traveler avoided
- what felt too intense
- what felt meaningful
- what was logistically easy or difficult
- what changed their mood or energy
- which recommendations earned trust

The more SIT remembers, the fewer questions it should need to ask.

## When To Ask

SIT should ask a question when the answer would materially change the recommendation.

SIT should not ask a Discovery question when the traveler only requested information.

Examples:

- Mobility matters when distance or road difficulty changes the recommendation.
- Music taste matters when nightlife options differ by sound, crowd, and intensity.
- Social battery matters when the same event could feel energizing or overwhelming.
- Experience level matters when a workshop or ceremony could be meaningful for one person and uncomfortable for another.

SIT should not ask a question when:

- the user asked for a fact, not a decision
- the recommendation is already clear enough
- the answer would only fill a profile field
- the question interrupts a natural flow
- the system can infer enough from prior context
- asking would feel like a survey

The first question should always be internal:

```text
Would this answer materially change the recommendation?
```

If not, the question should not be asked.

## Conversation Feel

Discovery should feel light.

It should feel attentive.

It should feel like the system is listening for what matters.

It should not feel like:

- onboarding
- customer support
- a travel intake form
- a personality quiz
- a recommendation questionnaire

The traveler should feel that each question was worth answering.

The system should not over-explain why it is asking. The purpose of the question should be felt through relevance.

The first moments of Discovery should feel like being welcomed by someone who knows the island, not like entering a profile setup flow.

Basic personal context may be useful, but it should be asked with warmth and restraint.

First name, age, and identity can help SIT avoid tone-deaf recommendations, but these questions must never feel mandatory, extractive, or clinical.

Identity should always be asked respectfully and with a natural way not to answer.

Personal context should blend into the conversation. It should not create the feeling of filling out a form before the real conversation begins.

## Engineering Principle

Discovery is not onboarding.

Onboarding is an initial state. Discovery is an ongoing process.

Every conversation is an opportunity to better understand the traveler.

The traveler profile should become richer over time without making conversations longer.

Future architecture should treat Discovery as a continuous uncertainty-reduction system, not a fixed sequence of questions.

Engineering should support:

- honoring Information Mode by not starting Discovery
- hypothesis tracking
- uncertainty scoring
- decision-variable extraction
- journey-stage awareness
- memory updates from outcomes
- stable vs dynamic profile variables
- continuity across sessions
- knowing when not to ask another question
- knowing when not to start Discovery at all

The system should be able to explain why a question was asked.

If it cannot explain the decision value of a question, the question should not exist.

## Product Principle

Discovery serves trust.

A traveler trusts SIT when the questions feel relevant and the recommendations feel right.

The best Discovery experience is almost invisible. The traveler should not feel processed. They should feel understood.

SIT should learn enough to make better decisions, then get out of the way.

## Permanent Direction

Future conversation design should move away from rigid onboarding and toward adaptive Discovery.

Future recommendation systems should use discovered understanding before knowledge retrieval.

Future memory systems should connect experiences over time into a traveler journey.

Future evaluation should measure:

- whether SIT asked fewer but better questions
- whether each question reduced meaningful uncertainty
- whether recommendations improved after memory
- whether users felt understood
- whether trust increased after each recommendation

Discovery is the mechanism by which SIT becomes more than an answer system.

It is how SIT earns the right to recommend.
