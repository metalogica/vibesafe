# Landing Brief

**Author**: Rei Nova
**Date**: 2026-02-21
**Status**: Draft

---

## User Story
* I placed a prototye app from gemini web studio in `/prototype`.
* Please isolate ONLY the landing page components, and port them into `/src/frontend`
* Create `/roast` and move the current app in there; then load the main landing page that we just ported from the prototype.

---

## Constraints

- MUST: double check work before moving on
- MUST NOT: write tests
- SHOULD: Refactor during port

---

## References
* `/prototype` has the app; you'll need to grok the structure and isolate the relevant parts.

---

## Acceptance Criteria
* app should build
* app should pass lint
* ts compiler compiles
* app tests should pass

---

## Out of Scope
* n/a

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
