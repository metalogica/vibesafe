/**
 * Checkpoint Module
 *
 * Handles saving and loading orchestrator checkpoint state for resuming runs.
 */

import fs from 'fs';
import path from 'path';

import type { Checkpoint } from './_types';

/**
 * Get the checkpoint file path for a given spec.
 */
export function getCheckpointPath(worktreeBase: string, specName: string): string {
  return path.join(worktreeBase, `${specName}.checkpoint.json`);
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Write a file atomically by writing to a temp file first, then renaming.
 */
function atomicWriteFile(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

/**
 * Load a checkpoint from disk.
 * Returns null if no checkpoint exists.
 * Throws if checkpoint file is corrupted.
 */
export function loadCheckpoint(checkpointPath: string): Checkpoint | null {
  if (!fs.existsSync(checkpointPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(checkpointPath, 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch (error) {
    throw new Error(
      `Checkpoint file is corrupted: ${checkpointPath}\n` +
        `Delete it to restart from the beginning, or fix the JSON manually.\n` +
        `Error: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Save a checkpoint to disk atomically.
 */
export function saveCheckpoint(checkpointPath: string, checkpoint: Checkpoint): void {
  atomicWriteFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

/**
 * Delete a checkpoint file.
 */
export function deleteCheckpoint(checkpointPath: string): void {
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }
}

/**
 * Validate that a checkpoint matches the current spec.
 * Returns a warning message if the spec has changed, null otherwise.
 */
export function validateCheckpoint(
  checkpoint: Checkpoint,
  currentSpecPath: string,
  currentSpecHash: string
): string | null {
  if (checkpoint.specPath !== currentSpecPath) {
    return (
      `Checkpoint was for a different spec file.\n` +
      `  Checkpoint: ${checkpoint.specPath}\n` +
      `  Current: ${currentSpecPath}\n` +
      `Delete the checkpoint to start fresh, or specify the correct spec.`
    );
  }

  if (checkpoint.specHash !== currentSpecHash) {
    return (
      `Spec file has changed since the run started.\n` +
      `  Checkpoint hash: ${checkpoint.specHash.slice(0, 12)}...\n` +
      `  Current hash: ${currentSpecHash.slice(0, 12)}...\n` +
      `The orchestrator will continue, but results may be inconsistent.\n` +
      `Consider deleting the checkpoint to start fresh.`
    );
  }

  return null;
}

/**
 * Create a new checkpoint for starting a fresh run.
 */
export function createCheckpoint(
  specPath: string,
  specHash: string,
  worktreeBranch: string
): Checkpoint {
  const now = new Date().toISOString();
  return {
    specPath,
    specHash,
    phase: 0,
    step: 0,
    startedAt: now,
    lastStepAt: now,
    worktreeBranch,
  };
}

/**
 * Update checkpoint after completing a step.
 */
export function updateCheckpointProgress(
  checkpoint: Checkpoint,
  phase: number,
  step: number
): Checkpoint {
  return {
    ...checkpoint,
    phase,
    step,
    lastStepAt: new Date().toISOString(),
  };
}
