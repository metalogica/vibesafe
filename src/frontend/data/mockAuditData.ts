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
    category: 'authentication',
    description:
      "The /api/create-checkout-session endpoint accepts userId directly from the request body without verifying the caller's identity.",
    impact:
      'Direct revenue theft and fraudulent crediting.',
    fix: 'Replace client-provided userId with server-authenticated user ID.',
  },
  {
    id: 'SEC-A-002',
    title: 'Webhook Payment Replay Attack',
    file: '/api/webhooks/stripe.ts',
    severity: 'critical',
    category: 'authorization',
    description:
      'The Stripe webhook handler lacks idempotency controls.',
    impact:
      'Unlimited credit creation and financial loss.',
    fix: 'Add idempotency key checking before payment insertion.',
  },
  {
    id: 'SEC-A-003',
    title: 'Client-Side Credit Enforcement Bypass',
    file: 'services/geminiService.ts',
    severity: 'critical',
    category: 'authorization',
    description:
      'Hybrid generation paths bypass server-side credit validation.',
    impact:
      'Free unlimited usage and monetization failure.',
    fix: 'Remove local generation mode from production builds.',
  },
  {
    id: 'SEC-A-004',
    title: 'Public Project UUID Enumeration',
    file: 'hooks/session/useProjectState.ts',
    severity: 'high',
    category: 'exposure',
    description:
      'Insufficient RLS enables enumeration of project UUIDs.',
    impact:
      'Cross-tenant data exposure.',
    fix: 'Tighten RLS policies and add explicit share tokens.',
  },
  {
    id: 'SEC-A-007',
    title: 'API Key Exposure in Client Bundle',
    file: 'services/geminiService.ts',
    severity: 'high',
    category: 'exposure',
    description:
      'API keys risk inclusion in client bundles.',
    impact:
      'API abuse and unexpected provider charges.',
    fix: 'Remove all Google Gemini API interaction from client.',
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
