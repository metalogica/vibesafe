export const TOKEN_LIMIT = 200_000;

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

const PRIORITY_1_PATTERNS = [
  'auth', 'session', 'login', 'password', 'token', 'secret',
  'credential', 'api/', 'routes/', 'middleware/', 'webhook',
  'payment', 'stripe', '.env', 'config', 'security',
];

const PRIORITY_2_PATTERNS = [
  /(?:^|\/)index\.[^/]+$/,
  /(?:^|\/)app\.[^/]+$/,
  /(?:^|\/)main\.[^/]+$/,
  /(?:^|\/)server\.[^/]+$/,
  /(?:^|\/)handler\.[^/]+$/,
];

export function getFilePriority(path: string): 1 | 2 | 3 {
  const lower = path.toLowerCase();

  for (const pattern of PRIORITY_1_PATTERNS) {
    if (lower.includes(pattern)) return 1;
  }

  for (const pattern of PRIORITY_2_PATTERNS) {
    if (pattern.test(path)) return 2;
  }

  return 3;
}
