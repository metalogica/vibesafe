/** Maximum counts and field lengths. */
export const SANITIZE_LIMITS = {
  maxVulnerabilities: 50,
  maxTitleLength: 200,
  maxDescriptionLength: 2000,
  maxImpactLength: 1000,
  maxFixLength: 2000,
  maxFilePathLength: 500,
  maxCategoryLength: 100,
} as const;

const VALID_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

export interface SanitizedVulnerability {
  category: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact?: string;
  filePath?: string;
  fix?: string;
}

/**
 * Clamp a string to maxLength. If it exceeds, truncate and append "\u2026".
 */
function clamp(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Sanitise a single vulnerability. Returns null if the entry is
 * irrecoverably invalid (empty title, empty description, or unknown level).
 */
export function sanitizeVulnerability(
  v: Record<string, unknown>,
): SanitizedVulnerability | null {
  const title = clamp(String(v.title ?? ''), SANITIZE_LIMITS.maxTitleLength);
  const description = clamp(String(v.description ?? ''), SANITIZE_LIMITS.maxDescriptionLength);

  // Reject entries missing required human-readable fields
  if (!title || title.length === 0) return null;
  if (!description || description.length === 0) return null;

  const level = String(v.level ?? '');
  if (!VALID_LEVELS.has(level)) return null;

  return {
    category: clamp(String(v.category ?? 'unknown'), SANITIZE_LIMITS.maxCategoryLength)!,
    level: level as SanitizedVulnerability['level'],
    title,
    description,
    impact: clamp(v.impact as string | undefined, SANITIZE_LIMITS.maxImpactLength),
    filePath: clamp(v.filePath as string | undefined, SANITIZE_LIMITS.maxFilePathLength),
    fix: clamp(v.fix as string | undefined, SANITIZE_LIMITS.maxFixLength),
  };
}

/**
 * Sanitise the full array. Drops invalid entries, caps at maxVulnerabilities.
 */
export function sanitizeVulnerabilities(
  raw: Record<string, unknown>[],
): SanitizedVulnerability[] {
  return raw
    .map(sanitizeVulnerability)
    .filter((v): v is SanitizedVulnerability => v !== null)
    .slice(0, SANITIZE_LIMITS.maxVulnerabilities);
}
