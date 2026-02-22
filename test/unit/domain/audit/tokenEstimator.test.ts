import { describe, expect, it } from 'vitest';

import { TOKEN_LIMIT, estimateTokens, getFilePriority } from '@/src/domain/audit/tokenEstimator';

describe('estimateTokens', () => {
  it('estimates tokens as ceil(length / 4)', () => {
    expect(estimateTokens('a'.repeat(4000))).toBe(1000);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1);
  });
});

describe('TOKEN_LIMIT', () => {
  it('is 200_000', () => {
    expect(TOKEN_LIMIT).toBe(200_000);
  });
});

describe('getFilePriority', () => {
  it('returns 1 for auth files', () => {
    expect(getFilePriority('src/auth/login.ts')).toBe(1);
  });

  it('returns 1 for api routes', () => {
    expect(getFilePriority('src/api/users.ts')).toBe(1);
  });

  it('returns 1 for config files', () => {
    expect(getFilePriority('src/config/db.ts')).toBe(1);
  });

  it('returns 1 for middleware', () => {
    expect(getFilePriority('src/middleware/cors.ts')).toBe(1);
  });

  it('returns 2 for index entry points', () => {
    expect(getFilePriority('src/index.ts')).toBe(2);
  });

  it('returns 2 for app entry points', () => {
    expect(getFilePriority('src/app.tsx')).toBe(2);
  });

  it('returns 2 for server entry points', () => {
    expect(getFilePriority('src/server.ts')).toBe(2);
  });

  it('returns 3 for normal utility files', () => {
    expect(getFilePriority('src/utils/format.ts')).toBe(3);
  });
});
