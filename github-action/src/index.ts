import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'child_process';
import { parseDiff, getDiffSummary, DiffFile } from '@neurcode/diff-parser';
import { evaluateRules as evaluateRulesBase, createDefaultPolicy, RuleViolation, Decision } from '@neurcode/policy-engine';

interface AnalysisResult {
  decision: Decision;
  violations: RuleViolation[];
  summary: {
    totalFiles: number;
    totalAdded: number;
    totalRemoved: number;
    files: Array<{
      path: string;
      changeType: string;
      added: number;
      removed: number;
    }>;
  };
  diffText: string;
}

/**
 * Get the diff for the PR
 */
function getPRDiff(): string {
  const context = github.context;
  
  if (context.eventName === 'pull_request') {
    // For PR events, get diff between base and head
    const baseRef = context.payload.pull_request?.base?.sha || 'HEAD';
    const headRef = context.payload.pull_request?.head?.sha || 'HEAD';
    
    try {
      return execSync(`git diff ${baseRef}...${headRef}`, { encoding: 'utf-8' });
    } catch (error) {
      core.warning(`Failed to get diff with git diff: ${error}`);
      // Fallback: try to get diff from GitHub API
      return '';
    }
  } else if (context.eventName === 'push') {
    // For push events, get diff of the commit
    const beforeSha = context.payload.before;
    const afterSha = context.payload.after;
    
    try {
      return execSync(`git diff ${beforeSha}...${afterSha}`, { encoding: 'utf-8' });
    } catch (error) {
      core.warning(`Failed to get diff: ${error}`);
      return '';
    }
  }
  
  // Default: get diff of last commit
  try {
    return execSync('git diff HEAD~1 HEAD', { encoding: 'utf-8' });
  } catch (error) {
    core.warning(`Failed to get diff: ${error}`);
    return '';
  }
}

/**
 * Analyze the diff using Neurcode
 */
function analyzeDiff(diffText: string): AnalysisResult | null {
  if (!diffText.trim()) {
    core.info('No changes detected');
    return null;
  }

  try {
    const diffFiles = parseDiff(diffText);
    
    if (diffFiles.length === 0) {
      core.info('No file changes detected');
      return null;
    }

    const summary = getDiffSummary(diffFiles);
    const defaultPolicy = createDefaultPolicy();
    const result = evaluateRulesBase(diffFiles, defaultPolicy.rules);

    return {
      decision: result.decision,
      violations: result.violations,
      summary,
      diffText
    };
  } catch (error) {
    core.setFailed(`Error analyzing diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Create PR annotations for violations
 */
async function annotatePR(violations: RuleViolation[], diffText: string): Promise<void> {
  const context = github.context;
  
  if (context.eventName !== 'pull_request') {
    return; // Only annotate PRs
  }

  const token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    core.warning('GITHUB_TOKEN not found, skipping annotations');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo, number } = context.issue;

  // Parse diff to get line numbers for violations
  const lines = diffText.split('\n');
  let currentFile = '';
  let lineOffset = 0;
  let currentLine = 0;

  for (const violation of violations) {
    // Find the file in the diff
    let violationLine = 0;
    let foundFile = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track current file
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+?)$/);
        if (match) {
          currentFile = match[1];
          lineOffset = i;
          foundFile = false;
        }
      }
      
      // Check if this is the file with the violation
      if (currentFile === violation.file) {
        foundFile = true;
        
        // Look for the violation pattern in added lines
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const content = line.substring(1);
          
          // Simple heuristic: check if violation message matches content
          if (violation.message && content.includes(violation.message.split(':')[0])) {
            violationLine = currentLine;
            break;
          }
        }
        
        if (line.match(/^@@/)) {
          // Hunk header - extract line number
          const match = line.match(/\+(\d+)/);
          if (match) {
            currentLine = parseInt(match[1], 10);
          }
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          currentLine++;
        }
      }
    }

    // Create annotation
    const annotationLevel = violation.severity === 'block' ? 'error' : 'warning';
    const annotationMessage = `[${violation.rule}] ${violation.message || 'Violation detected'}`;

    // Use GitHub's annotation format (works automatically in Actions)
    if (violation.severity === 'block') {
      core.error(`::error file=${violation.file}::${annotationMessage}`);
    } else {
      core.warning(`::warning file=${violation.file}::${annotationMessage}`);
    }
  }
}

/**
 * Add summary comment to PR
 */
async function addPRComment(result: AnalysisResult): Promise<void> {
  const context = github.context;
  
  if (context.eventName !== 'pull_request') {
    return; // Only comment on PRs
  }

  const addComment = core.getInput('add-comment') !== 'false';
  if (!addComment) {
    return;
  }

  const token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    core.warning('GITHUB_TOKEN not found, skipping PR comment');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo, number } = context.issue;

  const decisionIcon = result.decision === 'allow' ? '✅' : 
                       result.decision === 'warn' ? '⚠️' : '🚫';
  
  const statusColor = result.decision === 'allow' ? 'green' : 
                      result.decision === 'warn' ? 'yellow' : 'red';

  let comment = `## ${decisionIcon} Neurcode Analysis\n\n`;
  comment += `**Decision**: \`${result.decision.toUpperCase()}\`\n\n`;
  comment += `**Summary**:\n`;
  comment += `- Files changed: ${result.summary.totalFiles}\n`;
  comment += `- Lines added: ${result.summary.totalAdded}\n`;
  comment += `- Lines removed: ${result.summary.totalRemoved}\n`;
  comment += `- Net change: ${result.summary.totalAdded - result.summary.totalRemoved > 0 ? '+' : ''}${result.summary.totalAdded - result.summary.totalRemoved}\n\n`;

  if (result.violations.length > 0) {
    comment += `### ⚠️ Violations Found (${result.violations.length})\n\n`;
    
    const blockViolations = result.violations.filter(v => v.severity === 'block');
    const warnViolations = result.violations.filter(v => v.severity === 'warn');
    
    if (blockViolations.length > 0) {
      comment += `#### 🚫 Blocking Issues (${blockViolations.length})\n\n`;
      blockViolations.forEach(v => {
        comment += `- **${v.file}**: ${v.rule} - ${v.message || 'Violation detected'}\n`;
      });
      comment += '\n';
    }
    
    if (warnViolations.length > 0) {
      comment += `#### ⚠️ Warnings (${warnViolations.length})\n\n`;
      warnViolations.forEach(v => {
        comment += `- **${v.file}**: ${v.rule} - ${v.message || 'Violation detected'}\n`;
      });
      comment += '\n';
    }
  } else {
    comment += `### ✅ No violations detected\n\n`;
  }

  comment += `---\n`;
  comment += `*Powered by [Neurcode](https://github.com/sujit-jaunjal/neurcode)*`;

  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: comment
    });
  } catch (error) {
    core.warning(`Failed to create PR comment: ${error}`);
  }
}

/**
 * Create status check
 */
async function createStatusCheck(result: AnalysisResult): Promise<void> {
  const context = github.context;
  const token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    core.warning('GITHUB_TOKEN not found, skipping status check');
    return;
  }

  const octokit = github.getOctokit(token);

  const decision = result.decision;
  const failOnWarn = core.getInput('fail-on-warn') === 'true';
  
  let conclusion: 'success' | 'failure' | 'neutral' = 'success';
  let title = 'Neurcode Analysis Passed';
  
  if (decision === 'block') {
    conclusion = 'failure';
    title = 'Neurcode Analysis Failed - Blocking Issues Found';
  } else if (decision === 'warn' && failOnWarn) {
    conclusion = 'failure';
    title = 'Neurcode Analysis Failed - Warnings Found';
  } else if (decision === 'warn') {
    conclusion = 'neutral';
    title = 'Neurcode Analysis - Warnings Found';
  }

  const summary = `**Decision**: ${decision.toUpperCase()}\n\n`;
  const summaryText = `Files: ${result.summary.totalFiles} | Added: ${result.summary.totalAdded} | Removed: ${result.summary.totalRemoved}\n\n`;
  const violationsText = result.violations.length > 0 
    ? `**Violations**: ${result.violations.length}\n` 
    : '**Violations**: None ✅\n';

  try {
    await octokit.rest.checks.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: 'neurcode',
      head_sha: context.sha,
      status: 'completed',
      conclusion,
      output: {
        title,
        summary: summary + summaryText + violationsText
      }
    });
  } catch (error) {
    core.warning(`Failed to create status check: ${error}`);
  }
}

/**
 * Main action runner
 */
async function run(): Promise<void> {
  try {
    core.info('🔍 Starting Neurcode analysis...');

    // Get configuration
    const apiUrl = core.getInput('api-url');
    const apiKey = core.getInput('api-key');
    const projectId = core.getInput('project-id');

    // Set up environment for CLI if API is configured
    if (apiUrl) {
      process.env.NEURCODE_API_URL = apiUrl;
      if (apiKey) {
        process.env.NEURCODE_API_KEY = apiKey;
      }
      if (projectId) {
        process.env.NEURCODE_PROJECT_ID = projectId;
      }
    }

    // Get the diff
    core.info('📝 Getting diff...');
    const diffText = getPRDiff();

    if (!diffText.trim()) {
      core.info('✅ No changes to analyze');
      return;
    }

    // Analyze the diff
    core.info('🔎 Analyzing diff...');
    const result = analyzeDiff(diffText);

    if (!result) {
      core.info('✅ No analysis needed');
      return;
    }

    // Log summary
    core.info(`\n📊 Analysis Summary:`);
    core.info(`   Files changed: ${result.summary.totalFiles}`);
    core.info(`   Lines added: ${result.summary.totalAdded}`);
    core.info(`   Lines removed: ${result.summary.totalRemoved}`);
    core.info(`   Decision: ${result.decision.toUpperCase()}`);
    core.info(`   Violations: ${result.violations.length}`);

    // Annotate PR if enabled
    const annotate = core.getInput('annotate-pr') !== 'false';
    if (annotate && result.violations.length > 0) {
      core.info('📌 Creating PR annotations...');
      await annotatePR(result.violations, result.diffText);
    }

    // Add PR comment if enabled
    const context = github.context;
    if (context.eventName === 'pull_request') {
      core.info('💬 Adding PR comment...');
      await addPRComment(result);
    }

    // Create status check
    core.info('✅ Creating status check...');
    await createStatusCheck(result);

    // Set output
    core.setOutput('decision', result.decision);
    core.setOutput('violations-count', result.violations.length.toString());
    core.setOutput('files-changed', result.summary.totalFiles.toString());

    // Fail if needed
    const failOnWarn = core.getInput('fail-on-warn') === 'true';
    
    if (result.decision === 'block') {
      core.setFailed('🚫 Neurcode analysis failed: Blocking issues found');
    } else if (result.decision === 'warn' && failOnWarn) {
      core.setFailed('⚠️ Neurcode analysis failed: Warnings found (fail-on-warn enabled)');
    } else {
      core.info('✅ Neurcode analysis passed');
    }

  } catch (error) {
    core.setFailed(`❌ Neurcode action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Run the action
run();

