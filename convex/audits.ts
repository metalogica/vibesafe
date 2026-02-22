import { v } from 'convex/values';

import { internal } from './_generated/api';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { parseGitHubUrl } from '../src/domain/audit/parseGitHubUrl';

export const create = mutation({
  args: {
    repoUrl: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    commitHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    return await ctx.db.insert('audits', {
      ...args,
      status: 'pending',
      userId: identity?.subject ?? undefined,
    });
  },
});

export const get = query({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    const audit = await ctx.db.get(auditId);
    if (!audit) throw new Error('NOT_FOUND');
    return audit;
  },
});

export const getInternal = internalQuery({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    return await ctx.db.get(auditId);
  },
});

export const listByRepo = query({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    return await ctx.db
      .query('audits')
      .withIndex('by_url', (q) => q.eq('repoUrl', repoUrl))
      .order('desc')
      .collect();
  },
});

export const updateStatus = internalMutation({
  args: {
    auditId: v.id('audits'),
    status: v.union(
      v.literal('pending'),
      v.literal('fetching'),
      v.literal('analyzing'),
      v.literal('evaluating'),
      v.literal('complete'),
      v.literal('failed'),
    ),
  },
  handler: async (ctx, { auditId, status }) => {
    await ctx.db.patch(auditId, { status });
  },
});

export const fail = internalMutation({
  args: {
    auditId: v.id('audits'),
    error: v.string(),
  },
  handler: async (ctx, { auditId, error }) => {
    await ctx.db.patch(auditId, { status: 'failed' as const, error });
  },
});

export const updateIngestStats = internalMutation({
  args: {
    auditId: v.id('audits'),
    commitHash: v.string(),
    truncated: v.boolean(),
    stats: v.object({
      totalFiles: v.number(),
      includedFiles: v.number(),
      totalTokens: v.number(),
      includedTokens: v.number(),
    }),
  },
  handler: async (ctx, { auditId, commitHash, truncated, stats }) => {
    await ctx.db.patch(auditId, { commitHash, truncated, stats });
  },
});

export const createAndStart = mutation({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      throw new Error('INVALID_URL');
    }

    const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    const auditId = await ctx.db.insert('audits', {
      repoUrl: normalizedUrl,
      repoOwner: parsed.owner,
      repoName: parsed.repo,
      status: 'pending',
    });

    await ctx.scheduler.runAfter(0, internal.services.startAuditAction.startAudit, {
      auditId,
      owner: parsed.owner,
      repo: parsed.repo,
    });

    return { auditId, repoUrl: normalizedUrl };
  },
});

export const listByRepoWithEvaluation = query({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    const audits = await ctx.db
      .query('audits')
      .withIndex('by_url', (q) => q.eq('repoUrl', repoUrl))
      .order('desc')
      .collect();

    return await Promise.all(
      audits.map(async (audit) => {
        const evaluation = await ctx.db
          .query('audit_evaluations')
          .withIndex('by_audit', (q) => q.eq('auditId', audit._id))
          .first();
        return { ...audit, evaluation };
      }),
    );
  },
});
