export const SEVERITY_PENALTIES: Record<string, number> = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 5,
};

export function calculateSafetyProbability(
  vulnerabilities: { level: string }[],
): number {
  if (vulnerabilities.length === 0) return 100;

  const totalPenalty = vulnerabilities.reduce(
    (sum, v) => sum + (SEVERITY_PENALTIES[v.level] ?? 0),
    0,
  );

  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

export function generateExecutiveSummary(
  vulnerabilities: { level: string; category: string }[],
): string {
  if (vulnerabilities.length === 0) {
    return 'No security vulnerabilities detected. This codebase appears safe for deployment.';
  }

  const counts = {
    critical: vulnerabilities.filter((v) => v.level === 'critical').length,
    high: vulnerabilities.filter((v) => v.level === 'high').length,
    medium: vulnerabilities.filter((v) => v.level === 'medium').length,
    low: vulnerabilities.filter((v) => v.level === 'low').length,
  };

  const severityParts: string[] = [];
  if (counts.critical > 0) severityParts.push(`${counts.critical} Critical`);
  if (counts.high > 0) severityParts.push(`${counts.high} High`);
  if (counts.medium > 0) severityParts.push(`${counts.medium} Medium`);
  if (counts.low > 0) severityParts.push(`${counts.low} Low`);
  const severitySummary = severityParts.join(' and ');

  const categories = [
    ...new Set(vulnerabilities.map((v) => v.category)),
  ];
  const areaSummary = categories.slice(0, 3).join(', ');

  let verdict: string;
  if (counts.critical > 0) {
    verdict = 'Deployment unsafe.';
  } else if (counts.high > 0) {
    verdict = 'Deployment not recommended until issues are resolved.';
  } else if (counts.medium > 0) {
    verdict = 'Deployment acceptable with caution. Address issues soon.';
  } else {
    verdict = 'Deployment acceptable. Consider addressing minor issues.';
  }

  return `Audit Complete. ${severitySummary} severity vulnerabilities found. Affected areas: ${areaSummary}. ${verdict}`;
}

export function generateDisplayId(
  auditId: string,
  seqNumber: number,
): string {
  const shortId = auditId.slice(0, 1).toUpperCase();
  const seq = String(seqNumber).padStart(3, '0');
  return `SEC-${shortId}-${seq}`;
}

export function generateAnalystMessage(
  vuln: { level: string; category: string; title: string; description: string; filePath?: string },
  displayId: string,
): string {
  const severityLabel =
    vuln.level.charAt(0).toUpperCase() + vuln.level.slice(1);
  const fileRef = vuln.filePath ? ` in ${vuln.filePath}` : '';
  const firstSentence = vuln.description.split('.')[0];
  return `Found ${vuln.title}${fileRef}. ${firstSentence}. This is a ${severityLabel} ${vuln.category} vulnerability (${displayId}).`;
}
