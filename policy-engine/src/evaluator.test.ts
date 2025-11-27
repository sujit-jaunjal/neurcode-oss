/**
 * Unit Tests for Policy Engine Evaluator
 * 
 * Tests rule evaluation, edge cases, and various violation scenarios.
 */

import { describe, it, expect } from 'vitest';
import { evaluateRules } from './evaluator';
import { createDefaultPolicy } from './policy';
import { defaultRules } from './default-rules';
import type { DiffFile } from '@neurcode/diff-parser';
import type { Rule, RuleResult, Policy } from './types';

describe('evaluatePolicy', () => {
  describe('sensitive file detection', () => {
    it('should detect .env files', () => {
      const diff: DiffFile[] = [{
        path: '.env',
        changeType: 'add',
        addedLines: 5,
        removedLines: 0,
        hunks: [],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.rule.includes('sensitive') || v.rule.includes('.env'))).toBe(true);
    });

    it('should detect .key files', () => {
      const diff: DiffFile[] = [{
        path: 'secret.key',
        changeType: 'add',
        addedLines: 1,
        removedLines: 0,
        hunks: [],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should detect multiple sensitive files', () => {
      const diff: DiffFile[] = [
        { path: '.env', changeType: 'add', addedLines: 1, removedLines: 0, hunks: [] },
        { path: 'secret.key', changeType: 'add', addedLines: 1, removedLines: 0, hunks: [] },
        { path: 'config.json', changeType: 'add', addedLines: 1, removedLines: 0, hunks: [] },
      ];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('secret detection', () => {
    it('should detect API keys in code', () => {
      const diff: DiffFile[] = [{
        path: 'config.js',
        changeType: 'modify',
        addedLines: 2,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 2,
          lines: [
            { type: 'added', content: "const API_KEY = 'AKIAIOSFODNN7EXAMPLE';" },
            { type: 'added', content: "console.log('test');" },
          ],
        }],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
      expect(result.violations.some((v) => 
        v.rule.toLowerCase().includes('secret') || 
        v.rule.toLowerCase().includes('api') ||
        v.rule.toLowerCase().includes('key')
      )).toBe(true);
    });

    it('should detect passwords', () => {
      const diff: DiffFile[] = [{
        path: 'config.js',
        changeType: 'modify',
        addedLines: 1,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'added', content: "const PASSWORD = 'mySecretPassword123';" },
          ],
        }],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should detect database URLs', () => {
      const diff: DiffFile[] = [{
        path: 'config.js',
        changeType: 'modify',
        addedLines: 1,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'added', content: "const DB_URL = 'postgres://user:pass@host:5432/db';" },
          ],
        }],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('suspicious patterns', () => {
    it('should detect eval() usage', () => {
      const diff: DiffFile[] = [{
        path: 'script.js',
        changeType: 'modify',
        addedLines: 1,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'added', content: "eval(userInput);" },
          ],
        }],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('warn');
      expect(result.violations.some((v) => 
        v.rule.toLowerCase().includes('eval') ||
        v.rule.toLowerCase().includes('suspicious')
      )).toBe(true);
    });

    it('should detect innerHTML usage', () => {
      const diff: DiffFile[] = [{
        path: 'app.js',
        changeType: 'modify',
        addedLines: 1,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'added', content: "element.innerHTML = userContent;" },
          ],
        }],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('warn');
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('large changes', () => {
    it('should warn on large file changes', () => {
      const diff: DiffFile[] = [{
        path: 'large.js',
        changeType: 'modify',
        addedLines: 1500,
        removedLines: 200,
        hunks: [],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('warn');
      expect(result.violations.some((v) => 
        v.rule.toLowerCase().includes('large') ||
        v.rule.toLowerCase().includes('size')
      )).toBe(true);
    });

    it('should allow small changes', () => {
      const diff: DiffFile[] = [{
        path: 'small.js',
        changeType: 'modify',
        addedLines: 10,
        removedLines: 5,
        hunks: [],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('allow');
      expect(result.violations.length).toBe(0);
    });
  });

  describe('decision logic', () => {
    it('should prioritize block over warn', () => {
      const diff: DiffFile[] = [
        {
          path: '.env',
          changeType: 'add',
          addedLines: 1,
          removedLines: 0,
          hunks: [],
        },
        {
          path: 'script.js',
          changeType: 'modify',
          addedLines: 1,
          removedLines: 0,
          hunks: [{
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [
              { type: 'added', content: "eval('test');" },
            ],
          }],
        },
      ];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('block');
    });

    it('should return allow when no violations', () => {
      const diff: DiffFile[] = [{
        path: 'safe.js',
        changeType: 'modify',
        addedLines: 5,
        removedLines: 2,
        hunks: [{
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 5,
          lines: [
            { type: 'added', content: "console.log('safe');" },
            { type: 'added', content: "const x = 1;" },
            { type: 'added', content: "const y = 2;" },
            { type: 'added', content: "const z = 3;" },
            { type: 'added', content: "const w = 4;" },
          ],
        }],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('allow');
      expect(result.violations.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty diff', () => {
      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules([], defaultPolicy.rules);

      expect(result.decision).toBe('allow');
      expect(result.violations.length).toBe(0);
    });

    it('should handle files with no hunks', () => {
      const diff: DiffFile[] = [{
        path: 'file.js',
        changeType: 'modify',
        addedLines: 0,
        removedLines: 0,
        hunks: [],
      }];

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result.decision).toBe('allow');
    });

    it('should handle very large number of files', () => {
      const diff: DiffFile[] = Array(1000).fill(0).map((_, i) => ({
        path: `file${i}.js`,
        changeType: 'modify' as const,
        addedLines: 10,
        removedLines: 5,
        hunks: [],
      }));

      const defaultPolicy = createDefaultPolicy();
      const result = evaluateRules(diff, defaultPolicy.rules);

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
    });
  });

  describe('custom policies', () => {
    it('should evaluate custom rules', () => {
      const customPolicy: Policy = {
        id: 'custom-policy-1',
        name: 'Custom Policy',
        version: '1.0.0',
        rules: [
          {
            id: 'custom-rule',
            name: 'No console.log',
            description: 'Disallow console.log statements',
            severity: 'warn',
            enabled: true,
            type: 'line-pattern',
            pattern: 'console\\.log',
            matchType: 'both',
          },
        ],
      };

      const diff: DiffFile[] = [{
        path: 'file.js',
        changeType: 'modify',
        addedLines: 1,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'added', content: "console.log('test');" },
          ],
        }],
      }];

      const result = evaluateRules(diff, customPolicy.rules);

      expect(result.decision).toBe('warn');
      expect(result.violations.some((v) => v.rule === 'custom-rule')).toBe(true);
    });

    it('should respect disabled rules', () => {
      const customPolicy: Policy = {
        id: 'disabled-policy-1',
        name: 'Custom Policy',
        version: '1.0.0',
        rules: [
          {
            id: 'disabled-rule',
            name: 'Disabled Rule',
            description: 'This rule is disabled',
            severity: 'block',
            enabled: false,
            type: 'line-pattern',
            pattern: '.*',
            matchType: 'both',
          },
        ],
      };

      const diff: DiffFile[] = [{
        path: 'file.js',
        changeType: 'modify',
        addedLines: 1,
        removedLines: 0,
        hunks: [{
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'added', content: "anything" },
          ],
        }],
      }];

      const result = evaluateRules(diff, customPolicy.rules);

      expect(result.decision).toBe('allow');
      expect(result.violations.length).toBe(0);
    });
  });
});

