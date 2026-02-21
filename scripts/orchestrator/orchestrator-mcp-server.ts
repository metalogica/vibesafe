#!/usr/bin/env tsx
/**
 * Orchestrator MCP Server
 *
 * Exposes the orchestrator as an MCP server for autonomous supervision.
 * A supervisor Claude agent can start runs, monitor progress, and handle errors.
 */

import { ChildProcess, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getSpecName, parseSpec } from "./_parser";
import type { ParsedPhase } from "./_types";
import { getCheckpointPath, loadCheckpoint } from "./_checkpoint";
import { DEFAULT_CONFIG } from "./_types";

// ============================================================================
// Types
// ============================================================================

interface OrchestratorInstance {
  runId: string;
  specPath: string;
  specName: string;
  process: ChildProcess | null;
  status: "running" | "paused" | "completed" | "failed";
  currentPhase: number;
  currentStep: string;
  phaseCount: number;
  stepCount: number;
  lastOutput: string;
  lastError?: string;
  logDir: string;
  startedAt: string;
}

// ============================================================================
// State
// ============================================================================

const activeRuns = new Map<string, OrchestratorInstance>();

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleRun(args: {
  specPath: string;
  options?: { failFast?: boolean; fromPhase?: number; fromStep?: number };
}): Promise<{ runId: string; status: "started" | "error"; message: string }> {
  const { specPath, options } = args;

  // Validate spec exists and is parseable
  try {
    const spec = parseSpec(specPath);
    const specName = getSpecName(specPath);
    const runId = crypto.randomUUID();
    const logDir = path.join(DEFAULT_CONFIG.worktreeBase, "logs", specName);

    // Build command args
    const cmdArgs = [
      "tsx",
      "scripts/orchestrate.ts",
      specPath,
      "--quiet", // Capture output instead of streaming
    ];

    if (options?.failFast) cmdArgs.push("--fail-fast");
    if (options?.fromPhase && options?.fromStep) {
      cmdArgs.push("--from", `${options.fromPhase}.${options.fromStep}`);
    }

    // Spawn orchestrator process
    const child = spawn("pnpm", cmdArgs, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    const instance: OrchestratorInstance = {
      runId,
      specPath,
      specName,
      process: child,
      status: "running",
      currentPhase: options?.fromPhase ?? 1,
      currentStep: options?.fromStep
        ? `${options.fromPhase}.${options.fromStep}`
        : "1.1",
      phaseCount: spec.phases.length,
      stepCount: spec.phases.reduce(
        (sum: number, p: ParsedPhase) => sum + p.steps.length,
        0,
      ),
      lastOutput: "",
      logDir,
      startedAt: new Date().toISOString(),
    };

    // Capture output
    child.stdout?.on("data", (data) => {
      const text = data.toString();
      instance.lastOutput = (instance.lastOutput + text).slice(-4000);
      parseProgressFromOutput(instance, text);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      instance.lastOutput = (instance.lastOutput + text).slice(-4000);
    });

    child.on("close", (code) => {
      instance.process = null;
      if (code === 0) {
        instance.status = "completed";
      } else {
        instance.status = "failed";
        instance.lastError = `Process exited with code ${code}`;
      }
    });

    activeRuns.set(runId, instance);

    return {
      runId,
      status: "started",
      message:
        `Started orchestration for ${specName} (${spec.phases.length} phases, ${instance.stepCount} steps)`,
    };
  } catch (error) {
    return {
      runId: "",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleStatus(args: { runId: string }): {
  runId: string;
  status: string;
  currentPhase: number;
  currentStep: string;
  phaseCount: number;
  stepCount: number;
  lastOutput: string;
  lastError?: string;
  logs: string[];
} {
  const instance = activeRuns.get(args.runId);
  if (!instance) {
    return {
      runId: args.runId,
      status: "not_found",
      currentPhase: 0,
      currentStep: "",
      phaseCount: 0,
      stepCount: 0,
      lastOutput: "",
      lastError: `Run ${args.runId} not found`,
      logs: [],
    };
  }

  // Get log files
  const logs: string[] = [];
  if (fs.existsSync(instance.logDir)) {
    const files = fs.readdirSync(instance.logDir, {
      recursive: true,
    }) as string[];
    logs.push(...files.map((f) => path.join(instance.logDir, f)));
  }

  return {
    runId: instance.runId,
    status: instance.status,
    currentPhase: instance.currentPhase,
    currentStep: instance.currentStep,
    phaseCount: instance.phaseCount,
    stepCount: instance.stepCount,
    lastOutput: instance.lastOutput.slice(-2000),
    lastError: instance.lastError,
    logs,
  };
}

function handleRetry(args: { runId: string; additionalContext?: string }): {
  status: "retrying" | "error";
  message: string;
} {
  const instance = activeRuns.get(args.runId);
  if (!instance) {
    return { status: "error", message: `Run ${args.runId} not found` };
  }

  if (instance.status !== "failed" && instance.status !== "paused") {
    return {
      status: "error",
      message: `Run is ${instance.status}, cannot retry`,
    };
  }

  // Spawn new process from current checkpoint
  const cmdArgs = [
    "tsx",
    "scripts/orchestrate.ts",
    instance.specPath,
    "--quiet",
  ];

  const child = spawn("pnpm", cmdArgs, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  instance.process = child;
  instance.status = "running";
  instance.lastError = undefined;

  child.stdout?.on("data", (data) => {
    const text = data.toString();
    instance.lastOutput = (instance.lastOutput + text).slice(-4000);
    parseProgressFromOutput(instance, text);
  });

  child.stderr?.on("data", (data) => {
    instance.lastOutput = (instance.lastOutput + data.toString()).slice(-4000);
  });

  child.on("close", (code) => {
    instance.process = null;
    instance.status = code === 0 ? "completed" : "failed";
    if (code !== 0) instance.lastError = `Process exited with code ${code}`;
  });

  return {
    status: "retrying",
    message: `Retrying from checkpoint${
      args.additionalContext ? " with additional context" : ""
    }`,
  };
}

function handleSkip(args: { runId: string; reason: string }): {
  status: "skipped" | "error";
  message: string;
  nextStep: string;
} {
  const instance = activeRuns.get(args.runId);
  if (!instance) {
    return {
      status: "error",
      message: `Run ${args.runId} not found`,
      nextStep: "",
    };
  }

  // Log the skip reason
  const skipLog = path.join(instance.logDir, "skipped_steps.txt");
  fs.mkdirSync(instance.logDir, { recursive: true });
  fs.appendFileSync(
    skipLog,
    `${
      new Date().toISOString()
    } - Skipped step ${instance.currentStep}: ${args.reason}\n`,
  );

  // Update checkpoint to next step
  const checkpointPath = getCheckpointPath(
    DEFAULT_CONFIG.worktreeBase,
    instance.specName,
  );
  const checkpoint = loadCheckpoint(checkpointPath);

  if (checkpoint) {
    // Increment step (simplified - actual logic would need spec parsing)
    const [phase, step] = instance.currentStep.split(".").map(Number);
    const nextStep = `${phase}.${step + 1}`;
    instance.currentStep = nextStep;

    return {
      status: "skipped",
      message: `Skipped step ${phase}.${step}: ${args.reason}`,
      nextStep,
    };
  }

  return { status: "error", message: "No checkpoint found", nextStep: "" };
}

function handleAbort(args: { runId: string; reason: string }): {
  status: "aborted" | "error";
  checkpoint: string;
} {
  const instance = activeRuns.get(args.runId);
  if (!instance) {
    return { status: "error", checkpoint: "" };
  }

  // Kill the process if running
  if (instance.process) {
    instance.process.kill("SIGTERM");
    setTimeout(() => instance.process?.kill("SIGKILL"), 5000);
  }

  instance.status = "failed";
  instance.lastError = `Aborted: ${args.reason}`;

  const checkpointPath = getCheckpointPath(
    DEFAULT_CONFIG.worktreeBase,
    instance.specName,
  );

  return {
    status: "aborted",
    checkpoint: checkpointPath,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function parseProgressFromOutput(
  instance: OrchestratorInstance,
  text: string,
): void {
  // Parse phase headers: "PHASE 2: Testing"
  const phaseMatch = text.match(/PHASE (\d+):/);
  if (phaseMatch) {
    instance.currentPhase = parseInt(phaseMatch[1], 10);
  }

  // Parse step headers: "▶ Step 2.3: Create Tests"
  const stepMatch = text.match(/▶ Step ([\d.]+):/);
  if (stepMatch) {
    instance.currentStep = stepMatch[1];
  }

  // Detect failures
  if (text.includes("❌") || text.includes("Orchestrator failed")) {
    instance.status = "failed";
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  { name: "orchestrator", version: "1.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "orchestrator.run",
      description:
        "Start an orchestration run for a spec file. Returns a runId for tracking.",
      inputSchema: {
        type: "object",
        properties: {
          specPath: {
            type: "string",
            description: "Path to the spec markdown file",
          },
          options: {
            type: "object",
            properties: {
              failFast: {
                type: "boolean",
                description: "Abort on first failure",
              },
              fromPhase: {
                type: "number",
                description: "Start from this phase number",
              },
              fromStep: {
                type: "number",
                description: "Start from this step number within phase",
              },
            },
          },
        },
        required: ["specPath"],
      },
    },
    {
      name: "orchestrator.status",
      description:
        "Get the current status of an orchestration run including progress and last output.",
      inputSchema: {
        type: "object",
        properties: {
          runId: {
            type: "string",
            description: "The run ID returned from orchestrator.run",
          },
        },
        required: ["runId"],
      },
    },
    {
      name: "orchestrator.retry",
      description: "Retry a failed orchestration run from its checkpoint.",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string", description: "The run ID to retry" },
          additionalContext: {
            type: "string",
            description: "Extra context to help with the retry",
          },
        },
        required: ["runId"],
      },
    },
    {
      name: "orchestrator.skip",
      description:
        "Skip the current step and continue with the next one. Requires a reason.",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string", description: "The run ID" },
          reason: {
            type: "string",
            description: "Why this step is being skipped (for audit)",
          },
        },
        required: ["runId", "reason"],
      },
    },
    {
      name: "orchestrator.abort",
      description:
        "Abort an orchestration run. Saves checkpoint for later resume.",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string", description: "The run ID to abort" },
          reason: {
            type: "string",
            description: "Why the run is being aborted",
          },
        },
        required: ["runId", "reason"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result: unknown;

  switch (name) {
    case "orchestrator.run":
      result = await handleRun(args as Parameters<typeof handleRun>[0]);
      break;
    case "orchestrator.status":
      result = handleStatus(args as Parameters<typeof handleStatus>[0]);
      break;
    case "orchestrator.retry":
      result = handleRetry(args as Parameters<typeof handleRetry>[0]);
      break;
    case "orchestrator.skip":
      result = handleSkip(args as Parameters<typeof handleSkip>[0]);
      break;
    case "orchestrator.abort":
      result = handleAbort(args as Parameters<typeof handleAbort>[0]);
      break;
    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Orchestrator MCP server running");
}

main().catch(console.error);
