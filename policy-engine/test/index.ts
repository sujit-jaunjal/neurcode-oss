import { evaluateRules, createDefaultPolicy, createPolicy } from '../src/index';
import { parseDiff } from '@neurcode/diff-parser';

// Test diff with secrets
const testDiff = `diff --git a/test.js b/test.js
index a2248ef..703a9bb 100644
--- a/test.js
+++ b/test.js
@@ -1 +1,2 @@
 console.log('test');
+const api_key = 'secret12345678901234567890';
`;

console.log('🧪 Testing Policy Engine...\n');

// Test 1: Default policy
console.log('Test 1: Default Policy');
const diffFiles = parseDiff(testDiff);
const defaultPolicy = createDefaultPolicy();
const result1 = evaluateRules(diffFiles, defaultPolicy.rules);
console.log(`  Decision: ${result1.decision}`);
console.log(`  Violations: ${result1.violations.length}`);
result1.violations.forEach(v => {
  console.log(`    - ${v.rule}: ${v.message}`);
});

// Test 2: Custom policy
console.log('\nTest 2: Custom Policy');
const customPolicy = createPolicy(
  'test-policy',
  'Test Policy',
  [
    {
      id: 'custom-secret',
      name: 'Custom Secret Detection',
      enabled: true,
      severity: 'block',
      type: 'potential-secret',
      patterns: ['api[_-]?key\\s*[=:]\\s*[\'"]?[a-zA-Z0-9]{20,}[\'"]?']
    }
  ]
);
const result2 = evaluateRules(diffFiles, customPolicy.rules);
console.log(`  Decision: ${result2.decision}`);
console.log(`  Violations: ${result2.violations.length}`);

// Test 3: Disabled rule
console.log('\nTest 3: Disabled Rule');
const disabledPolicy = createPolicy(
  'disabled-policy',
  'Policy with Disabled Rule',
  [
    {
      id: 'disabled-secret',
      name: 'Disabled Secret Detection',
      enabled: false,  // Disabled!
      severity: 'block',
      type: 'potential-secret',
      patterns: ['api[_-]?key']
    }
  ]
);
const result3 = evaluateRules(diffFiles, disabledPolicy.rules);
console.log(`  Decision: ${result3.decision}`);
console.log(`  Violations: ${result3.violations.length}`);

console.log('\n✅ All tests completed!');

