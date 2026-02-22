import { describe, expect, it } from 'vitest';

import { ACTION_BUDGET_MS, MAX_BLOB_FETCHES, isOverBudget } from '@/src/domain/audit/actionBudget';

describe('actionBudget', () => {
  describe('constants', () => {
    it('ACTION_BUDGET_MS is 540_000', () => {
      expect(ACTION_BUDGET_MS).toBe(540_000);
    });

    it('MAX_BLOB_FETCHES is 500', () => {
      expect(MAX_BLOB_FETCHES).toBe(500);
    });
  });

  describe('isOverBudget', () => {
    it('returns false for a recent start time', () => {
      expect(isOverBudget(Date.now() - 100)).toBe(false);
    });

    it('returns true when 10 minutes have elapsed', () => {
      expect(isOverBudget(Date.now() - 600_000)).toBe(true);
    });

    it('returns true at exact boundary', () => {
      expect(isOverBudget(Date.now() - ACTION_BUDGET_MS)).toBe(true);
    });

    it('returns false just before boundary', () => {
      expect(isOverBudget(Date.now() - ACTION_BUDGET_MS + 1000)).toBe(false);
    });
  });
});
