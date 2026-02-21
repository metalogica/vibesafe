import type { Vulnerability } from '@/src/frontend/types';

export interface ScenarioMessage {
  agent: string;
  text: string;
  belief?: number;
  delay: number;
}

export function generateCommitHash() {
  return Math.random().toString(36).substring(2, 10);
}

export const INITIAL_VULNERABILITIES: Vulnerability[] = [
  {
    id: 'SEC-A-001',
    title: 'Unauthenticated Payment Session Creation',
    file: '/api/create-checkout-session.ts',
    severity: 'critical',
    description:
      "The /api/create-checkout-session endpoint accepts userId directly from the request body without verifying the caller's identity. An attacker can create Stripe checkout sessions for any user ID, complete the payment themselves, and credit another user's account.",
    impact:
      'Direct revenue theft and fraudulent crediting. Attackers can fund arbitrary accounts without authorization.',
    fix: "Replace client-provided userId with server-authenticated user ID. Modify /api/create-checkout-session.ts to:\n1. Accept bearer token in Authorization header\n2. Call supabaseAdmin.auth.getUser(token) to extract verified user.id\n3. Use this server-verified ID for metadata.userId\n4. Reject requests with missing/invalid tokens (401)",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-002',
    title: 'Webhook Payment Replay Attack',
    file: '/api/webhooks/stripe.ts',
    severity: 'critical',
    description:
      'The Stripe webhook handler lacks idempotency controls. It inserts payment records based solely on session.metadata.userId and amount_total without checking if the stripe_payment_id already exists.',
    impact:
      'Unlimited credit creation and financial loss. An attacker can replay the same webhook event indefinitely to mint credits.',
    fix: "Add idempotency key checking before payment insertion. Modify /api/webhooks/stripe.ts to:\n1. Query payments table for existing stripe_payment_id before insert\n2. If record exists, log warning and return 200\n3. Add unique constraint on stripe_payment_id column",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-003',
    title: 'Client-Side Credit Enforcement Bypass',
    file: 'services/geminiService.ts',
    severity: 'critical',
    description:
      'Hybrid generation paths bypass server-side credit validation. In local mode, credit deduction occurs client-side via a "fire-and-forget" RLS insert which can be blocked or manipulated.',
    impact:
      'Free unlimited usage and monetization failure. Attackers can generate content without paying.',
    fix: "Remove local generation mode from production builds.\n1. Remove API_KEY from all environment configs\n2. Force all production calls through /api/generate with server-side credit checks\n3. Add server-side rate limiting",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-004',
    title: 'Public Project UUID Enumeration',
    file: 'hooks/session/useProjectState.ts',
    severity: 'high',
    description:
      'Insufficient RLS enables enumeration of project UUIDs. Client queries filter by owner_id but the RLS policy allows SELECT if is_public = true, enabling enumeration of all public projects.',
    impact:
      'Cross-tenant data exposure. Attackers can scrape all public project metadata and file paths.',
    fix: "Tighten RLS policies and add explicit share tokens.\n1. Remove anonymous SELECT policy on projects table\n2. Add share_token column to projects\n3. Require share_token in RLS policy for public access",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-007',
    title: 'API Key Exposure in Client Bundle',
    file: 'services/geminiService.ts',
    severity: 'high',
    description:
      'API keys risk inclusion in client bundles. The system instruction and API key logic is bundled into client-side JavaScript if process.env.API_KEY is set during build.',
    impact:
      'API abuse and unexpected provider charges. Leaks proprietary prompt engineering IP.',
    fix: "Remove all Google Gemini API interaction from client.\n1. Delete API_KEY references from .env\n2. Move SYSTEM_INSTRUCTION_TEXT to server-only module\n3. Audit production bundle to confirm removal",
    status: 'open',
    commitDetected: '8f2a1b',
  },
];

export const AUDIT_SCENARIO_MESSAGES: ScenarioMessage[] = [
  {
    agent: 'retriever',
    text: 'Scanning Dreamtable repository... Found Supabase configuration, Stripe integration, and Gemini AI service wrappers. Identifying auth patterns...',
    delay: 500,
  },
  {
    agent: 'retriever',
    text: 'Retrieved Stripe documentation on Webhook Best Practices. Idempotency checks are required to prevent double-crediting. Checking /api/webhooks/stripe.ts...',
    delay: 1500,
  },
  {
    agent: 'security',
    text: 'Critical finding in /api/webhooks/stripe.ts. No check for existing stripe_payment_id before inserting credits. This allows replay attacks.',
    delay: 2500,
  },
  {
    agent: 'retriever',
    text: "Analyzing /api/create-checkout-session.ts against authentication specs. Endpoint accepts 'userId' in request body.",
    delay: 3500,
  },
  {
    agent: 'security',
    text: 'Confirmed. The endpoint trusts the client-provided userId. I can create a session for any user. This is a Critical broken access control vulnerability (SEC-A-001).',
    delay: 4500,
  },
  {
    agent: 'security',
    text: 'Also found API_KEY usage in client-side geminiService.ts. This exposes the LLM credentials to the browser.',
    delay: 5500,
  },
  {
    agent: 'evaluator',
    text: 'Audit Complete. 3 Critical and 2 High severity vulnerabilities found. Payment system is insecure and API keys are exposed. Deployment unsafe.',
    belief: 12,
    delay: 6500,
  },
];

export const FIX_SCENARIO_MESSAGES: ScenarioMessage[] = [
  {
    agent: 'retriever',
    text: 'Detecting changes... /api/create-checkout-session.ts now verifies Bearer tokens. /api/webhooks/stripe.ts added idempotency check.',
    delay: 500,
  },
  {
    agent: 'security',
    text: 'Verifying SEC-A-001 fix. The endpoint now derives userId from supabaseAdmin.auth.getUser(). Client-side spoofing is impossible.',
    delay: 1500,
  },
  {
    agent: 'security',
    text: 'Verifying SEC-A-002 fix. Database constraint added for stripe_payment_id. Replay attacks will now fail at the database level.',
    delay: 2500,
  },
  {
    agent: 'retriever',
    text: 'Checking geminiService.ts. Client-side generation code removed. All calls routed through /api/generate.',
    delay: 3500,
  },
  {
    agent: 'evaluator',
    text: 'Re-evaluation complete. Critical payment and auth vulnerabilities resolved. RLS policies tightened. Deployment approved.',
    belief: 94,
    delay: 4500,
  },
];
