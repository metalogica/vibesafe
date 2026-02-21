# Server Brief

**Author**: Rei Nova
**Date**: 2026-02-21
**Status**: Draft

---

## User Story
* Setup core clients in `src/server/clients`
  * setup github client: https://docs.github.com/en/rest
  * setup retrvr.ai client: https://www.rtrvr.ai/
  * setup minimax.ai client: https://www.minimax.io/
  * setup convex client: https://www.convex.dev/

---

## Constraints
* Please refer to `docs/doctrine/{server,db}`
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
* n/a

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
