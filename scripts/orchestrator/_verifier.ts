/**
 * Verifier Module
 *
 * Handles running verification commands after orchestrator steps.
 */

import { runCmdWithTimeout, startHeartbeat } from "./_streaming";
import type { VerifyCmd, VerifyResult } from "./_types";

/**
 * Run verification commands for a step.
 * Commands are run sequentially; stops on first failure.
 */
export async function runVerification(
  cwd: string,
  commands: VerifyCmd[],
  logFile: string,
  timeoutMs: number,
): Promise<VerifyResult> {
  if (!commands || commands.length === 0) {
    return { success: true, output: "No verification commands" };
  }

  const outputs: string[] = [];

  for (const cmd of commands) {
    const cmdLabel = `${cmd.cmd} ${cmd.args.slice(0, 2).join(" ")}`;
    const stopHeartbeat = startHeartbeat(`Verifying: ${cmdLabel}`);

    try {
      const { stdout, stderr } = await runCmdWithTimeout(
        cwd,
        cmd.cmd,
        cmd.args,
        {
          logFile,
          streamToConsole: false,
          timeoutMs,
        },
      );

      stopHeartbeat();
      outputs.push(`✓ ${cmd.cmd} ${cmd.args.join(" ")}:\n${stdout}${stderr}`);
    } catch (error) {
      stopHeartbeat();
      const message = error instanceof Error ? error.message : String(error);
      outputs.push(`✗ ${cmd.cmd} ${cmd.args.join(" ")}:\n${message}`);

      return {
        success: false,
        output: outputs.join("\n---\n"),
        failedCmd: cmd,
      };
    }
  }

  return {
    success: true,
    output: outputs.join("\n---\n"),
  };
}

/**
 * Format verification result for display.
 */
export function formatVerifyResult(result: VerifyResult): string {
  if (result.success) {
    return "   ✓ Verification passed";
  }

  const failedCmd = result.failedCmd;
  if (failedCmd) {
    return `   ✗ Verification failed: ${failedCmd.cmd} ${
      failedCmd.args.join(" ")
    }`;
  }

  return "   ✗ Verification failed";
}
