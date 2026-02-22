/** Convex actions have a 10-minute hard limit. Leave 60s headroom. */
export const ACTION_BUDGET_MS = 540_000;

/** Hard cap on blob fetches regardless of token budget. */
export const MAX_BLOB_FETCHES = 500;

/**
 * Returns true when the elapsed wall-clock time exceeds the budget.
 * @param startTime - `Date.now()` captured at action entry
 */
export function isOverBudget(startTime: number): boolean {
  return Date.now() - startTime >= ACTION_BUDGET_MS;
}
