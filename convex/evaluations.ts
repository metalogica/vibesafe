import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';

export const create = internalMutation({
  args: {
    auditId: v.id('audits'),
    probability: v.number(),
    executiveSummary: v.string(),
    vulnerabilityCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('audit_evaluations', args);
  },
});

export const getByAudit = query({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    return await ctx.db
      .query('audit_evaluations')
      .withIndex('by_audit', (q) => q.eq('auditId', auditId))
      .first();
  },
});
