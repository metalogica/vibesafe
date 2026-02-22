import { describe, expect, it } from 'vitest';

import { parseGitHubUrl } from '@/src/domain/audit/parseGitHubUrl';

describe('parseGitHubUrl', () => {
  it('parses a standard GitHub URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('strips .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('handles URLs with tree/branch paths', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/tree/main')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('handles trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
  });

  it('returns null for non-URL strings', () => {
    expect(parseGitHubUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGitHubUrl('')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseGitHubUrl('  https://github.com/owner/repo  ')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });
});
