/**
 * Orchestrator Type Definitions
 *
 * Shared types for the spec orchestrator system.
 */

// ============================================================================
// Spec Parser Types
// ============================================================================

/**
 * A parsed specification file ready for execution.
 */
export interface ParsedSpec {
  /** Original file path */
  path: string;
  /** SHA256 hash of file contents (for checkpoint validation) */
  hash: string;
  /** Extracted phases */
  phases: ParsedPhase[];
}

/**
 * A phase within a specification (e.g., "Phase 1: Domain Layer").
 */
export interface ParsedPhase {
  /** Phase number (1-indexed) */
  number: number;
  /** Phase name from header */
  name: string;
  /** Steps within this phase */
  steps: ParsedStep[];
  /** Optional gate verification commands run after all steps complete */
  gate?: VerifyCmd[];
}

/**
 * A step within a phase (e.g., "Step 1.1: Create UserAggregate").
 */
export interface ParsedStep {
  /** Step ID (e.g., "1.1", "2.3") */
  id: string;
  /** Step title from header */
  title: string;
  /** Full prompt content to pass to Claude Code CLI */
  prompt: string;
  /** Optional verification commands to run after step completes */
  verify?: VerifyCmd[];
  /** Optional timeout override in ms (default: 180000) */
  timeout?: number;
}

/**
 * A verification command to run (e.g., pnpm app:compile).
 */
export interface VerifyCmd {
  /** The command to run (e.g., "pnpm") */
  cmd: string;
  /** Arguments to pass (e.g., ["app:compile"]) */
  args: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Orchestrator configuration options.
 */
export interface OrchestratorConfig {
  // Paths
  /** Path to the spec file (required) */
  specPath: string;
  /** Base directory for orchestrator files (default: ".orchestrator") */
  worktreeBase: string;
  /** Directory for log files (default: ".orchestrator/logs/<spec-name>") */
  logDir: string;

  // Execution
  /** Maximum retry attempts per step (default: 3) */
  maxAttempts: number;
  /** Default timeout per step in ms (default: 180000 = 3 min) */
  defaultStepTimeout: number;
  /** Timeout for verification commands in ms (default: 120000 = 2 min) */
  verifyTimeout: number;

  // Modes
  /** Stream Claude output to terminal (default: true) */
  streaming: boolean;
  /** Abort entire run on first step failure (default: false) */
  failFast: boolean;
  /** Parse and print plan without executing (default: false) */
  dryRun: boolean;
  /** Use git worktree for isolation (default: true) */
  useWorktree: boolean;

  // Cleanup
  /** Automatically cleanup worktree after completion (default: false) */
  autoCleanup: boolean;
  /** Delay before auto-cleanup in ms (default: 10000) */
  cleanupDelay: number;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Result from a Claude Code CLI invocation.
 */
export interface AgentResult {
  /** Whether the invocation succeeded */
  success: boolean;
  /** Summary message (error message on failure, success message otherwise) */
  summary: string;
}

/**
 * Result from running verification commands.
 */
export interface VerifyResult {
  /** Whether all verification commands passed */
  success: boolean;
  /** Combined output from all commands */
  output: string;
  /** The command that failed (if any) */
  failedCmd?: VerifyCmd;
}

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * Checkpoint state for resuming interrupted runs.
 */
export interface Checkpoint {
  /** Path to the spec file */
  specPath: string;
  /** Hash of spec file when run started (to detect changes) */
  specHash: string;
  /** Current phase index (0-indexed) */
  phase: number;
  /** Current step index within phase (0-indexed) */
  step: number;
  /** ISO timestamp when run started */
  startedAt: string;
  /** ISO timestamp of last completed step */
  lastStepAt: string;
  /** Git branch name for the worktree */
  worktreeBranch: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<OrchestratorConfig, "specPath"> = {
  worktreeBase: ".orchestrator",
  logDir: ".orchestrator/logs",
  maxAttempts: 3,
  defaultStepTimeout: 60000, // STRICT 60s timeout - prevents hung steps
  verifyTimeout: 120000,
  streaming: true,
  failFast: false,
  dryRun: false,
  useWorktree: true,
  autoCleanup: false,
  cleanupDelay: 10000,
};
