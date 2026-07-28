# Contributing to SIT

GitHub is the source of truth for work, ownership, review, and history. Codex is an implementation tool.

## Founders

- **Iklima:** product vision, Discovery, Decision, UX, and product philosophy
- **Stefano:** local intelligence, music, events, community, and expert knowledge

Each task has one **Primary Owner**. Both founders review each other's work whenever practical.

## Workflow

1. Create or choose a GitHub Issue.
2. Record the **Requested by** and **Primary Owner**.
3. Create a branch from the latest `main`.
4. Give Codex a task using [`docs/templates/CODEX_TASK_TEMPLATE.md`](docs/templates/CODEX_TASK_TEMPLATE.md).
5. Review the implementation and commit it.
6. Open a Pull Request linked to the issue.
7. The other founder reviews the Pull Request.
8. Resolve review conversations and merge.

Use these responsibility labels consistently:

- **Requested by:** who identified or requested the work
- **Primary Owner:** the founder responsible for scope, decisions, and completion
- **Implemented with Codex:** whether Codex assisted with the implementation
- **Reviewed by:** the founder who reviewed the change
- **Merged by:** the person who completed the merge

GitHub already records commit authors, Pull Request authors, reviews, and merges. Do not reproduce that history in commits or documents. The fields above provide task context; GitHub remains authoritative.

## Protect Product Philosophy

Before implementation, determine whether the task changes:

- [`THE_SIT_MIND`](docs/mind/THE_SIT_MIND.md)
- [`DISCOVERY_ENGINE`](docs/mind/DISCOVERY_ENGINE.md)
- [`DECISION_ENGINE`](docs/mind/DECISION_ENGINE.md)

If it does, stop before implementation, explain the impact, and obtain explicit founder approval. Product philosophy must never change silently as a side effect of code.

## Branches

Use lowercase, hyphenated names:

- `feature/<issue>-description`
- `fix/<issue>-description`
- `docs/<issue>-description`

Examples: `feature/31-human-connection-discovery`, `fix/32-event-search`, `docs/33-update-pitch`.

## Commits

Use Conventional Commits. Keep human names out of commit titles because GitHub records authorship.

```text
feat(discovery): improve human connection branching
fix(events): broaden tonight event search
docs(mind): clarify product philosophy
```

Reference the issue in the commit body, for example `Refs #31` or `Fixes #32`.

## Recommended GitHub Settings

Configure the `main` branch manually to:

- require a Pull Request before merge
- require one approval
- require conversation resolution
- require status checks when they are available
- prevent direct pushes

