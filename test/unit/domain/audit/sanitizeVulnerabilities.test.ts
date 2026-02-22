import { describe, expect, it } from 'vitest';

import {
  SANITIZE_LIMITS,
  sanitizeVulnerabilities,
  sanitizeVulnerability,
} from '@/src/domain/audit/sanitizeVulnerabilities';

describe('sanitizeVulnerability', () => {
  const validVuln = {
    category: 'authentication',
    level: 'high',
    title: 'Missing Auth Check',
    description: 'The endpoint lacks authentication.',
    impact: 'Users can access admin resources.',
    filePath: 'src/api/users.ts',
    fix: 'Add authentication middleware.',
  };

  it('passes through a valid vulnerability unchanged', () => {
    const result = sanitizeVulnerability(validVuln);
    expect(result).toEqual(validVuln);
  });

  it('truncates title exceeding max length', () => {
    const longTitle = 'a'.repeat(300);
    const result = sanitizeVulnerability({ ...validVuln, title: longTitle });
    expect(result!.title.length).toBe(SANITIZE_LIMITS.maxTitleLength);
    expect(result!.title.endsWith('\u2026')).toBe(true);
  });

  it('truncates description exceeding max length', () => {
    const longDesc = 'b'.repeat(3000);
    const result = sanitizeVulnerability({ ...validVuln, description: longDesc });
    expect(result!.description.length).toBe(SANITIZE_LIMITS.maxDescriptionLength);
    expect(result!.description.endsWith('\u2026')).toBe(true);
  });

  it('drops entries with empty title', () => {
    expect(sanitizeVulnerability({ ...validVuln, title: '' })).toBeNull();
  });

  it('drops entries with empty description', () => {
    expect(sanitizeVulnerability({ ...validVuln, description: '' })).toBeNull();
  });

  it('drops entries with unknown level', () => {
    expect(sanitizeVulnerability({ ...validVuln, level: 'extreme' })).toBeNull();
  });

  it('returns undefined for missing optional impact', () => {
    const { impact: _, ...withoutImpact } = validVuln;
    const result = sanitizeVulnerability(withoutImpact);
    expect(result!.impact).toBeUndefined();
  });

  it('truncates filePath exceeding max length', () => {
    const longPath = 'x/'.repeat(300);
    const result = sanitizeVulnerability({ ...validVuln, filePath: longPath });
    expect(result!.filePath!.length).toBe(SANITIZE_LIMITS.maxFilePathLength);
    expect(result!.filePath!.endsWith('\u2026')).toBe(true);
  });

  it('defaults missing category to unknown', () => {
    const { category: _, ...noCat } = validVuln;
    const result = sanitizeVulnerability(noCat);
    expect(result!.category).toBe('unknown');
  });
});

describe('sanitizeVulnerabilities', () => {
  const makeVuln = (i: number) => ({
    category: 'test',
    level: 'low',
    title: `Vuln ${i}`,
    description: `Description ${i}`,
  });

  it('caps at maxVulnerabilities', () => {
    const raw = Array.from({ length: 60 }, (_, i) => makeVuln(i));
    const result = sanitizeVulnerabilities(raw);
    expect(result.length).toBe(SANITIZE_LIMITS.maxVulnerabilities);
  });

  it('drops invalid entries and keeps valid ones', () => {
    const raw = [
      makeVuln(1),
      { ...makeVuln(2), level: 'invalid' },
      makeVuln(3),
    ];
    const result = sanitizeVulnerabilities(raw);
    expect(result.length).toBe(2);
    expect(result[0].title).toBe('Vuln 1');
    expect(result[1].title).toBe('Vuln 3');
  });
});
