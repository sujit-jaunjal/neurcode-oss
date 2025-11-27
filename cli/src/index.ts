#!/usr/bin/env node

import { Command } from 'commander';
import { checkCommand } from './commands/check';

const program = new Command();

program
  .name('neurcode')
  .description('AI-powered code governance and diff analysis')
  .version('0.1.0');

program
  .command('check')
  .description('Analyze git diff for risky changes')
  .option('--staged', 'Check staged changes (git diff --staged)')
  .option('--head', 'Check changes against HEAD (git diff HEAD)')
  .option('--base <ref>', 'Check changes against a specific base ref')
  .option('--online', 'Send diff to Neurcode API for analysis')
  .action(checkCommand);

program.parse();

