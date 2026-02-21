/**
 * Spec Parser
 *
 * Parses markdown specification files into structured data for the orchestrator.
 */

import crypto from "crypto";
import fs from "fs";

import type { ParsedPhase, ParsedSpec, ParsedStep, VerifyCmd } from "./_types";

/**
 * Parse a spec file and return structured data.
 */
export function parseSpec(specPath: string): ParsedSpec {
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec file not found: ${specPath}`);
  }

  const content = fs.readFileSync(specPath, "utf-8");
  const hash = crypto.createHash("sha256").update(content).digest("hex");

  // Find the Prompting Strategy or Prompt Execution Strategy section
  const sectionMatch = content.match(
    /^## \d+\. (?:Prompting Strategy|Prompt Execution Strategy)\s*$/m,
  );
  if (!sectionMatch) {
    throw new Error(
      `Spec file missing required section. Expected "## N. Prompting Strategy" or "## N. Prompt Execution Strategy" header in ${specPath}`,
    );
  }

  const sectionStart = sectionMatch.index!;

  // Find the next ## header (next section) or end of file
  const nextSectionMatch = content
    .slice(sectionStart + sectionMatch[0].length)
    .match(/^## \d+\./m);
  const sectionEnd = nextSectionMatch
    ? sectionStart + sectionMatch[0].length + nextSectionMatch.index!
    : content.length;

  const strategySection = content.slice(sectionStart, sectionEnd);

  const phases = parsePhases(strategySection);

  return {
    path: specPath,
    hash,
    phases,
  };
}

/**
 * Parse phases from the prompting strategy section.
 */
function parsePhases(content: string): ParsedPhase[] {
  const phases: ParsedPhase[] = [];

  // Match all phase headers
  const phaseRegex = /^### Phase (\d+): (.+)$/gm;
  const phaseMatches: Array<{ index: number; number: number; name: string }> =
    [];

  let match;
  while ((match = phaseRegex.exec(content)) !== null) {
    phaseMatches.push({
      index: match.index,
      number: parseInt(match[1], 10),
      name: match[2].trim(),
    });
  }

  for (let i = 0; i < phaseMatches.length; i++) {
    const phaseMatch = phaseMatches[i];
    const nextPhaseStart = phaseMatches[i + 1]?.index ?? content.length;
    const phaseContent = content.slice(phaseMatch.index, nextPhaseStart);

    const steps = parseSteps(phaseContent, phaseMatch.number);
    const gate = parseGate(phaseContent);

    phases.push({
      number: phaseMatch.number,
      name: phaseMatch.name,
      steps,
      gate,
    });
  }

  return phases;
}

/**
 * Parse steps from a phase section.
 */
function parseSteps(phaseContent: string, phaseNumber: number): ParsedStep[] {
  const steps: ParsedStep[] = [];

  // Match step headers for this phase
  const stepRegex = new RegExp(
    `^#### Step (${phaseNumber}\\.\\d+): (.+)$`,
    "gm",
  );
  const stepMatches: Array<{ index: number; id: string; title: string }> = [];

  let match;
  while ((match = stepRegex.exec(phaseContent)) !== null) {
    stepMatches.push({
      index: match.index,
      id: match[1],
      title: match[2].trim(),
    });
  }

  for (let i = 0; i < stepMatches.length; i++) {
    const stepMatch = stepMatches[i];

    // Find end of this step (next step, gate, or end of phase)
    const nextStepStart = stepMatches[i + 1]?.index;
    const gateMatch = phaseContent.match(/^#### Gate$/m);
    const gateStart = gateMatch?.index;

    let stepEnd = phaseContent.length;
    if (
      nextStepStart !== undefined &&
      (gateStart === undefined || nextStepStart < gateStart)
    ) {
      stepEnd = nextStepStart;
    } else if (gateStart !== undefined) {
      stepEnd = gateStart;
    }

    const stepContent = phaseContent.slice(stepMatch.index, stepEnd);

    const { prompt, verify, timeout } = parseStepContent(stepContent);

    steps.push({
      id: stepMatch.id,
      title: stepMatch.title,
      prompt,
      verify,
      timeout,
    });
  }

  return steps;
}

/**
 * Parse the content of a single step to extract prompt, verify commands, and timeout.
 */
function parseStepContent(stepContent: string): {
  prompt: string;
  verify?: VerifyCmd[];
  timeout?: number;
} {
  // Remove the step header line
  const headerMatch = stepContent.match(/^#### Step .+$/m);
  const content = headerMatch
    ? stepContent.slice(headerMatch.index! + headerMatch[0].length).trim()
    : stepContent.trim();

  // Find verify section
  const verifyMatch = content.match(/^##### Verify$/m);
  let verify: VerifyCmd[] | undefined;

  if (verifyMatch) {
    const verifyStart = verifyMatch.index!;
    // Find where verify section ends (next ##### header or end)
    const afterVerify = content.slice(verifyStart + verifyMatch[0].length);
    const nextSection = afterVerify.match(/^##### /m);
    const verifyEnd = nextSection
      ? verifyStart + verifyMatch[0].length + nextSection.index!
      : content.length;

    const verifyContent = content.slice(verifyStart, verifyEnd);
    verify = parseCommands(verifyContent);
  }

  // Find timeout section
  const timeoutMatch = content.match(/^##### Timeout$/m);
  let timeout: number | undefined;

  if (timeoutMatch) {
    const timeoutStart = timeoutMatch.index!;
    const afterTimeout = content.slice(timeoutStart + timeoutMatch[0].length);
    const timeoutValue = afterTimeout.match(/^\s*(\d+)/);
    if (timeoutValue) {
      timeout = parseInt(timeoutValue[1], 10);
    }
  }

  // Extract prompt (everything before verify/timeout sections)
  let promptEnd = content.length;
  if (verifyMatch && verifyMatch.index! < promptEnd) {
    promptEnd = verifyMatch.index!;
  }
  if (timeoutMatch && timeoutMatch.index! < promptEnd) {
    promptEnd = timeoutMatch.index!;
  }

  const prompt = content.slice(0, promptEnd).trim();

  return { prompt, verify, timeout };
}

/**
 * Parse a gate section from phase content.
 */
function parseGate(phaseContent: string): VerifyCmd[] | undefined {
  const gateMatch = phaseContent.match(/^#### Gate$/m);
  if (!gateMatch) return undefined;

  const gateStart = gateMatch.index!;
  // Find end of gate section (next #### header or end)
  const afterGate = phaseContent.slice(gateStart + gateMatch[0].length);
  const nextSection = afterGate.match(/^#### /m);
  const gateEnd = nextSection
    ? gateStart + gateMatch[0].length + nextSection.index!
    : phaseContent.length;

  const gateContent = phaseContent.slice(gateStart, gateEnd);
  const commands = parseCommands(gateContent);

  return commands.length > 0 ? commands : undefined;
}

/**
 * Parse commands from a section containing markdown list items like: - `pnpm app:compile`
 */
function parseCommands(content: string): VerifyCmd[] {
  const commands: VerifyCmd[] = [];

  // Match list items with backtick commands: - `command args`
  const cmdRegex = /^- `([^`]+)`/gm;

  let match;
  while ((match = cmdRegex.exec(content)) !== null) {
    const fullCmd = match[1].trim();
    const parts = fullCmd.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    commands.push({ cmd, args });
  }

  return commands;
}

/**
 * Get the spec name from its path (filename without extension).
 */
export function getSpecName(specPath: string): string {
  const basename = specPath.split("/").pop() || specPath;
  return basename.replace(/\.md$/, "");
}

/**
 * Supabase commands that indicate database operations incompatible with worktrees.
 *
 * LIMITATION: Supabase CLI uses Docker containers named by project directory with fixed ports.
 * Running Supabase from a worktree would either:
 * 1. Reuse the main repo's containers (causing state pollution)
 * 2. Fail with port conflicts if trying to start new containers
 *
 * Specs containing these commands should use --no-worktree flag.
 */
const SUPABASE_COMMANDS = [
  "supabase",
  "supabase db",
  "supabase db reset",
  "supabase db push",
  "supabase db pull",
  "supabase migration",
  "supabase start",
  "supabase stop",
];

/**
 * Detect if a parsed spec contains Supabase commands that are incompatible with worktrees.
 * Checks both verification commands and prompt content.
 *
 * @returns Object with detection result and list of found commands
 */
export function detectSupabaseCommands(spec: ParsedSpec): {
  hasSupabaseCommands: boolean;
  foundCommands: string[];
  affectedSteps: string[];
} {
  const foundCommands: string[] = [];
  const affectedSteps: string[] = [];

  for (const phase of spec.phases) {
    // Check phase gates
    if (phase.gate) {
      for (const cmd of phase.gate) {
        if (isSupabaseCommand(cmd.cmd, cmd.args)) {
          const fullCmd = `${cmd.cmd} ${cmd.args.join(" ")}`.trim();
          if (!foundCommands.includes(fullCmd)) {
            foundCommands.push(fullCmd);
          }
          affectedSteps.push(`Phase ${phase.number} Gate`);
        }
      }
    }

    // Check steps
    for (const step of phase.steps) {
      // Check verification commands
      if (step.verify) {
        for (const cmd of step.verify) {
          if (isSupabaseCommand(cmd.cmd, cmd.args)) {
            const fullCmd = `${cmd.cmd} ${cmd.args.join(" ")}`.trim();
            if (!foundCommands.includes(fullCmd)) {
              foundCommands.push(fullCmd);
            }
            if (!affectedSteps.includes(`Step ${step.id}`)) {
              affectedSteps.push(`Step ${step.id}`);
            }
          }
        }
      }

      // Check prompt content for supabase commands
      const promptLower = step.prompt.toLowerCase();
      for (const supaCmd of SUPABASE_COMMANDS) {
        if (promptLower.includes(supaCmd)) {
          if (!foundCommands.includes(supaCmd)) {
            foundCommands.push(supaCmd);
          }
          if (!affectedSteps.includes(`Step ${step.id}`)) {
            affectedSteps.push(`Step ${step.id}`);
          }
        }
      }
    }
  }

  return {
    hasSupabaseCommands: foundCommands.length > 0,
    foundCommands,
    affectedSteps,
  };
}

/**
 * Check if a command is a Supabase command.
 */
function isSupabaseCommand(cmd: string, args: string[]): boolean {
  if (cmd === "supabase") {
    return true;
  }
  // Check for commands like "pnpm supabase" or "npx supabase"
  if ((cmd === "pnpm" || cmd === "npx" || cmd === "npm") && args[0] === "supabase") {
    return true;
  }
  return false;
}
