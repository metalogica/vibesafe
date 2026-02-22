# Ingestion Brief

**Author**: Rei Nova
**Date**: 2026-02-21
**Status**: Draft

---

## User Story
* I paste a public URL in the search bar and hit Start Audit (e.g https://github.com/swirl-xyz/swirl)
* The ingestion system downloads the repo according to the specification in `docs/protocol/ingestion/ingestion-protocol.md`
* The audit system then executes according to `docs/protocol/audit/audit-protocol.md`:
  * I can see the live agent activity feed stream from convex, and see assessments in the vulnerabilities pane on the left stream in real time.
    * I if click on the assessment in the left pane I can see the modal appear with detailed responses.
    * I can filter for assessments in the lfet pane.
  * When the audit is complete i see the audit summary chart appear with a score from the evaluator

---

## Constraints

- MUST: follow `protocol/{ingestion,audit}`
- SHOULD: follow `docs/doctrine`

---

## References
* n/a

---

## Acceptance Criteria
* app should build
* app should pass lint
* ts compiler compiles

---

## Out of Scope
* n/a

---

## Open Questions
* If there is any ambiguity about the modal and if you need to update the data model to incliude 'detailed asssesment' text let me know in advance.

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
