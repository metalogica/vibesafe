const GITHUB_URL_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, '');
  const match = cleaned.match(GITHUB_URL_REGEX);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
