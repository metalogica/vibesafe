import { describe, expect, it } from 'vitest';

import {
  calculateSafetyProbability,
  generateAnalystMessage,
  generateDisplayId,
  generateExecutiveSummary,
} from '@/src/domain/audit/evaluator';

describe('calculateSafetyProbability', () => {
  it('returns 100 for no vulnerabilities', () => {
    expect(calculateSafetyProbability([])).toBe(100);
  });

  it('returns 60 for one critical', () => {
    expect(calculateSafetyProbability([{ level: 'critical' }])).toBe(60);
  });

  it('returns 35 for one critical + one high', () => {
    expect(
      calculateSafetyProbability([{ level: 'critical' }, { level: 'high' }]),
    ).toBe(35);
  });

  it('clamps to 0 for many criticals', () => {
    const vulns = Array.from({ length: 5 }, () => ({ level: 'critical' }));
    expect(calculateSafetyProbability(vulns)).toBe(0);
  });

  it('handles unknown levels gracefully (0 penalty)', () => {
    expect(calculateSafetyProbability([{ level: 'unknown' }])).toBe(100);
  });
});

describe('generateDisplayId', () => {
  it('generates SEC-A-001 for auditId starting with a', () => {
    expect(generateDisplayId('abc', 1)).toBe('SEC-A-001');
  });

  it('generates SEC-X-015 for auditId starting with x', () => {
    expect(generateDisplayId('xyz', 15)).toBe('SEC-X-015');
  });

  it('pads sequence number to 3 digits', () => {
    expect(generateDisplayId('test', 5)).toBe('SEC-T-005');
  });
});

describe('generateExecutiveSummary', () => {
  it('returns clean message for no vulnerabilities', () => {
    const summary = generateExecutiveSummary([]);
    expect(summary).toContain('No security vulnerabilities');
  });

  it('includes severity counts and deployment verdict', () => {
    const vulns = [
      { level: 'critical', category: 'auth' },
      { level: 'critical', category: 'auth' },
      { level: 'high', category: 'injection' },
    ];
    const summary = generateExecutiveSummary(vulns);
    expect(summary).toContain('2 Critical');
    expect(summary).toContain('1 High');
    expect(summary).toContain('Deployment unsafe');
  });

  it('recommends caution for medium-only vulns', () => {
    const vulns = [{ level: 'medium', category: 'configuration' }];
    const summary = generateExecutiveSummary(vulns);
    expect(summary).toContain('1 Medium');
    expect(summary).toContain('caution');
  });
});

describe('generateAnalystMessage', () => {
  it('includes title, severity, category, and displayId', () => {
    const vuln = {
      level: 'high',
      category: 'authentication',
      title: 'Missing Auth Check',
      description: 'The endpoint lacks authentication. Users can access it freely.',
      filePath: 'src/api/users.ts',
    };
    const msg = generateAnalystMessage(vuln, 'SEC-A-001');
    expect(msg).toContain('Missing Auth Check');
    expect(msg).toContain('src/api/users.ts');
    expect(msg).toContain('High');
    expect(msg).toContain('authentication');
    expect(msg).toContain('SEC-A-001');
  });

  it('omits file reference when filePath is undefined', () => {
    const vuln = {
      level: 'medium',
      category: 'configuration',
      title: 'Weak Config',
      description: 'The configuration is insecure.',
    };
    const msg = generateAnalystMessage(vuln, 'SEC-B-002');
    expect(msg).not.toContain(' in ');
    expect(msg).toContain('SEC-B-002');
  });
});
