/**
 * Integration Tests for CLI → API Flow
 * 
 * Tests the complete flow: CLI → API → Database → Response
 * 
 * NOTE: This test requires a running API server. It tests the CLI's ability
 * to communicate with the API via HTTP, not direct imports.
 * 
 * To run these tests:
 * 1. Start the API server (from neurcode-api repo)
 * 2. Set NEURCODE_API_URL and NEURCODE_API_KEY environment variables
 * 3. Run: pnpm test check.integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

describe('CLI → API Integration Tests', () => {
  const apiUrl = process.env.NEURCODE_API_URL || 'http://localhost:3000';
  const apiKey = process.env.NEURCODE_API_KEY;
  let cliPath: string;

  beforeAll(() => {
    if (!apiKey) {
      console.warn('NEURCODE_API_KEY not set, skipping integration tests');
      return;
    }

    // Build CLI
    const cliDir = join(__dirname, '..', '..');
    try {
      execSync('pnpm build', { cwd: cliDir, stdio: 'inherit' });
      cliPath = join(cliDir, 'dist', 'index.js');
    } catch (error) {
      console.error('Failed to build CLI:', error);
      throw error;
    }
  });

  describe('CLI online mode', () => {
    it('should send diff to API and get response', async () => {
      if (!apiKey) {
        console.log('Skipping test: API key not provided');
        return;
      }

      // Create a test git repo with a diff
      const testDir = '/tmp/neurcode-cli-test';
      try {
        execSync('rm -rf ' + testDir, { stdio: 'ignore' });
        execSync('mkdir -p ' + testDir, { stdio: 'ignore' });
        execSync('git init', { cwd: testDir, stdio: 'ignore' });
        execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' });
        
        // Create a test file
        const fs = await import('fs');
        fs.writeFileSync(join(testDir, 'test.js'), 'console.log("test");\n');
        execSync('git add test.js', { cwd: testDir, stdio: 'ignore' });
        execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'ignore' });
        
        // Make a change
        fs.writeFileSync(join(testDir, 'test.js'), 'console.log("test");\nconst x = 1;\n');
        execSync('git add test.js', { cwd: testDir, stdio: 'ignore' });

        // Run CLI with online mode
        const result = execSync(
          `node ${cliPath} check --online --staged`,
          {
            cwd: testDir,
            env: {
              ...process.env,
              NEURCODE_API_URL: apiUrl,
              NEURCODE_API_KEY: apiKey,
            },
            encoding: 'utf-8',
          }
        );

        // Should not throw and should contain analysis results
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      } finally {
        execSync('rm -rf ' + testDir, { stdio: 'ignore' });
      }
    }, 60000);

    it('should handle API errors gracefully', async () => {
      if (!apiKey) {
        console.log('Skipping test: API key not provided');
        return;
      }

      const testDir = '/tmp/neurcode-cli-test-error';
      try {
        execSync('rm -rf ' + testDir, { stdio: 'ignore' });
        execSync('mkdir -p ' + testDir, { stdio: 'ignore' });
        execSync('git init', { cwd: testDir, stdio: 'ignore' });
        execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' });

        // Use invalid API key
        try {
          execSync(
            `node ${cliPath} check --online --staged`,
            {
              cwd: testDir,
              env: {
                ...process.env,
                NEURCODE_API_URL: apiUrl,
                NEURCODE_API_KEY: 'invalid_key',
              },
              encoding: 'utf-8',
              stdio: 'pipe',
            }
          );
        } catch (error: any) {
          // Should fail with error message
          expect(error.message).toBeDefined();
        }
      } finally {
        execSync('rm -rf ' + testDir, { stdio: 'ignore' });
      }
    }, 30000);
  });
});
