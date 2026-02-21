// Checkpoint
export {
  createCheckpoint,
  deleteCheckpoint,
  getCheckpointPath,
  loadCheckpoint,
  saveCheckpoint,
  updateCheckpointProgress,
  validateCheckpoint,
} from "./_checkpoint";

// Executor
export {
  executeStep,
  StepFailedError,
  VerificationFailedError,
} from "./_executor";

// Lock
export { acquireLock, getLockPath, releaseLock } from "./_lock";

// Parser
export { detectSupabaseCommands, getSpecName, parseSpec } from "./_parser";

// Streaming
export {
  buildRetryPrompt,
  runClaudeQuiet,
  runClaudeStreaming,
  runCmdWithTimeout,
  startHeartbeat,
} from "./_streaming";

/**
 * Orchestrator Module Exports
 *
 * Re-exports all public APIs from orchestrator submodules.
 */

// Types
export type {
  AgentResult,
  Checkpoint,
  OrchestratorConfig,
  ParsedPhase,
  ParsedSpec,
  ParsedStep,
  VerifyCmd,
  VerifyResult,
} from "./_types";

export { DEFAULT_CONFIG } from "./_types";

// Verifier
export { formatVerifyResult, runVerification } from "./_verifier";

// Worktree
export {
  commitIfDirty,
  ensureWorktree,
  getWorktreeBranch,
  getWorktreePath,
  isGitRepo,
  isWorktreeDirty,
  printPostRunInstructions,
  removeWorktree,
} from "./_worktree";
