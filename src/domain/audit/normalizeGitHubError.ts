export interface GitHubErrorInfo {
  code: 'NOT_FOUND' | 'RATE_LIMIT' | 'PRIVATE_REPO' | 'GITHUB_ERROR';
  message: string;
}

export function normalizeGitHubError(
  status: number,
  headers: { rateLimitRemaining: string | null; rateLimitReset: string | null },
): GitHubErrorInfo {
  if (status === 404) {
    return { code: 'NOT_FOUND', message: 'Repository not found' };
  }

  if (status === 429) {
    const minutes = headers.rateLimitReset
      ? Math.ceil((Number(headers.rateLimitReset) * 1000 - Date.now()) / 60_000)
      : 0;
    return {
      code: 'RATE_LIMIT',
      message: `GitHub rate limit hit. Try again in ${Math.max(minutes, 1)} minutes.`,
    };
  }

  if (status === 403) {
    if (headers.rateLimitRemaining === '0') {
      const minutes = headers.rateLimitReset
        ? Math.ceil((Number(headers.rateLimitReset) * 1000 - Date.now()) / 60_000)
        : 0;
      return {
        code: 'RATE_LIMIT',
        message: `GitHub rate limit hit. Try again in ${Math.max(minutes, 1)} minutes.`,
      };
    }
    return { code: 'PRIVATE_REPO', message: 'Repository is private or inaccessible' };
  }

  return { code: 'GITHUB_ERROR', message: `GitHub API error: ${status}` };
}
