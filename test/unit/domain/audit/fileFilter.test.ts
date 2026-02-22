import { describe, expect, it } from 'vitest';

import { shouldIncludeFile } from '@/src/domain/audit/fileFilter';

describe('shouldIncludeFile', () => {
  it('includes TypeScript source files', () => {
    expect(shouldIncludeFile('src/auth/login.ts')).toBe(true);
  });

  it('excludes node_modules', () => {
    expect(shouldIncludeFile('node_modules/lodash/index.js')).toBe(false);
  });

  it('excludes image files', () => {
    expect(shouldIncludeFile('public/logo.png')).toBe(false);
  });

  it('excludes dist directory', () => {
    expect(shouldIncludeFile('dist/bundle.js')).toBe(false);
  });

  it('excludes package-lock.json', () => {
    expect(shouldIncludeFile('package-lock.json')).toBe(false);
  });

  it('includes Dockerfile', () => {
    expect(shouldIncludeFile('Dockerfile')).toBe(true);
  });

  it('includes YAML config files', () => {
    expect(shouldIncludeFile('config/db.yaml')).toBe(true);
  });

  it('includes .env.example', () => {
    expect(shouldIncludeFile('.env.example')).toBe(true);
  });

  it('excludes .min.js files', () => {
    expect(shouldIncludeFile('vendor/lib.min.js')).toBe(false);
  });

  it('excludes .map files', () => {
    expect(shouldIncludeFile('dist/app.js.map')).toBe(false);
  });

  it('includes Python files', () => {
    expect(shouldIncludeFile('app/main.py')).toBe(true);
  });

  it('excludes files without allowed extensions', () => {
    expect(shouldIncludeFile('README.md')).toBe(false);
  });

  it('includes SQL files', () => {
    expect(shouldIncludeFile('migrations/001.sql')).toBe(true);
  });

  it('excludes .git directory', () => {
    expect(shouldIncludeFile('.git/config')).toBe(false);
  });
});
