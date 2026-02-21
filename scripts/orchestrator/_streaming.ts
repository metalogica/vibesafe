/**
 * Streaming Module
 *
 * Handles Claude Code CLI invocation and command execution with timeouts.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import type { AgentResult } from "./_types";

/**
 * Ensure a directory exists.
 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Run a command with optional timeout and streaming.
 */
export async function runCmdWithTimeout(
  cwd: string,
  cmd: string,
  args: string[],
  options: {
    logFile?: string;
    streamToConsole?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  const { logFile, streamToConsole = false, timeoutMs } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Set up timeout if specified
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        // Force kill after 5s if SIGTERM doesn't work
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);
    }

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      if (streamToConsole) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      if (streamToConsole) {
        process.stderr.write(text);
      }
    });

    // Pipe to log file if specified
    if (logFile) {
      ensureDir(path.dirname(logFile));
      const out = fs.createWriteStream(logFile, { flags: "a" });
      child.stdout.pipe(out);
      child.stderr.pipe(out);
    }

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (timedOut) {
        reject(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${cmd} ${
              args.join(" ").slice(0, 100)
            }...\n` +
              `Partial stdout: ${stdout.slice(-500)}`,
          ),
        );
        return;
      }

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Command failed: ${cmd} ${
              args.join(" ")
            } (exit ${code})\nstderr: ${stderr}`,
          ),
        );
      }
    });
  });
}

/**
 * Run Claude Code CLI in streaming mode (live terminal output).
 * This provides the best user experience for watching progress.
 */
export async function runClaudeStreaming(
  cwd: string,
  prompt: string,
  logFile: string,
  timeoutMs: number,
): Promise<AgentResult> {
  ensureDir(path.dirname(logFile));
  fs.appendFileSync(logFile, `=== PROMPT (streaming mode) ===\n${prompt}\n\n`);

  return new Promise((resolve) => {
    const child = spawn("claude", ["--dangerously-skip-permissions", prompt], {
      cwd,
      stdio: "inherit", // Direct connection to terminal
      shell: false,
      env: process.env,
    });

    // Set up timeout
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timeoutHandle);
      fs.appendFileSync(logFile, `=== ERROR ===\n${err.message}\n`);
      resolve({ success: false, summary: err.message });
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);

      if (timedOut) {
        fs.appendFileSync(logFile, `=== TIMEOUT after ${timeoutMs}ms ===\n`);
        resolve({
          success: false,
          summary: `Claude timed out after ${timeoutMs}ms`,
        });
        return;
      }

      fs.appendFileSync(logFile, `=== EXIT CODE: ${code} ===\n`);

      if (code === 0) {
        resolve({
          success: true,
          summary: "Claude completed (streaming mode)",
        });
      } else {
        resolve({ success: false, summary: `Claude exited with code ${code}` });
      }
    });
  });
}

/**
 * Run Claude Code CLI in quiet mode (captured output).
 * Used for CI or when streaming is disabled.
 */
export async function runClaudeQuiet(
  cwd: string,
  prompt: string,
  logFile: string,
  timeoutMs: number,
  verbose: boolean = false,
): Promise<AgentResult> {
  ensureDir(path.dirname(logFile));
  fs.appendFileSync(logFile, `=== PROMPT ===\n${prompt}\n\n`);

  if (verbose) {
    console.log("\n--- CLAUDE PROMPT ---");
    console.log(prompt.slice(0, 500) + (prompt.length > 500 ? "..." : ""));
    console.log("--- CLAUDE OUTPUT ---");
  }

  try {
    const { stdout, stderr } = await runCmdWithTimeout(
      cwd,
      "claude",
      ["--print", "--dangerously-skip-permissions", prompt],
      {
        logFile,
        streamToConsole: verbose,
        timeoutMs,
      },
    );

    fs.appendFileSync(logFile, `=== RESPONSE ===\n${stdout}\n`);
    if (stderr) {
      fs.appendFileSync(logFile, `=== STDERR ===\n${stderr}\n`);
    }

    if (verbose) {
      console.log("--- END CLAUDE OUTPUT ---\n");
    }

    // Check for catastrophic failure patterns
    const lastLines = stdout.slice(-1000).toLowerCase();
    const catastrophicPatterns = [
      /i (?:cannot|can't|am unable to) (?:complete|finish|proceed)/i,
      /(?:fatal|critical) error/i,
      /aborting due to/i,
      /permission denied.*cannot/i,
      /no such file or directory.*(?:required|needed)/i,
    ];

    const isCatastrophic = catastrophicPatterns.some((p) => p.test(lastLines));

    if (isCatastrophic) {
      return { success: false, summary: stdout.slice(-500) };
    }

    return { success: true, summary: "Claude Code CLI completed successfully" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fs.appendFileSync(logFile, `=== ERROR ===\n${message}\n`);
    return { success: false, summary: message };
  }
}

/**
 * Build a retry prompt that includes the previous error context.
 */
export function buildRetryPrompt(
  originalPrompt: string,
  previousError: string,
): string {
  return `RETRY CONTEXT: The previous attempt failed with the following error:
\`\`\`
${previousError.slice(0, 2000)}
\`\`\`

Please analyze this error, fix the issue, and try again.

---

Original prompt:
${originalPrompt}`;
}

/**
 * Progress indicator that shows elapsed time and a spinner.
 */
export function startHeartbeat(label: string): () => void {
  const startTime = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;

  const interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const frame = frames[frameIndex % frames.length];

    process.stdout.write(`\r   ${frame} ${label} (${timeStr})   `);
    frameIndex++;
  }, 200);

  return () => {
    clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(60) + "\r");
  };
}
