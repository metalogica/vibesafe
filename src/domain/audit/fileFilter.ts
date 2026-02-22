const EXCLUDED_DIRS = [
  'node_modules/',
  'vendor/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  '.next/',
  '__pycache__/',
  '.venv/',
  'coverage/',
];

const EXCLUDED_PATTERNS = [
  /\.min\.js$/,
  /\.min\.css$/,
  /\.map$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.tar', '.gz',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.php', '.java', '.kt', '.swift',
  '.json', '.yaml', '.yml', '.toml',
  '.sql', '.prisma', '.graphql',
  '.sh', '.bash',
]);

const ALLOWED_FILENAMES = new Set([
  'Dockerfile',
  'Makefile',
  'Procfile',
  'docker-compose.yml',
  '.env.example',
  '.env.sample',
  '.env.template',
]);

export function shouldIncludeFile(path: string): boolean {
  // 1. Exclusion directories
  for (const dir of EXCLUDED_DIRS) {
    if (path.includes(dir)) return false;
  }

  // 2. Exclusion patterns
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(path)) return false;
  }

  // 3. Binary extensions
  const lastDot = path.lastIndexOf('.');
  const ext = lastDot !== -1 ? path.slice(lastDot) : '';
  if (BINARY_EXTENSIONS.has(ext)) return false;

  // 4. Allowed extensions
  if (ALLOWED_EXTENSIONS.has(ext)) return true;

  // 5. Allowed filenames (exact basename match)
  const basename = path.split('/').pop() ?? '';
  if (ALLOWED_FILENAMES.has(basename)) return true;

  // 6. Default: exclude
  return false;
}
