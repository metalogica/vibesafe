import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';

export const getStreamingByAudit = query({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    const inferences = await ctx.db
      .query('audit_inferences')
      .withIndex('by_audit', (q) => q.eq('auditId', auditId))
      .collect();
    return inferences.find((i) => i.status === 'streaming') ?? null;
  },
});

export const listByAudit = query({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    return await ctx.db
      .query('audit_inferences')
      .withIndex('by_audit', (q) => q.eq('auditId', auditId))
      .collect();
  },
});

export const create = internalMutation({
  args: {
    auditId: v.id('audits'),
    agent: v.string(),
    model: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('audit_inferences', {
      ...args,
      streamingText: '',
      status: 'streaming',
    });
  },
});

export const updateStreamingText = internalMutation({
  args: {
    inferenceId: v.id('audit_inferences'),
    streamingText: v.string(),
  },
  handler: async (ctx, { inferenceId, streamingText }) => {
    await ctx.db.patch(inferenceId, { streamingText });
  },
});

export const complete = internalMutation({
  args: {
    inferenceId: v.id('audit_inferences'),
    response: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, { inferenceId, response, inputTokens, outputTokens }) => {
    await ctx.db.patch(inferenceId, {
      response,
      inputTokens,
      outputTokens,
      status: 'complete',
      streamingText: response,
    });
  },
});

export const fail = internalMutation({
  args: {
    inferenceId: v.id('audit_inferences'),
    error: v.string(),
  },
  handler: async (ctx, { inferenceId, error }) => {
    await ctx.db.patch(inferenceId, { status: 'failed', error });
  },
});
