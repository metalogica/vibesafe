import { v } from 'convex/values';

import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { runSecurityAnalysis } from '../clients/claude';
import {
  calculateSafetyProbability,
  generateAnalystMessage,
  generateDisplayId,
  generateExecutiveSummary,
} from '../../src/domain/audit/evaluator';
import { sanitizeVulnerabilities } from '../../src/domain/audit/sanitizeVulnerabilities';

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

    const vulnerabilities = sanitizeVulnerabilities(
      analysisResult.data.vulnerabilities as Record<string, unknown>[],
    );

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
          impact: vuln.impact,
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
      vulnerabilityCount: vulnerabilities.length,
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
