import { v } from 'convex/values';

import type { ActionCtx } from '../_generated/server';
import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { fetchBlob, fetchRepoTree } from '../clients/github';
import { buildAnalysisPrompt, runStreamingSecurityAnalysis } from '../clients/claude';
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

  // Create inference record for transparency
  const promptText = buildAnalysisPrompt(files);
  const inferenceId = await ctx.runMutation(internal.inferences.create, {
    auditId,
    agent: 'SECURITY_ANALYST',
    model: 'claude-sonnet-4-5-20250929',
    prompt: promptText,
  });

  let seqCounter = 0;
  let lastFlushTime = Date.now();
  const FLUSH_INTERVAL_MS = 1000;
  const MIN_FLUSH_CHARS = 200;
  let lastFlushedLength = 0;
  const vulnerabilities: ReturnType<typeof sanitizeVulnerabilities> = [];

  const analysisResult = await runStreamingSecurityAnalysis(files, {
    onTextDelta: async (accumulatedText) => {
      const now = Date.now();
      const charsSinceFlush = accumulatedText.length - lastFlushedLength;
      if (now - lastFlushTime >= FLUSH_INTERVAL_MS && charsSinceFlush >= MIN_FLUSH_CHARS) {
        await ctx.runMutation(internal.inferences.updateStreamingText, {
          inferenceId,
          streamingText: accumulatedText,
        });
        lastFlushTime = now;
        lastFlushedLength = accumulatedText.length;
      }
    },

    onVulnerabilityParsed: async (vuln, _parserSeqNumber) => {
      seqCounter++;
      const sanitized = sanitizeVulnerabilities([vuln as Record<string, unknown>]);
      if (sanitized.length === 0) return;

      const v = sanitized[0];
      vulnerabilities.push(v);
      const displayId = generateDisplayId(auditId, seqCounter);

      const analysisId = await ctx.runMutation(internal.analyses.create, {
        auditId,
        seqNumber: seqCounter,
        displayId,
        category: v.category,
        level: v.level,
        title: v.title,
        description: v.description,
        impact: v.impact,
        filePath: v.filePath,
        fix: v.fix,
      });

      await ctx.runMutation(internal.auditEvents.create, {
        auditId,
        agent: 'SECURITY_ANALYST',
        message: generateAnalystMessage(v, displayId),
        analysisId,
      });
    },

    onComplete: async ({ fullResponse, inputTokens, outputTokens }) => {
      await ctx.runMutation(internal.inferences.complete, {
        inferenceId,
        response: fullResponse,
        inputTokens,
        outputTokens,
      });
    },

    onError: async (error) => {
      await ctx.runMutation(internal.inferences.fail, {
        inferenceId,
        error: error.message,
      });
    },
  });

  if (!analysisResult.success) {
    await ctx.runMutation(internal.audits.fail, { auditId, error: analysisResult.error.message });
    return;
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
