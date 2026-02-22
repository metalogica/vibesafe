import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';

export const create = internalMutation({
  args: {
    auditId: v.id('audits'),
    seqNumber: v.number(),
    displayId: v.string(),
    category: v.string(),
    level: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('critical'),
    ),
    title: v.string(),
    description: v.string(),
    filePath: v.optional(v.string()),
    fix: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('audit_analyses', args);
  },
});

export const listByAudit = query({
  args: { auditId: v.id('audits') },
  handler: async (ctx, { auditId }) => {
    return await ctx.db
      .query('audit_analyses')
      .withIndex('by_audit', (q) => q.eq('auditId', auditId))
      .collect();
  },
});
