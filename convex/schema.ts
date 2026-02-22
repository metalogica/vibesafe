import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  audits: defineTable({
    repoUrl: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    commitHash: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('fetching'),
      v.literal('analyzing'),
      v.literal('evaluating'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    userId: v.optional(v.string()),
    truncated: v.optional(v.boolean()),
    stats: v.optional(
      v.object({
        totalFiles: v.number(),
        includedFiles: v.number(),
        totalTokens: v.number(),
        includedTokens: v.number(),
      }),
    ),
    error: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_repo', ['repoOwner', 'repoName'])
    .index('by_url', ['repoUrl']),

  audit_analyses: defineTable({
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
  }).index('by_audit', ['auditId']),

  audit_evaluations: defineTable({
    auditId: v.id('audits'),
    probability: v.number(),
    executiveSummary: v.string(),
  }).index('by_audit', ['auditId']),

  audit_events: defineTable({
    auditId: v.id('audits'),
    agent: v.union(
      v.literal('SECURITY_ANALYST'),
      v.literal('EVALUATOR'),
    ),
    message: v.string(),
    analysisId: v.optional(v.id('audit_analyses')),
  }).index('by_audit', ['auditId']),
});
