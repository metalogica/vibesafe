/**
 * Worktree Module
 *
 * Handles git worktree operations for isolated orchestrator runs.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Get the worktree directory path for a given spec.
 */
export function getWorktreePath(
  worktreeBase: string,
  specName: string,
): string {
  return path.join(worktreeBase, `worktree-${specName}`);
}

/**
 * Run a command and return stdout/stderr.
 */
async function runCmd(
  cwd: string,
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Command failed: ${cmd} ${
              args.join(" ")
            } (exit ${code})\n${stderr}`,
          ),
        );
      }
    });
  });
}

/**
 * Check if the current directory is a git repository.
 */
export function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

/**
 * Create or reuse a git worktree for isolated execution.
 * Returns the worktree directory path.
 */
export async function ensureWorktree(
  repoRoot: string,
  worktreePath: string,
  specName: string,
): Promise<{ path: string; branch: string; created: boolean }> {
  if (!isGitRepo(repoRoot)) {
    throw new Error(`Not a git repository: ${repoRoot}`);
  }

  // Create parent directory
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  if (fs.existsSync(worktreePath)) {
    // Worktree already exists, get its branch name
    const branch = await getWorktreeBranch(worktreePath);
    return { path: worktreePath, branch: branch || "unknown", created: false };
  }

  // Create new worktree with timestamped branch
  const branch = `orchestrator/${specName}-${Date.now()}`;

  await runCmd(repoRoot, "git", [
    "worktree",
    "add",
    "-b",
    branch,
    worktreePath,
  ]);

  return { path: worktreePath, branch, created: true };
}

/**
 * Get the current branch name of a worktree.
 */
export async function getWorktreeBranch(
  worktreePath: string,
): Promise<string | null> {
  if (!fs.existsSync(worktreePath)) {
    return null;
  }

  try {
    const { stdout } = await runCmd(worktreePath, "git", [
      "branch",
      "--show-current",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if the worktree has uncommitted changes.
 */
export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    await runCmd(worktreePath, "git", ["diff", "--quiet"]);
    // Also check for untracked files
    const { stdout } = await runCmd(worktreePath, "git", [
      "status",
      "--porcelain",
    ]);
    return stdout.trim().length > 0;
  } catch {
    // diff --quiet exits non-zero if there are changes
    return true;
  }
}

/**
 * Commit all changes in the worktree if there are any.
 */
export async function commitIfDirty(
  worktreePath: string,
  message: string,
): Promise<boolean> {
  const dirty = await isWorktreeDirty(worktreePath);
  if (!dirty) {
    return false;
  }

  await runCmd(worktreePath, "git", ["add", "-A"]);
  await runCmd(worktreePath, "git", ["commit", "-m", message]);
  return true;
}

/**
 * Remove a worktree.
 */
export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<void> {
  if (!fs.existsSync(worktreePath)) {
    return;
  }

  await runCmd(repoRoot, "git", ["worktree", "remove", worktreePath]);
}

/**
 * Print post-run instructions for the user.
 */
export function printPostRunInstructions(
  branch: string | null,
  worktreePath: string,
): void {
  const branchName = branch || "orchestrator/<spec>-<timestamp>";
  const worktreeDir = worktreePath || ".orchestrator/worktree-<spec>";

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                           POST-RUN CHECKLIST                              ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  1. REVIEW CHANGES                                                        ║
║     git log --oneline HEAD..${branchName.slice(0, 30).padEnd(30)}  ║
║     git diff HEAD...${branchName.slice(0, 35).padEnd(35)}  ║
║                                                                           ║
║  2. MERGE (pick one)                                                      ║
║     git merge ${branchName.slice(0, 45).padEnd(45)}  ║
║     git merge --squash ${branchName.slice(0, 35).padEnd(35)}  ║
║                                                                           ║
║  3. CLEANUP WORKTREE (after merge)                                        ║
║     git worktree remove ${worktreeDir.slice(0, 34).padEnd(34)}  ║
║     git branch -d ${branchName.slice(0, 40).padEnd(40)}  ║
║                                                                           ║
║  4. SUPABASE SYNC (if migrations were applied)                            ║
║     supabase db reset   # or: supabase migration up                       ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
}
