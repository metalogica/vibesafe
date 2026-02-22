import { v } from 'convex/values';

import type { ActionCtx } from '../_generated/server';
import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { fetchBlob, fetchRepoTree } from '../clients/github';
import { runSecurityAnalysis } from '../clients/claude';
import { shouldIncludeFile } from '../../src/domain/audit/fileFilter';
import {
  TOKEN_LIMIT,
  estimateTokens,
  getFilePriority,
} from '../../src/domain/audit/tokenEstimator';
import {
  calculateSafetyProbability,
  generateAnalystMessage,
  generateDisplayId,
  generateExecutiveSummary,
} from '../../src/domain/audit/evaluator';
import { MAX_BLOB_FETCHES, isOverBudget } from '../../src/domain/audit/actionBudget';
import { sanitizeVulnerabilities } from '../../src/domain/audit/sanitizeVulnerabilities';

export const startAudit = internalAction({
  args: {
    auditId: v.id('audits'),
    owner: v.string(),
    repo: v.string(),
  },
  handler: async (ctx, { auditId, owner, repo }) => {
    const actionStart = Date.now();

    try {
      await runAuditPipeline(ctx, { auditId, owner, repo, actionStart });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected internal error';
      await ctx.runMutation(internal.audits.fail, { auditId, error: message });
    }
  },
});

async function runAuditPipeline(
  ctx: ActionCtx,
  { auditId, owner, repo, actionStart }: {
    auditId: Id<'audits'>; owner: string; repo: string; actionStart: number;
  },
) {
  // === INGESTION PHASE ===

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'fetching' });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'INGESTION',
    message: `Fetching repository ${owner}/${repo} from GitHub...`,
  });

  const treeResult = await fetchRepoTree(owner, repo);
  if (!treeResult.success) {
    await ctx.runMutation(internal.audits.fail, { auditId, error: treeResult.error.message });
    return;
  }

  const { sha: commitHash, tree } = treeResult.data;

  const sourceFiles = tree.filter(
    (entry) => entry.type === 'blob' && shouldIncludeFile(entry.path),
  );

  if (sourceFiles.length === 0) {
    await ctx.runMutation(internal.audits.fail, {
      auditId, error: 'No source code files found in repository',
    });
    return;
  }

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'INGESTION',
    message: `Found ${sourceFiles.length} source files. Fetching contents...`,
  });

  const sortedFiles = [...sourceFiles].sort((a, b) => {
    const pa = getFilePriority(a.path);
    const pb = getFilePriority(b.path);
    if (pa !== pb) return pa - pb;
    return a.path.localeCompare(b.path);
  });

  const files: { path: string; content: string }[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const entry of sortedFiles) {
    if (isOverBudget(actionStart)) {
      truncated = true;
      break;
    }
    if (files.length >= MAX_BLOB_FETCHES) {
      truncated = true;
      break;
    }

    const blobResult = await fetchBlob(owner, repo, entry.sha);

    if (!blobResult.success) {
      if (blobResult.error.code === 'RATE_LIMIT') {
        await ctx.runMutation(internal.audits.fail, {
          auditId, error: blobResult.error.message,
        });
        return;
      }
      continue;
    }

    const content = new TextDecoder().decode(
      Uint8Array.from(atob(blobResult.data.content), (c) => c.charCodeAt(0)),
    );
    const tokens = estimateTokens(content);

    if (totalTokens + tokens > TOKEN_LIMIT) {
      truncated = true;
      break;
    }

    files.push({ path: entry.path, content });
    totalTokens += tokens;
  }

  if (files.length === 0) {
    await ctx.runMutation(internal.audits.fail, {
      auditId, error: 'Failed to fetch any file contents from repository',
    });
    return;
  }

  await ctx.runMutation(internal.audits.updateIngestStats, {
    auditId,
    commitHash,
    truncated,
    stats: {
      totalFiles: sourceFiles.length,
      includedFiles: files.length,
      totalTokens: sourceFiles.length * 250,
      includedTokens: totalTokens,
    },
  });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'INGESTION',
    message: truncated
      ? `Ingestion complete. ${files.length}/${sourceFiles.length} files loaded (budget reached). Starting analysis...`
      : `Ingestion complete. ${files.length} files loaded. Starting analysis...`,
  });

  // === ANALYSIS PHASE ===

  if (isOverBudget(actionStart)) {
    await ctx.runMutation(internal.audits.fail, {
      auditId, error: 'Audit timed out during ingestion. Try a smaller repository.',
    });
    return;
  }

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'analyzing' });

  const analysisResult = await runSecurityAnalysis(files);
  if (!analysisResult.success) {
    await ctx.runMutation(internal.audits.fail, { auditId, error: analysisResult.error.message });
    return;
  }

  const vulnerabilities = sanitizeVulnerabilities(
    analysisResult.data.vulnerabilities as Record<string, unknown>[],
  );

  for (let i = 0; i < vulnerabilities.length; i++) {
    const vuln = vulnerabilities[i];
    const seqNumber = i + 1;
    const displayId = generateDisplayId(auditId, seqNumber);

    const analysisId = await ctx.runMutation(internal.analyses.create, {
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
    });

    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'SECURITY_ANALYST',
      message: generateAnalystMessage(vuln, displayId),
      analysisId,
    });
  }

  // === EVALUATION PHASE ===

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'evaluating' });

  const probability = calculateSafetyProbability(vulnerabilities);
  const executiveSummary = generateExecutiveSummary(vulnerabilities);

  await ctx.runMutation(internal.evaluations.create, {
    auditId,
    probability,
    executiveSummary,
    vulnerabilityCount: vulnerabilities.length,
  });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'EVALUATOR',
    message: executiveSummary,
  });

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'complete' });
}
