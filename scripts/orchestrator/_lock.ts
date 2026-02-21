/**
 * Lock Module
 *
 * Handles lockfile management to prevent concurrent orchestrator runs.
 */

import fs from 'fs';
import path from 'path';

/**
 * Get the lock file path for a given spec.
 */
export function getLockPath(worktreeBase: string, specName: string): string {
  return path.join(worktreeBase, `${specName}.lock`);
}

/**
 * Check if a process is running by PID.
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists.
 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Acquire a lock for the orchestrator run.
 * Throws if lock cannot be acquired.
 */
export function acquireLock(lockPath: string): void {
  ensureDir(path.dirname(lockPath));

  // Check for stale lock
  if (fs.existsSync(lockPath)) {
    try {
      const content = fs.readFileSync(lockPath, 'utf-8').trim();
      const pid = parseInt(content, 10);

      if (!isNaN(pid) && !isProcessRunning(pid)) {
        console.log(`🔓 Removing stale lockfile (PID ${pid} not running)`);
        fs.unlinkSync(lockPath);
      }
    } catch {
      // If we can't read/parse, let the normal flow handle it
    }
  }

  try {
    // Use 'wx' flag to fail if file exists (atomic check-and-create)
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
  } catch {
    throw new Error(
      `Lockfile exists: ${lockPath}\n` +
        `Another orchestrator run is in progress (or a previous run crashed).\n` +
        `If you are sure it is stale, delete the lockfile and try again.`
    );
  }
}

/**
 * Release the lock.
 */
export function releaseLock(lockPath: string): void {
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore errors when releasing lock
  }
}
