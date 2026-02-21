/**
 * Executor Module
 *
 * Handles step execution with retry logic for the orchestrator.
 */

import fs from "fs";
import path from "path";

import {
  buildRetryPrompt,
  runClaudeQuiet,
  runClaudeStreaming,
} from "./_streaming";
import type { AgentResult, OrchestratorConfig, ParsedStep } from "./_types";
import { formatVerifyResult, runVerification } from "./_verifier";
import { commitIfDirty } from "./_worktree";

/**
 * Calculate backoff time for retries.
 */
function backoffMs(attempt: number): number {
  // 0->250ms, 1->750ms, 2->1750ms, ...
  return Math.min(10_000, 250 + attempt * attempt * 500);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure a directory exists.
 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Execute a single step with retry logic.
 */
export async function executeStep(
  cwd: string,
  step: ParsedStep,
  config: OrchestratorConfig,
): Promise<void> {
  console.log(`\n▶ Step ${step.id}: ${step.title}`);

  const stepLogDir = path.join(
    config.logDir,
    `step-${step.id.replace(/\./g, "_")}`,
  );
  ensureDir(stepLogDir);

  let previousError: string | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    if (attempt > 0) {
      console.log(`   ↻ Attempt ${attempt + 1}/${config.maxAttempts}`);
    }

    const agentLog = path.join(stepLogDir, `agent_attempt_${attempt + 1}.txt`);
    const verifyLog = path.join(
      stepLogDir,
      `verify_attempt_${attempt + 1}.txt`,
    );

    // Build prompt with error context if retrying
    const prompt = previousError
      ? buildRetryPrompt(step.prompt, previousError)
      : step.prompt;

    // Run Claude Code CLI
    // STRICT: Always use config timeout, ignore spec overrides to prevent hung steps
    const timeout = config.defaultStepTimeout;
    let result: AgentResult;

    if (config.streaming) {
      result = await runClaudeStreaming(cwd, prompt, agentLog, timeout);
    } else {
      result = await runClaudeQuiet(cwd, prompt, agentLog, timeout, false);
    }

    if (!result.success) {
      const wait = backoffMs(attempt);
      console.warn(
        `   ⚠ Claude reported failure: ${result.summary.slice(0, 100)}...`,
      );
      previousError = result.summary;

      if (config.failFast || attempt === config.maxAttempts - 1) {
        throw new StepFailedError(step, result.summary, attempt + 1);
      }

      console.log(`   ↻ Backing off ${wait}ms then retrying...`);
      await sleep(wait);
      continue;
    }

    // Run verification commands
    if (step.verify && step.verify.length > 0) {
      console.log("   🔎 Verifying...");

      const verifyResult = await runVerification(
        cwd,
        step.verify,
        verifyLog,
        config.verifyTimeout,
      );

      console.log(formatVerifyResult(verifyResult));

      if (!verifyResult.success) {
        const wait = backoffMs(attempt);
        previousError = verifyResult.output;

        if (config.failFast || attempt === config.maxAttempts - 1) {
          throw new VerificationFailedError(
            step,
            verifyResult.output,
            attempt + 1,
          );
        }

        console.log(`   ↻ Backing off ${wait}ms then retrying step...`);
        await sleep(wait);
        continue;
      }
    }

    // Commit changes
    await commitIfDirty(cwd, `orchestrator: step ${step.id} - ${step.title}`);

    console.log(
      `   ✓ Committed: orchestrator: step ${step.id} - ${step.title}`,
    );

    return; // Success!
  }
}

/**
 * Error thrown when a step fails after all retries.
 */
export class StepFailedError extends Error {
  constructor(
    public readonly step: ParsedStep,
    public readonly summary: string,
    public readonly attempts: number,
  ) {
    super(`Step ${step.id} failed after ${attempts} attempts: ${summary}`);
    this.name = "StepFailedError";
  }
}

/**
 * Error thrown when verification fails after all retries.
 */
export class VerificationFailedError extends Error {
  constructor(
    public readonly step: ParsedStep,
    public readonly output: string,
    public readonly attempts: number,
  ) {
    super(
      `Step ${step.id} verification failed after ${attempts} attempts: ${
        output.slice(0, 500)
      }`,
    );
    this.name = "VerificationFailedError";
  }
}
