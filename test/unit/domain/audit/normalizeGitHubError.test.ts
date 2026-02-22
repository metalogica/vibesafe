import { describe, expect, it } from 'vitest';

import { normalizeGitHubError } from '@/src/domain/audit/normalizeGitHubError';

describe('normalizeGitHubError', () => {
  it('returns NOT_FOUND for 404', () => {
    const result = normalizeGitHubError(404, {
      rateLimitRemaining: null,
      rateLimitReset: null,
    });
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns RATE_LIMIT for 429 with reset header', () => {
    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 300);
    const result = normalizeGitHubError(429, {
      rateLimitRemaining: null,
      rateLimitReset: futureTimestamp,
    });
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.message).toContain('minutes');
  });

  it('returns RATE_LIMIT for 403 with exhausted quota', () => {
    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 300);
    const result = normalizeGitHubError(403, {
      rateLimitRemaining: '0',
      rateLimitReset: futureTimestamp,
    });
    expect(result.code).toBe('RATE_LIMIT');
  });

  it('returns PRIVATE_REPO for 403 with remaining quota', () => {
    const result = normalizeGitHubError(403, {
      rateLimitRemaining: '42',
      rateLimitReset: null,
    });
    expect(result.code).toBe('PRIVATE_REPO');
  });

  it('returns PRIVATE_REPO for 403 with null remaining', () => {
    const result = normalizeGitHubError(403, {
      rateLimitRemaining: null,
      rateLimitReset: null,
    });
    expect(result.code).toBe('PRIVATE_REPO');
  });

  it('returns GITHUB_ERROR for 500', () => {
    const result = normalizeGitHubError(500, {
      rateLimitRemaining: null,
      rateLimitReset: null,
    });
    expect(result.code).toBe('GITHUB_ERROR');
    expect(result.message).toContain('500');
  });

  it('returns GITHUB_ERROR for 502', () => {
    const result = normalizeGitHubError(502, {
      rateLimitRemaining: null,
      rateLimitReset: null,
    });
    expect(result.code).toBe('GITHUB_ERROR');
  });
});
