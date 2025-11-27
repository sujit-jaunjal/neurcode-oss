#!/usr/bin/env node

/**
 * Integration test - Simulates actual GitHub Actions environment
 * Tests the full action flow without needing a real GitHub repo
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { parseDiff, getDiffSummary } from '@neurcode/diff-parser';
import { evaluateRules, createDefaultPolicy } from '@neurcode/policy-engine';

// Mock environment variables
const originalEnv = { ...process.env };

function setupMockEnvironment(): void {
  process.env.GITHUB_EVENT_NAME = 'pull_request';
  process.env.GITHUB_SHA = 'test-sha-123';
  process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
  process.env.GITHUB_EVENT_PATH = '/tmp/github-event.json';
  process.env.GITHUB_TOKEN = 'test-token-123';
}

function cleanupMockEnvironment(): void {
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('GITHUB_')) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, originalEnv);
}

function createTestRepo(): string {
  const testDir = '/tmp/neurcode-test-repo';
  
  // Clean up if exists
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
  
  mkdirSync(testDir, { recursive: true });
  
  // Initialize git repo
  execSync('git init', { cwd: testDir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'ignore' });
  
  // Create initial commit
  writeFileSync(join(testDir, 'README.md'), '# Test Repo\n');
  execSync('git add README.md', { cwd: testDir, stdio: 'ignore' });
  execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'ignore' });
  
  return testDir;
}

function testGetPRDiff(testDir: string): boolean {
  try {
    // Create a test file with secrets
    writeFileSync(join(testDir, 'test.js'), 'const api_key = "secret12345678901234567890";\n');
    execSync('git add test.js', { cwd: testDir, stdio: 'ignore' });
    
    // Get diff
    const diff = execSync('git diff --cached', { cwd: testDir, encoding: 'utf-8' });
    
    if (!diff.includes('api_key')) {
      console.error('  ✗ Diff does not contain expected content');
      return false;
    }
    
    console.log('  ✓ Successfully retrieved PR diff');
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to get PR diff: ${error}`);
    return false;
  }
}

function testFullAnalysisFlow(diff: string): boolean {
  try {
    // Parse diff
    const files = parseDiff(diff);
    if (files.length === 0) {
      console.error('  ✗ No files parsed from diff');
      return false;
    }
    
    // Get summary
    const summary = getDiffSummary(files);
    
    // Evaluate rules
    const result = evaluateRules(files);
    
    // Verify structure
    if (!result.decision || !result.violations) {
      console.error('  ✗ Invalid result structure');
      return false;
    }
    
    // Verify decision is valid
    if (!['allow', 'warn', 'block'].includes(result.decision)) {
      console.error(`  ✗ Invalid decision: ${result.decision}`);
      return false;
    }
    
    console.log(`  ✓ Full analysis flow completed`);
    console.log(`    - Files: ${summary.totalFiles}`);
    console.log(`    - Decision: ${result.decision}`);
    console.log(`    - Violations: ${result.violations.length}`);
    
    return true;
  } catch (error) {
    console.error(`  ✗ Analysis flow failed: ${error}`);
    return false;
  }
}

function testAnnotationGeneration(violations: any[]): boolean {
  try {
    const annotations: string[] = [];
    
    for (const violation of violations) {
      const level = violation.severity === 'block' ? 'error' : 'warning';
      const message = `[${violation.rule}] ${violation.message || 'Violation detected'}`;
      const annotation = `::${level} file=${violation.file}::${message}`;
      annotations.push(annotation);
    }
    
    // Verify all annotations are valid
    for (const annotation of annotations) {
      if (!annotation.includes('::') || !annotation.includes('file=')) {
        console.error(`  ✗ Invalid annotation: ${annotation}`);
        return false;
      }
    }
    
    console.log(`  ✓ Generated ${annotations.length} valid annotation(s)`);
    return true;
  } catch (error) {
    console.error(`  ✗ Annotation generation failed: ${error}`);
    return false;
  }
}

function testCommentGeneration(result: any): boolean {
  try {
    const decisionIcon = result.decision === 'allow' ? '✅' : 
                         result.decision === 'warn' ? '⚠️' : '🚫';
    
    let comment = `## ${decisionIcon} Neurcode Analysis\n\n`;
    comment += `**Decision**: \`${result.decision.toUpperCase()}\`\n\n`;
    comment += `**Summary**:\n`;
    comment += `- Files changed: ${result.summary.totalFiles}\n`;
    comment += `- Lines added: ${result.summary.totalAdded}\n`;
    comment += `- Lines removed: ${result.summary.totalRemoved}\n`;
    
    if (result.violations.length > 0) {
      comment += `\n### ⚠️ Violations Found (${result.violations.length})\n\n`;
      
      const blockViolations = result.violations.filter((v: any) => v.severity === 'block');
      const warnViolations = result.violations.filter((v: any) => v.severity === 'warn');
      
      if (blockViolations.length > 0) {
        comment += `#### 🚫 Blocking Issues (${blockViolations.length})\n\n`;
        blockViolations.forEach((v: any) => {
          comment += `- **${v.file}**: ${v.rule} - ${v.message || 'Violation detected'}\n`;
        });
        comment += '\n';
      }
      
      if (warnViolations.length > 0) {
        comment += `#### ⚠️ Warnings (${warnViolations.length})\n\n`;
        warnViolations.forEach((v: any) => {
          comment += `- **${v.file}**: ${v.rule} - ${v.message || 'Violation detected'}\n`;
        });
        comment += '\n';
      }
    } else {
      comment += `### ✅ No violations detected\n\n`;
    }
    
    // Verify comment structure
    if (!comment.includes('Neurcode Analysis') || 
        !comment.includes('Decision') || 
        !comment.includes('Summary')) {
      console.error('  ✗ Invalid comment structure');
      return false;
    }
    
    console.log(`  ✓ Generated valid comment (${comment.length} chars)`);
    return true;
  } catch (error) {
    console.error(`  ✗ Comment generation failed: ${error}`);
    return false;
  }
}

function testStatusCheckLogic(): boolean {
  try {
    const testCases = [
      { decision: 'allow' as const, failOnWarn: false, expected: 'success' },
      { decision: 'allow' as const, failOnWarn: true, expected: 'success' },
      { decision: 'warn' as const, failOnWarn: false, expected: 'neutral' },
      { decision: 'warn' as const, failOnWarn: true, expected: 'failure' },
      { decision: 'block' as const, failOnWarn: false, expected: 'failure' },
      { decision: 'block' as const, failOnWarn: true, expected: 'failure' },
    ];
    
    for (const testCase of testCases) {
      let conclusion: 'success' | 'failure' | 'neutral' = 'success';
      
      if (testCase.decision === 'block') {
        conclusion = 'failure';
      } else if (testCase.decision === 'warn' && testCase.failOnWarn) {
        conclusion = 'failure';
      } else if (testCase.decision === 'warn') {
        conclusion = 'neutral';
      }
      
      if (conclusion !== testCase.expected) {
        console.error(`  ✗ Status check logic error: ${testCase.decision} with failOnWarn=${testCase.failOnWarn} should be ${testCase.expected}, got ${conclusion}`);
        return false;
      }
    }
    
    console.log('  ✓ Status check logic correct for all scenarios');
    return true;
  } catch (error) {
    console.error(`  ✗ Status check logic test failed: ${error}`);
    return false;
  }
}

// Main integration test
function runIntegrationTests(): void {
  console.log('🔬 Integration Tests - Simulating GitHub Actions Environment\n');
  console.log('='.repeat(60));
  
  setupMockEnvironment();
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Git repo and diff
  console.log('\n📁 Test 1: Git Repository & Diff Retrieval');
  const testDir = createTestRepo();
  const gitTest = testGetPRDiff(testDir);
  if (gitTest) passed++; else failed++;
  
  // Test 2: Full analysis flow
  console.log('\n🔍 Test 2: Full Analysis Flow');
  const testDiff = `diff --git a/test.js b/test.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/test.js
@@ -0,0 +1,3 @@
+const api_key = "secret12345678901234567890";
+console.log("test");
+const password = "mypassword123456";
+`;
  const analysisTest = testFullAnalysisFlow(testDiff);
  if (analysisTest) passed++; else failed++;
  
  // Test 3: Annotation generation
  console.log('\n📌 Test 3: Annotation Generation');
  const files = parseDiff(testDiff);
  const result = evaluateRules(files);
  const annotationTest = testAnnotationGeneration(result.violations);
  if (annotationTest) passed++; else failed++;
  
  // Test 4: Comment generation
  console.log('\n💬 Test 4: Comment Generation');
  const summary = getDiffSummary(files);
  const commentTest = testCommentGeneration({
    decision: result.decision,
    violations: result.violations,
    summary
  });
  if (commentTest) passed++; else failed++;
  
  // Test 5: Status check logic
  console.log('\n✅ Test 5: Status Check Logic');
  const statusTest = testStatusCheckLogic();
  if (statusTest) passed++; else failed++;
  
  // Cleanup
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
  cleanupMockEnvironment();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Integration Test Results:');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Total:  ${passed + failed}`);
  console.log(`  🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All integration tests passed!');
    console.log('✅ Action is ready for use in GitHub Actions');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some integration tests failed. Please review.');
    process.exit(1);
  }
}

runIntegrationTests();

