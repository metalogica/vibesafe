import type { Doc } from '../../../convex/_generated/dataModel';
import type { AgentMessage, Vulnerability } from '../types';

export function mapAnalysisToVulnerability(
  analysis: Doc<'audit_analyses'>,
): Vulnerability {
  return {
    id: analysis.displayId,
    title: analysis.title,
    file: analysis.filePath ?? '(architectural)',
    severity: analysis.level,
    category: analysis.category,
    description: analysis.description,
    impact: analysis.impact ?? '',
    fix: analysis.fix ?? '',
  };
}

const AGENT_MAP: Record<string, AgentMessage['agent']> = {
  INGESTION: 'ingestion',
  SECURITY_ANALYST: 'security',
  EVALUATOR: 'evaluator',
};

export function mapEventToMessage(
  event: Doc<'audit_events'>,
): AgentMessage {
  return {
    id: event._id,
    agent: AGENT_MAP[event.agent] ?? 'security',
    text: event.message,
    timestamp: event._creationTime,
  };
}
