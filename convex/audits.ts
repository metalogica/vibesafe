import { v } from 'convex/values';

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';

export const create = mutation({
  args: {
    repoUrl: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    commitHash: v.string(),
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
