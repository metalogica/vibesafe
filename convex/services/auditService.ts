import { v } from 'convex/values';

import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { runSecurityAnalysis } from '../clients/claude';
import type { Vulnerability } from './schemas';

const SEVERITY_PENALTIES: Record<string, number> = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 5,
};

function calculateSafetyProbability(
  vulnerabilities: { level: string }[],
): number {
  if (vulnerabilities.length === 0) return 100;

  const totalPenalty = vulnerabilities.reduce(
    (sum, v) => sum + (SEVERITY_PENALTIES[v.level] ?? 0),
    0,
  );

  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

function generateExecutiveSummary(
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

function generateDisplayId(
  auditId: string,
  seqNumber: number,
): string {
  const shortId = auditId.slice(0, 1).toUpperCase();
  const seq = String(seqNumber).padStart(3, '0');
  return `SEC-${shortId}-${seq}`;
}

function generateAnalystMessage(
  vuln: Vulnerability,
  displayId: string,
): string {
  const severityLabel =
    vuln.level.charAt(0).toUpperCase() + vuln.level.slice(1);
  const fileRef = vuln.filePath ? ` in ${vuln.filePath}` : '';
  const firstSentence = vuln.description.split('.')[0];
  return `Found ${vuln.title}${fileRef}. ${firstSentence}. This is a ${severityLabel} ${vuln.category} vulnerability (${displayId}).`;
}

type AuditResult =
  | {
      success: true;
      data: { vulnerabilityCount: number; probability: number };
    }
  | { success: false; error: { code: string; message: string } };

export const runAudit = action({
  args: {
    auditId: v.id('audits'),
    files: v.array(
      v.object({
        path: v.string(),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, { auditId, files }): Promise<AuditResult> => {
    // 1. Update status to analyzing
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: 'analyzing',
    });

    // 2. Call Claude for security analysis
    const analysisResult = await runSecurityAnalysis(files);
    if (!analysisResult.success) {
      await ctx.runMutation(internal.audits.fail, {
        auditId,
        error: analysisResult.error.message,
      });
      return { success: false, error: analysisResult.error };
    }

    const vulnerabilities = analysisResult.data.vulnerabilities;

    // 3. Store each vulnerability + create feed event
    for (let i = 0; i < vulnerabilities.length; i++) {
      const vuln = vulnerabilities[i];
      const seqNumber = i + 1;
      const displayId = generateDisplayId(auditId, seqNumber);

      const analysisId = await ctx.runMutation(
        internal.analyses.create,
        {
          auditId,
          seqNumber,
          displayId,
          category: vuln.category,
          level: vuln.level,
          title: vuln.title,
          description: vuln.description,
          filePath: vuln.filePath,
          fix: vuln.fix,
        },
      );

      await ctx.runMutation(internal.auditEvents.create, {
        auditId,
        agent: 'SECURITY_ANALYST',
        message: generateAnalystMessage(vuln, displayId),
        analysisId,
      });
    }

    // 4. Update status to evaluating
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: 'evaluating',
    });

    // 5. Calculate probability + generate summary
    const probability = calculateSafetyProbability(vulnerabilities);
    const executiveSummary = generateExecutiveSummary(vulnerabilities);

    // 6. Store evaluation
    await ctx.runMutation(internal.evaluations.create, {
      auditId,
      probability,
      executiveSummary,
    });

    // 7. Create evaluator feed event
    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'EVALUATOR',
      message: executiveSummary,
    });

    // 8. Mark complete
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: 'complete',
    });

    return {
      success: true,
      data: {
        vulnerabilityCount: vulnerabilities.length,
        probability,
      },
    };
  },
});
