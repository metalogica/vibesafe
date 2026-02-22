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
      if (response.status === 404) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Repository not found' },
        };
      }
      if (response.status === 403) {
        const rateLimitRemaining =
          response.headers.get('X-RateLimit-Remaining');
        if (rateLimitRemaining === '0') {
          const resetTime = response.headers.get('X-RateLimit-Reset');
          const minutes = resetTime
            ? Math.ceil((Number(resetTime) * 1000 - Date.now()) / 60000)
            : 0;
          return {
            success: false,
            error: {
              code: 'RATE_LIMIT',
              message: `GitHub rate limit hit. Try again in ${minutes} minutes.`,
            },
          };
        }
        return {
          success: false,
          error: {
            code: 'PRIVATE_REPO',
            message: 'Repository is private or inaccessible',
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'GITHUB_ERROR',
          message: `GitHub API error: ${response.status}`,
        },
      };
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
      return {
        success: false,
        error: {
          code: 'GITHUB_ERROR',
          message: `GitHub API error: ${response.status}`,
        },
      };
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
