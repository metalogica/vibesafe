# Server Brief

**Author**: Rei Nova
**Date**: 2026-02-21
**Status**: Draft

---

## User Story
* Setup core clients that will be required for core `ingest` and `audit` services
  * setup github client: https://docs.github.com/en/rest
  * setup claude code client for analysis and evaluation: https://platform.claude.com/docs/en/home
  * setup convex client: https://www.convex.dev/

---

## Constraints
* Please refer to `docs/doctrine/{server,db}`
* Please refer to the protcols in `docs/protocol/{ingestion,audit}`
---

## References
* I have already installed all dependencies. We just need to scaffold directory structures and wrappers. No tests needed.

---

## Acceptance Criteria
* app should build
* app should pass lint
* ts compiler compiles

---

## Out of Scope
* no unit tests yet

---

## Open Questions
* assume i have all api keys required in `.env`. We show the boilerplate in `.env.local`.

---

<!--
TEMPLATE LOCATION: docs/protocol/sdd/templates/brief-template.md

USAGE:
1. Copy this file to: docs/tasks/ongoing/<feature>/<feature>-brief.md
2. Fill in all sections
3. Invoke: /architect @docs/tasks/ongoing/<feature>/<feature>-brief.md

PROTOCOL REFERENCE:
- Brief format spec: docs/protocol/sdd/brief-format.md
- Spec standards: docs/protocol/sdd/_SPEC-STANDARD.md
- Execution format: docs/protocol/sdd/execution-format.md
-->
