import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';

export const create = internalMutation({
  args: {
    auditId: v.id('audits'),
    agent: v.union(
      v.literal('INGESTION'),
      v.literal('SECURITY_ANALYST'),
      v.literal('EVALUATOR'),
    ),
    message: v.string(),
    analysisId: v.optional(v.id('audit_analyses')),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('audit_events', args);
  },
});

export const listByAudit = query({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    return await ctx.db
      .query('audit_events')
      .withIndex('by_audit', (q) => q.eq('auditId', auditId))
      .order('asc')
      .collect();
  },
});
