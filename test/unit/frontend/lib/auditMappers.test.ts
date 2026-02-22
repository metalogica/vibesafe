import { describe, expect, it } from 'vitest';

import {
  mapAnalysisToVulnerability,
  mapEventToMessage,
} from '@/src/frontend/lib/auditMappers';

describe('mapEventToMessage', () => {
  const baseEvent = {
    _id: 'event123' as any,
    _creationTime: 1700000000000,
    auditId: 'audit123' as any,
    message: 'Found vulnerability',
  };

  it('maps INGESTION agent to ingestion', () => {
    const result = mapEventToMessage({ ...baseEvent, agent: 'INGESTION' as const });
    expect(result.agent).toBe('ingestion');
  });

  it('maps SECURITY_ANALYST agent to security', () => {
    const result = mapEventToMessage({ ...baseEvent, agent: 'SECURITY_ANALYST' as const });
    expect(result.agent).toBe('security');
  });

  it('maps EVALUATOR agent to evaluator', () => {
    const result = mapEventToMessage({ ...baseEvent, agent: 'EVALUATOR' as const });
    expect(result.agent).toBe('evaluator');
  });

  it('maps _creationTime to timestamp', () => {
    const result = mapEventToMessage({ ...baseEvent, agent: 'INGESTION' as const });
    expect(result.timestamp).toBe(1700000000000);
    expect(typeof result.timestamp).toBe('number');
  });

  it('maps _id to id', () => {
    const result = mapEventToMessage({ ...baseEvent, agent: 'INGESTION' as const });
    expect(result.id).toBe('event123');
    expect(typeof result.id).toBe('string');
  });

  it('maps message to text', () => {
    const result = mapEventToMessage({ ...baseEvent, agent: 'INGESTION' as const });
    expect(result.text).toBe('Found vulnerability');
  });
});

describe('mapAnalysisToVulnerability', () => {
  const baseAnalysis = {
    _id: 'analysis123' as any,
    _creationTime: 1700000000000,
    auditId: 'audit123' as any,
    seqNumber: 1,
    displayId: 'SEC-A-001',
    category: 'authentication',
    level: 'critical' as const,
    title: 'Missing Auth Check',
    description: 'The endpoint lacks authentication.',
    impact: 'Unauthorized access to user data.',
    filePath: 'src/api/users.ts',
    fix: 'Add authentication middleware.',
  };

  it('maps all fields correctly', () => {
    const result = mapAnalysisToVulnerability(baseAnalysis);
    expect(result.id).toBe('SEC-A-001');
    expect(result.title).toBe('Missing Auth Check');
    expect(result.file).toBe('src/api/users.ts');
    expect(result.severity).toBe('critical');
    expect(result.category).toBe('authentication');
    expect(result.description).toBe('The endpoint lacks authentication.');
    expect(result.impact).toBe('Unauthorized access to user data.');
    expect(result.fix).toBe('Add authentication middleware.');
  });

  it('defaults filePath undefined to (architectural)', () => {
    const result = mapAnalysisToVulnerability({ ...baseAnalysis, filePath: undefined });
    expect(result.file).toBe('(architectural)');
  });

  it('defaults impact undefined to empty string', () => {
    const result = mapAnalysisToVulnerability({ ...baseAnalysis, impact: undefined });
    expect(result.impact).toBe('');
  });

  it('defaults fix undefined to empty string', () => {
    const result = mapAnalysisToVulnerability({ ...baseAnalysis, fix: undefined });
    expect(result.fix).toBe('');
  });

  it('preserves level as severity (enum passthrough)', () => {
    const result = mapAnalysisToVulnerability({ ...baseAnalysis, level: 'critical' as const });
    expect(result.severity).toBe('critical');
  });

  it('maps displayId to id', () => {
    const result = mapAnalysisToVulnerability({ ...baseAnalysis, displayId: 'SEC-X-015' });
    expect(result.id).toBe('SEC-X-015');
  });
});
