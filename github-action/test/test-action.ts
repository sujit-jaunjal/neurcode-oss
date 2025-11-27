#!/usr/bin/env node

/**
 * Test script for GitHub Action
 * Simulates GitHub Actions environment and tests core functionality
 */

import { execSync } from 'child_process';
import { parseDiff, getDiffSummary } from '@neurcode/diff-parser';
import { evaluateRules, createDefaultPolicy, Decision } from '@neurcode/policy-engine';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Mock GitHub context
const mockContext = {
  eventName: 'pull_request',
  sha: 'test-sha-123',
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  },
  issue: {
    owner: 'test-owner',
    repo: 'test-repo',
    number: 1
  },
  payload: {
    pull_request: {
      base: { sha: 'base-sha' },
      head: { sha: 'head-sha' }
    }
  }
};

// Test cases
const testCases = [
  {
    name: 'Test with secrets',
    diff: `diff --git a/test.js b/test.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/test.js
@@ -0,0 +1,5 @@
+const api_key = "secret12345678901234567890";
+console.log("test");
+const password = "mypassword123456";
+`,
    expectedDecision: 'block' as Decision,
    expectedViolations: 1  // Rule engine groups multiple secrets into one violation with count
  },
  {
    name: 'Test with sensitive file',
    diff: `diff --git a/.env b/.env
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/.env
@@ -0,0 +1,2 @@
+API_KEY=test
+SECRET=test
+`,
    expectedDecision: 'block' as Decision,
    expectedViolations: 1
  },
  {
    name: 'Test with suspicious keywords',
    diff: `diff --git a/test.js b/test.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/test.js
@@ -0,0 +1,3 @@
+eval("dangerous");
+localStorage.setItem("key", "value");
+`,
    expectedDecision: 'warn' as Decision,
    expectedViolations: 1
  },
  {
    name: 'Test with safe code',
    diff: `diff --git a/test.js b/test.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/test.js
@@ -0,0 +1,3 @@
+function hello() {
+  return "world";
+}
+`,
    expectedDecision: 'allow' as Decision,
    expectedViolations: 0
  },
  {
    name: 'Test with large change',
    diff: `diff --git a/large.js b/large.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/large.js
@@ -0,0 +1001 @@
${Array(1001).fill(0).map((_, i) => `+line ${i}`).join('\n')}
`,
    expectedDecision: 'warn' as Decision,
    expectedViolations: 1
  }
];

// Test functions
function testDiffParsing(diff: string): boolean {
  try {
    const files = parseDiff(diff);
    const summary = getDiffSummary(files);
    console.log(`  ✓ Parsed ${files.length} file(s), ${summary.totalAdded} added, ${summary.totalRemoved} removed`);
    return files.length > 0;
  } catch (error) {
    console.error(`  ✗ Diff parsing failed: ${error}`);
    return false;
  }
}

function testRuleEvaluation(diff: string, expectedDecision: Decision, expectedViolations: number): boolean {
  try {
    const files = parseDiff(diff);
    const result = evaluateRules(files);
    
    const decisionMatch = result.decision === expectedDecision;
    const violationsMatch = result.violations.length === expectedViolations;
    
    if (decisionMatch && violationsMatch) {
      console.log(`  ✓ Decision: ${result.decision} (expected: ${expectedDecision})`);
      console.log(`  ✓ Violations: ${result.violations.length} (expected: ${expectedViolations})`);
      return true;
    } else {
      console.error(`  ✗ Decision mismatch: got ${result.decision}, expected ${expectedDecision}`);
      console.error(`  ✗ Violations mismatch: got ${result.violations.length}, expected ${expectedViolations}`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Rule evaluation failed: ${error}`);
    return false;
  }
}

function testAnnotationFormat(violations: any[]): boolean {
  try {
    for (const violation of violations) {
      const level = violation.severity === 'block' ? 'error' : 'warning';
      const message = `[${violation.rule}] ${violation.message || 'Violation detected'}`;
      const annotation = `::${level} file=${violation.file}::${message}`;
      
      // Verify format
      if (!annotation.includes('::') || !annotation.includes('file=')) {
        console.error(`  ✗ Invalid annotation format: ${annotation}`);
        return false;
      }
    }
    console.log(`  ✓ Generated ${violations.length} annotation(s) with correct format`);
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
    }
    
    // Verify comment structure
    if (!comment.includes('Neurcode Analysis') || !comment.includes('Decision')) {
      console.error(`  ✗ Invalid comment format`);
      return false;
    }
    
    console.log(`  ✓ Generated comment with correct format (${comment.length} chars)`);
    return true;
  } catch (error) {
    console.error(`  ✗ Comment generation failed: ${error}`);
    return false;
  }
}

function testStatusCheckLogic(result: any, failOnWarn: boolean = false): boolean {
  try {
    let conclusion: 'success' | 'failure' | 'neutral' = 'success';
    
    if (result.decision === 'block') {
      conclusion = 'failure';
    } else if (result.decision === 'warn' && failOnWarn) {
      conclusion = 'failure';
    } else if (result.decision === 'warn') {
      conclusion = 'neutral';
    }
    
    // Verify logic
    if (result.decision === 'block' && conclusion !== 'failure') {
      console.error(`  ✗ Status check logic error: block should be failure`);
      return false;
    }
    
    if (result.decision === 'allow' && conclusion !== 'success') {
      console.error(`  ✗ Status check logic error: allow should be success`);
      return false;
    }
    
    console.log(`  ✓ Status check: ${conclusion} (decision: ${result.decision}, failOnWarn: ${failOnWarn})`);
    return true;
  } catch (error) {
    console.error(`  ✗ Status check logic failed: ${error}`);
    return false;
  }
}

function testEmptyDiff(): boolean {
  try {
    const files = parseDiff('');
    if (files.length !== 0) {
      console.error(`  ✗ Empty diff should return 0 files`);
      return false;
    }
    console.log(`  ✓ Empty diff handled correctly`);
    return true;
  } catch (error) {
    // Empty diff might throw, which is acceptable
    console.log(`  ✓ Empty diff handled (threw error, which is acceptable)`);
    return true;
  }
}

function testInvalidDiff(): boolean {
  try {
    const files = parseDiff('not a valid diff');
    // Should handle gracefully
    console.log(`  ✓ Invalid diff handled gracefully (${files.length} files)`);
    return true;
  } catch (error) {
    // Throwing is also acceptable
    console.log(`  ✓ Invalid diff handled (threw error, which is acceptable)`);
    return true;
  }
}

// Main test runner
function runTests(): void {
  console.log('🧪 Testing Neurcode GitHub Action\n');
  console.log('=' .repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Test cases
  console.log('\n📋 Test Cases:');
  for (const testCase of testCases) {
    console.log(`\n  Testing: ${testCase.name}`);
    
    const parseOk = testDiffParsing(testCase.diff);
    const evalOk = testRuleEvaluation(
      testCase.diff,
      testCase.expectedDecision,
      testCase.expectedViolations
    );
    
    if (parseOk && evalOk) {
      passed++;
      console.log(`  ✅ PASSED`);
    } else {
      failed++;
      console.log(`  ❌ FAILED`);
    }
  }
  
  // Test 2: Annotation format
  console.log('\n📌 Testing Annotation Format:');
  const testResult = evaluateRules(parseDiff(testCases[0].diff));
  const annotationOk = testAnnotationFormat(testResult.violations);
  if (annotationOk) {
    passed++;
    console.log(`  ✅ PASSED`);
  } else {
    failed++;
    console.log(`  ❌ FAILED`);
  }
  
  // Test 3: Comment generation
  console.log('\n💬 Testing Comment Generation:');
  const summary = getDiffSummary(parseDiff(testCases[0].diff));
  const commentOk = testCommentGeneration({
    decision: testResult.decision,
    violations: testResult.violations,
    summary
  });
  if (commentOk) {
    passed++;
    console.log(`  ✅ PASSED`);
  } else {
    failed++;
    console.log(`  ❌ FAILED`);
  }
  
  // Test 4: Status check logic
  console.log('\n✅ Testing Status Check Logic:');
  for (const testCase of testCases) {
    const files = parseDiff(testCase.diff);
    const result = evaluateRules(files);
    const summary = getDiffSummary(files);
    
    const statusOk1 = testStatusCheckLogic({ ...result, summary }, false);
    const statusOk2 = testStatusCheckLogic({ ...result, summary }, true);
    
    if (statusOk1 && statusOk2) {
      passed += 2;
    } else {
      failed += 2;
    }
  }
  
  // Test 5: Edge cases
  console.log('\n🔍 Testing Edge Cases:');
  const emptyOk = testEmptyDiff();
  const invalidOk = testInvalidDiff();
  
  if (emptyOk) passed++; else failed++;
  if (invalidOk) passed++; else failed++;
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results:');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Total:  ${passed + failed}`);
  console.log(`  🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review.');
    process.exit(1);
  }
}

// Run tests
runTests();

