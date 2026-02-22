import { normalizeGitHubError } from '../../src/domain/audit/normalizeGitHubError';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

export interface GitHubBlobResponse {
  content: string;
  encoding: 'base64' | 'utf-8';
  size: number;
}

type GitHubClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (process.env.GITHUB_API_KEY) {
    headers.Authorization = `Bearer ${process.env.GITHUB_API_KEY}`;
  }
  return headers;
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch = 'HEAD',
): Promise<GitHubClientResult<GitHubTreeResponse>> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: getHeaders() },
    );

    if (!response.ok) {
      const errorInfo = normalizeGitHubError(response.status, {
        rateLimitRemaining: response.headers.get('X-RateLimit-Remaining'),
        rateLimitReset: response.headers.get('X-RateLimit-Reset'),
      });
      return { success: false, error: errorInfo };
    }

    const data = (await response.json()) as GitHubTreeResponse;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

export async function fetchBlob(
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubClientResult<GitHubBlobResponse>> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs/${sha}`,
      { headers: getHeaders() },
    );

    if (!response.ok) {
      const errorInfo = normalizeGitHubError(response.status, {
        rateLimitRemaining: response.headers.get('X-RateLimit-Remaining'),
        rateLimitReset: response.headers.get('X-RateLimit-Reset'),
      });
      return { success: false, error: errorInfo };
    }

    const data = (await response.json()) as GitHubBlobResponse;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
