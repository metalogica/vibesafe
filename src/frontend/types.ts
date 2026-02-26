export type AgentRole = 'ingestion' | 'security' | 'evaluator';

export interface AgentMessage {
  id: string;
  agent: AgentRole;
  text: string;
  timestamp: number;
}

export type AuditStatus = 'idle' | 'auditing' | 'ready';

export interface AuditSnapshot {
  hash: string;
  consensus: number;
  messages: AgentMessage[];
  vulnerabilities: Vulnerability[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type SeverityFilter = 'all' | Severity;

export interface Vulnerability {
  id: string;
  title: string;
  file: string;
  severity: Severity;
  category: string;
  description: string;
  impact: string;
  fix: string;
}
