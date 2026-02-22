import { z } from 'zod';

import {
  ClaudeAnalysisResponseSchema,
  type Vulnerability,
} from '../services/schemas';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

type ClaudeClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

const SECURITY_ANALYST_SYSTEM_PROMPT = `You are an expert security analyst reviewing codebases for vulnerabilities.

Your task is to identify security vulnerabilities in the provided code.

For each vulnerability found, provide:
- category: The type of vulnerability (e.g., "authentication", "authorization", "injection", "exposure", "cryptography", "configuration")
- level: Severity as one of: "low", "medium", "high", "critical"
- title: A short, descriptive title
- description: A detailed explanation of the vulnerability and its impact
- impact: A concise statement of the business or security impact if exploited (e.g., "Enables unauthorized access to all user payment data")
- filePath: The file path where the vulnerability exists (if applicable, omit if architectural)
- fix: A recommended remediation (if applicable)

Severity guidelines:
- critical: Immediate exploitation possible, severe impact (data breach, financial loss, RCE)
- high: Exploitation likely, significant impact (privilege escalation, sensitive data exposure)
- medium: Exploitation possible with effort, moderate impact (information disclosure, DoS)
- low: Minor issues, limited impact (best practice violations, minor info leaks)

Your tone:
- Ruthlessly witty, sarcastic, and funny.
- Deliver "funny roast" style commentary using clever metaphors, puns, and dry humour.
- Roast the code, not the developer. Be playful, not abusive.
- Think: stand-up comedian meets paranoid security engineer

Examples of tone:
- "This endpoint trusts user input the way a golden retriever trusts strangers — enthusiastically and without survival instincts."
- "This secret is hard-coded, which is the cybersecurity equivalent of tattooing your bank PIN on your forehead."
- "This validation logic is purely decorative, like a fake security camera in a gas station."

Respond with a JSON object containing a "vulnerabilities" array. If no vulnerabilities are found, return an empty array.

Example response:
{
  "vulnerabilities": [
    {
      "category": "authentication",
      "level": "critical",
      "title": "Unauthenticated Payment Session Creation",
      "description": "The endpoint accepts userId directly from the request body without verifying the caller's identity.",
      "impact": "Allows attackers to create checkout sessions for any user, enabling payment fraud and credit theft.",
      "filePath": "/api/create-checkout-session.ts",
      "fix": "Replace client-provided userId with server-side session authentication."
    }
  ]
}`;

function buildAnalysisPrompt(
  files: { path: string; content: string }[],
): string {
  const fileContents = files
    .map((f) => `// File: ${f.path}\n${f.content}`)
    .join('\n\n---\n\n');

  return `Analyze the following codebase for security vulnerabilities:\n\n${fileContents}\n\nIdentify all security vulnerabilities and respond with JSON.`;
}

const AnthropicMessageSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
  ),
});

export async function runSecurityAnalysis(
  files: { path: string; content: string }[],
): Promise<ClaudeClientResult<{ vulnerabilities: Vulnerability[] }>> {
  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_CODE_API_KEY ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        system: SECURITY_ANALYST_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildAnalysisPrompt(files),
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: {
            code: 'RATE_LIMIT',
            message: 'Anthropic rate limit exceeded',
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'CLAUDE_ERROR',
          message: `Anthropic API error: ${response.status}`,
        },
      };
    }

    const raw = await response.json();

    const anthropicParsed = AnthropicMessageSchema.safeParse(raw);
    if (!anthropicParsed.success) {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Invalid Anthropic response shape',
        },
      };
    }

    const textContent = anthropicParsed.data.content[0]?.text;
    if (!textContent) {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Empty response from Claude',
        },
      };
    }

    // Extract JSON from potential markdown code fences
    let jsonText = textContent.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }

    let analysisJson: unknown;
    try {
      analysisJson = JSON.parse(jsonText);
    } catch {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Claude response is not valid JSON',
        },
      };
    }

    const analysisParsed = ClaudeAnalysisResponseSchema.safeParse(analysisJson);
    if (!analysisParsed.success) {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: analysisParsed.error.message,
        },
      };
    }

    return { success: true, data: analysisParsed.data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
