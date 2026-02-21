#!/usr/bin/env tsx
/**
 * Autonomous Spec Orchestrator v2
 *
 * Executes technical specifications via Claude Code CLI.
 *
 * Usage:
 *   pnpm tsx scripts/orchestrate.ts <spec-path> [options]
 *
 * Options:
 *   --dry-run       Parse and print plan without executing
 *   --quiet         Disable streaming (capture output instead)
 *   --fail-fast     Abort on first step failure
 *   --from N.M      Start from specific step (e.g., --from 2.3)
 *   --no-worktree   Run in current directory (not recommended)
 *   --verbose       Extra debug output
 *
 * Environment variables:
 *   ORCH_SPEC           Alternative way to specify spec path
 *   ORCH_MAX_ATTEMPTS   Retry attempts per step (default: 3)
 *   ORCH_STEP_TIMEOUT   Step timeout in ms (default: 180000)
 *   ORCH_VERIFY_TIMEOUT Verify timeout in ms (default: 120000)
 */

import fs from "fs";
import path from "path";

import {
  createCheckpoint,
  deleteCheckpoint,
  getCheckpointPath,
  loadCheckpoint,
  saveCheckpoint,
  updateCheckpointProgress,
  validateCheckpoint,
} from "./_checkpoint";
import { executeStep } from "./_executor";
import { acquireLock, getLockPath, releaseLock } from "./_lock";
import { detectSupabaseCommands, getSpecName, parseSpec } from "./_parser";
import type { OrchestratorConfig, ParsedSpec } from "./_types";
import { DEFAULT_CONFIG } from "./_types";
import { runVerification } from "./_verifier";
import {
  ensureWorktree,
  getWorktreeBranch,
  getWorktreePath,
  printPostRunInstructions,
} from "./_worktree";

/**
 * Parse command line arguments.
 */
function parseArgs(): { specPath: string; config: OrchestratorConfig } {
  const args = process.argv.slice(2);

  // Find spec path (first non-flag argument)
  const specPath = args.find((arg) => !arg.startsWith("--")) ||
    process.env.ORCH_SPEC;

  if (!specPath) {
    console.error(
      "Usage: pnpm tsx scripts/orchestrate.ts <spec-path> [options]",
    );
    console.error("");
    console.error("Options:");
    console.error("  --dry-run       Parse and print plan without executing");
    console.error(
      "  --quiet         Disable streaming (capture output instead)",
    );
    console.error("  --fail-fast     Abort on first step failure");
    console.error("  --from N.M      Start from specific step");
    console.error("  --no-worktree   Run in current directory");
    console.error("  --verbose       Extra debug output");
    process.exit(1);
  }

  const specName = getSpecName(specPath);

  const config: OrchestratorConfig = {
    ...DEFAULT_CONFIG,
    specPath,
    logDir: path.join(DEFAULT_CONFIG.worktreeBase, "logs", specName),
  };

  // Parse flags
  if (args.includes("--dry-run")) config.dryRun = true;
  if (args.includes("--quiet")) config.streaming = false;
  if (args.includes("--fail-fast")) config.failFast = true;
  if (args.includes("--no-worktree")) config.useWorktree = false;
  if (args.includes("--verbose")) config.streaming = false; // Verbose uses quiet mode with logging

  // Parse --from flag
  const fromIndex = args.indexOf("--from");
  if (fromIndex !== -1 && args[fromIndex + 1]) {
    const [phase, step] = args[fromIndex + 1].split(".").map(Number);
    if (!isNaN(phase) && !isNaN(step)) {
      // Store for later use if needed
      // fromStep = { phase: phase - 1, step: step - 1 }; // Convert to 0-indexed
    }
  }

  // Environment variable overrides
  if (process.env.ORCH_MAX_ATTEMPTS) {
    config.maxAttempts = parseInt(process.env.ORCH_MAX_ATTEMPTS, 10);
  }
  if (process.env.ORCH_STEP_TIMEOUT) {
    config.defaultStepTimeout = parseInt(process.env.ORCH_STEP_TIMEOUT, 10);
  }
  if (process.env.ORCH_VERIFY_TIMEOUT) {
    config.verifyTimeout = parseInt(process.env.ORCH_VERIFY_TIMEOUT, 10);
  }

  return { specPath, config };
}

/**
 * Print the execution plan.
 */
function printPlan(spec: ParsedSpec): void {
  console.log(`\n📋 Plan:`);

  let totalSteps = 0;
  let totalVerify = 0;

  for (const phase of spec.phases) {
    console.log(`  Phase ${phase.number}: ${phase.name}`);

    for (const step of phase.steps) {
      const timeoutStr = step.timeout ? `${step.timeout / 1000}s` : "180s";
      const verifyStr = step.verify?.length
        ? `verify: ${step.verify.length} cmd(s)`
        : "no verify";
      console.log(
        `    - ${step.id}: ${step.title} (timeout: ${timeoutStr}, ${verifyStr})`,
      );
      totalSteps++;
      totalVerify += step.verify?.length || 0;
    }

    if (phase.gate) {
      console.log(`    [GATE: ${phase.gate.map((g) => g.cmd).join(", ")}]`);
      totalVerify += phase.gate.length;
    }
  }

  console.log(
    `\nTotal: ${spec.phases.length} phases, ${totalSteps} steps, ${totalVerify} verification commands`,
  );
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const { specPath, config } = parseArgs();
  const specName = getSpecName(specPath);

  console.log(`Orchestrator v2.0.0`);
  console.log(`Spec: ${specPath}`);

  // Parse spec
  let spec: ParsedSpec;
  try {
    spec = parseSpec(specPath);
    console.log(`Hash: ${spec.hash.slice(0, 12)}...`);
  } catch (error) {
    console.error(
      `\n❌ Failed to parse spec: ${
        error instanceof Error ? error.message : error
      }`,
    );
    process.exit(1);
  }

  // Print plan
  printPlan(spec);

  // Pre-flight check: Detect Supabase commands incompatible with worktrees
  const supabaseCheck = detectSupabaseCommands(spec);
  if (supabaseCheck.hasSupabaseCommands && config.useWorktree) {
    console.warn(`\n⚠️  SUPABASE WORKTREE LIMITATION DETECTED`);
    console.warn(
      `   This spec contains Supabase commands that are incompatible with git worktrees.`,
    );
    console.warn(
      `   Supabase CLI uses Docker containers with fixed ports that cannot be isolated.`,
    );
    console.warn(
      `\n   Found commands: ${supabaseCheck.foundCommands.join(", ")}`,
    );
    console.warn(`   Affected: ${supabaseCheck.affectedSteps.join(", ")}`);
    console.warn(`\n   AUTO-DISABLING WORKTREE MODE`);
    console.warn(
      `   Running in current directory instead. Use --no-worktree to suppress this warning.`,
    );
    config.useWorktree = false;
  }

  if (config.dryRun) {
    if (supabaseCheck.hasSupabaseCommands) {
      console.log(
        `\n📋 Note: This spec requires --no-worktree due to Supabase commands.`,
      );
    }
    console.log(`\n🧪 DRY_RUN: No execution performed.`);
    return;
  }

  // Acquire lock
  const lockPath = getLockPath(config.worktreeBase, specName);
  try {
    acquireLock(lockPath);
  } catch (error) {
    console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Set up cleanup on exit
  const cleanup = () => releaseLock(lockPath);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    // Create/resume worktree
    let cwd = process.cwd();
    let worktreeBranch = "";

    if (config.useWorktree) {
      const worktreePath = getWorktreePath(config.worktreeBase, specName);
      const worktree = await ensureWorktree(
        process.cwd(),
        worktreePath,
        specName,
      );
      cwd = worktree.path;
      worktreeBranch = worktree.branch;

      if (worktree.created) {
        console.log(`\n🧪 Created worktree: ${worktreePath}`);
        console.log(`   Branch: ${worktreeBranch}`);
      } else {
        console.log(`\n🧪 Using existing worktree: ${worktreePath}`);
        console.log(`   Branch: ${worktreeBranch}`);
      }
    }

    // Create log directory
    fs.mkdirSync(config.logDir, { recursive: true });

    // Load or create checkpoint
    const checkpointPath = getCheckpointPath(config.worktreeBase, specName);
    let checkpoint = loadCheckpoint(checkpointPath);

    if (checkpoint) {
      const warning = validateCheckpoint(checkpoint, specPath, spec.hash);
      if (warning) {
        console.warn(`\n⚠️  ${warning}`);
      }
      console.log(
        `\n↩ Resuming from checkpoint: Phase ${
          checkpoint.phase + 1
        }, Step ${checkpoint.step}`,
      );
    } else {
      checkpoint = createCheckpoint(specPath, spec.hash, worktreeBranch);
      saveCheckpoint(checkpointPath, checkpoint);
    }

    // Execute phases
    for (let p = checkpoint.phase; p < spec.phases.length; p++) {
      const phase = spec.phases[p];
      console.log(`\n${"=".repeat(50)}`);
      console.log(`PHASE ${phase.number}: ${phase.name}`);
      console.log("=".repeat(50));

      const startStep = p === checkpoint.phase ? checkpoint.step : 0;

      for (let s = startStep; s < phase.steps.length; s++) {
        const step = phase.steps[s];
        await executeStep(cwd, step, config);

        // Update checkpoint
        checkpoint = updateCheckpointProgress(checkpoint, p, s + 1);
        saveCheckpoint(checkpointPath, checkpoint);
      }

      // Run phase gate if defined
      if (phase.gate && phase.gate.length > 0) {
        console.log(`\n🚧 Running phase gate...`);
        const gateLog = path.join(
          config.logDir,
          `phase_${phase.number}_gate.txt`,
        );
        const gateResult = await runVerification(
          cwd,
          phase.gate,
          gateLog,
          config.verifyTimeout,
        );

        if (!gateResult.success) {
          throw new Error(
            `Phase ${phase.number} gate failed:\n${gateResult.output}`,
          );
        }
        console.log(`   ✓ Phase gate passed`);
      }

      // Update checkpoint for next phase
      checkpoint = updateCheckpointProgress(checkpoint, p + 1, 0);
      saveCheckpoint(checkpointPath, checkpoint);
    }

    console.log(`\n✅ All phases complete!`);

    // Delete checkpoint on success
    deleteCheckpoint(checkpointPath);

    // Print post-run instructions
    const branch = config.useWorktree ? await getWorktreeBranch(cwd) : null;
    printPostRunInstructions(
      branch,
      config.useWorktree ? getWorktreePath(config.worktreeBase, specName) : "",
    );
  } catch (error) {
    console.error(
      `\n❌ Orchestrator failed: ${
        error instanceof Error ? error.message : error
      }`,
    );
    console.error(`   Logs: ${config.logDir}`);
    cleanup();
    process.exit(1);
  }

  cleanup();
}

main();
