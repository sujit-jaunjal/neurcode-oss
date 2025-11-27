import { execSync } from 'child_process';
import { parseDiff, getDiffSummary, DiffFile } from '@neurcode/diff-parser';
import { evaluateRules, RuleResult, Decision } from '../rules';
import { loadConfig } from '../config';
import { ApiClient } from '../api-client';

interface CheckOptions {
  staged?: boolean;
  head?: boolean;
  base?: string;
  online?: boolean;
}

export async function checkCommand(options: CheckOptions) {
  try {
    // Determine which diff to capture
    let diffText: string;
    
    if (options.staged) {
      diffText = execSync('git diff --staged', { encoding: 'utf-8' });
    } else if (options.base) {
      diffText = execSync(`git diff ${options.base}`, { encoding: 'utf-8' });
    } else if (options.head) {
      diffText = execSync('git diff HEAD', { encoding: 'utf-8' });
    } else {
      // Default: check staged, fallback to HEAD
      try {
        diffText = execSync('git diff --staged', { encoding: 'utf-8' });
      } catch {
        diffText = execSync('git diff HEAD', { encoding: 'utf-8' });
      }
    }

    if (!diffText.trim()) {
      console.log('✓ No changes detected');
      process.exit(0);
    }

    // Try online mode if requested
    if (options.online) {
      try {
        const config = loadConfig();
        const client = new ApiClient(config);
        const projectId = config.projectId;
        
        console.log('🌐 Sending diff to Neurcode API...');
        const apiResult = await client.analyzeDiff(diffText, projectId);
        
        // Display results from API
        displayResults(apiResult.summary, {
          decision: apiResult.decision,
          violations: apiResult.violations
        }, apiResult.logId);
        
        // Exit with appropriate code
        if (apiResult.decision === 'block') {
          process.exit(2);
        } else if (apiResult.decision === 'warn') {
          process.exit(1);
        } else {
          process.exit(0);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error('❌ Online mode failed:', error.message);
        } else {
          console.error('❌ Online mode failed:', error);
        }
        console.log('⚠️  Falling back to local mode...\n');
        // Fall through to local mode
      }
    }

    // Local mode (default or fallback)
    // Parse the diff
    const diffFiles = parseDiff(diffText);
    
    if (diffFiles.length === 0) {
      console.log('✓ No file changes detected');
      process.exit(0);
    }

    // Get summary
    const summary = getDiffSummary(diffFiles);
    
    // Evaluate rules
    const result = evaluateRules(diffFiles);
    
    // Display results
    displayResults(summary, result);

    // Exit with appropriate code
    if (result.decision === 'block') {
      process.exit(2);
    } else if (result.decision === 'warn') {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Error:', error.message);
      
      // Check if it's a git error
      if (error.message.includes('not a git repository')) {
        console.error('   This command must be run in a git repository');
      }
    } else {
      console.error('❌ Unknown error:', error);
    }
    process.exit(1);
  }
}

/**
 * Display analysis results
 */
function displayResults(
  summary: { totalFiles: number; totalAdded: number; totalRemoved: number; files: Array<{ path: string; changeType: string; added: number; removed: number }> },
  result: { decision: Decision; violations: Array<{ rule: string; file: string; severity: string; message?: string }> },
  logId?: string
) {
  // Print results
  console.log('\n📊 Diff Analysis Summary');
  if (logId) {
    console.log(`Log ID: ${logId}`);
  }
  console.log('─'.repeat(50));
  console.log(`Files changed: ${summary.totalFiles}`);
  console.log(`Lines added: ${summary.totalAdded}`);
  console.log(`Lines removed: ${summary.totalRemoved}`);
  console.log(`Net change: ${summary.totalAdded - summary.totalRemoved > 0 ? '+' : ''}${summary.totalAdded - summary.totalRemoved}`);

  // Print file list
  console.log('\n📁 Changed Files:');
  summary.files.forEach(file => {
    const changeIcon = file.changeType === 'add' ? '➕' : 
                      file.changeType === 'delete' ? '➖' : 
                      file.changeType === 'rename' ? '🔄' : '✏️';
    console.log(`  ${changeIcon} ${file.path} (${file.changeType})`);
  });

  // Print rule violations
  if (result.violations.length > 0) {
    console.log('\n⚠️  Rule Violations:');
    result.violations.forEach(violation => {
      const severityIcon = violation.severity === 'block' ? '🚫' : '⚠️';
      console.log(`  ${severityIcon} [${violation.severity.toUpperCase()}] ${violation.rule}`);
      console.log(`     File: ${violation.file}`);
      if (violation.message) {
        console.log(`     ${violation.message}`);
      }
    });
  } else {
    console.log('\n✓ No rule violations detected');
  }

  // Print decision
  console.log('\n' + '─'.repeat(50));
  const decisionIcon = result.decision === 'allow' ? '✓' : 
                       result.decision === 'warn' ? '⚠️' : '🚫';
  console.log(`Decision: ${decisionIcon} ${result.decision.toUpperCase()}`);
}

