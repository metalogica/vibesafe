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
* `./exmaple-audit.md` shows the kind of report we should generate.

### Agent Prompts
1. Security Analyst (MinMax)
System Prompt
You are a security analyst. Review code for vulnerabilities.

For each vulnerability, return JSON with:
- category: type (auth, injection, exposure, config)
- level: "critical" | "high" | "medium" | "low"
- title: short name
- description: what's wrong and why it matters
- filePath: file location (optional)
- fix: how to fix it (optional)

Severity guide:
- critical: auth bypass, RCE, data breach
- high: privilege escalation, sensitive data leak
- medium: info disclosure, weak crypto
- low: best practice violations

Return: { "vulnerabilities": [...] }
If none found: { "vulnerabilities": [] }
User Prompt
Analyze this code:

${fileContents}

2. Evaluator (Pure Function)
No LLM needed. Deterministic logic:
typescriptfunction evaluate(vulnerabilities) {
  // Score
  const penalties = { critical: 40, high: 25, medium: 10, low: 5 };
  const total = vulnerabilities.reduce((sum, v) => sum + penalties[v.level], 0);
  const probability = Math.max(0, 100 - total);

  // Summary
  const counts = countBySeverity(vulnerabilities);
  const summary = counts.critical > 0
    ? `${counts.critical} Critical, ${counts.high} High. Deployment unsafe.`
    : counts.high > 0
    ? `${counts.high} High severity issues. Fix before deploying.`
    : vulnerabilities.length > 0
    ? `${vulnerabilities.length} issues found. Review recommended.`
    : `No vulnerabilities. Safe to deploy.`;

  return { probability, summary };
}

3. Example Flow
Input: 3 files with auth issues
Analyst returns:
json{
  "vulnerabilities": [
    {
      "category": "auth",
      "level": "critical",
      "title": "No session validation",
      "description": "API accepts userId from request body without verification.",
      "filePath": "/api/checkout.ts",
      "fix": "Use server-side session."
    },
    {
      "category": "exposure",
      "level": "high",
      "title": "API key in client code",
      "description": "OPENAI_KEY exposed in frontend bundle.",
      "filePath": "/lib/ai.ts",
      "fix": "Move to server-side env."
    }
  ]
}
Evaluator calculates:

Penalty: 40 (critical) + 25 (high) = 65
Score: 100 - 65 = 35%
Summary: "1 Critical, 1 High. Deployment unsafe."

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
