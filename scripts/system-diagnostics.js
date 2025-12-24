#!/usr/bin/env node
/**
 * SystemDiagnostics CLI
 *
 * Health gate for deployments. Runs critical checks and returns:
 * - Exit 0: All checks PASS (safe to deploy)
 * - Exit 1: CRITICAL failures found (block deploy)
 * - Exit 2: WARNINGS found (deploy with caution)
 *
 * Usage:
 *   node scripts/system-diagnostics.js [--json] [--strict]
 *
 * Flags:
 *   --json    Output results as JSON
 *   --strict  Treat warnings as failures
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const CHECKS = {
  critical: [
    {
      name: 'Backend Type Check',
      command: 'cd backend && npx tsc --noEmit',
      timeout: 60000
    },
    {
      name: 'Frontend Type Check',
      command: 'cd frontend && npx tsc --noEmit',
      timeout: 60000
    },
    {
      name: 'Backend Build',
      command: 'cd backend && npm run build',
      timeout: 60000
    },
    {
      name: 'Frontend Build',
      command: 'cd frontend && npm run build',
      timeout: 120000
    },
    {
      name: 'Telemetry Guardrails',
      command: 'node scripts/validate-uimap.js',
      timeout: 30000
    }
  ],
  warning: [
    {
      name: 'Security Audit (Root)',
      command: 'npm audit --audit-level=high',
      timeout: 30000
    },
    {
      name: 'Security Audit (Backend)',
      command: 'cd backend && npm audit --audit-level=high',
      timeout: 30000
    },
    {
      name: 'Security Audit (Frontend)',
      command: 'cd frontend && npm audit --audit-level=high',
      timeout: 30000
    }
  ],
  info: [
    {
      name: 'Git Status',
      command: 'git status --short',
      timeout: 5000,
      parser: (output) => {
        const lines = output.trim().split('\n').filter(l => l.trim());
        return lines.length > 0 ? `${lines.length} uncommitted changes` : 'Clean';
      }
    },
    {
      name: 'Last Commit',
      command: 'git log -1 --format="%h %s"',
      timeout: 5000
    }
  ]
};

// ============================================
// UTILITIES
// ============================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  if (!args.json) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

function runCheck(check) {
  const start = Date.now();
  try {
    const output = execSync(check.command, {
      timeout: check.timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const duration = Date.now() - start;
    const result = check.parser ? check.parser(output) : 'PASS';

    return {
      name: check.name,
      status: 'pass',
      duration,
      output: result
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name: check.name,
      status: 'fail',
      duration,
      error: error.message?.substring(0, 200) || 'Unknown error'
    };
  }
}

// ============================================
// MAIN
// ============================================

const args = {
  json: process.argv.includes('--json'),
  strict: process.argv.includes('--strict')
};

async function main() {
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    critical: [],
    warning: [],
    info: [],
    summary: {
      criticalPassed: 0,
      criticalFailed: 0,
      warningPassed: 0,
      warningFailed: 0
    }
  };

  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║           SYSTEM DIAGNOSTICS - Health Gate                   ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan');

  // Run Critical Checks
  log('━━━ CRITICAL CHECKS ━━━', 'red');
  for (const check of CHECKS.critical) {
    log(`  Running: ${check.name}...`, 'dim');
    const result = runCheck(check);
    results.critical.push(result);

    if (result.status === 'pass') {
      results.summary.criticalPassed++;
      log(`  ✅ ${check.name} (${result.duration}ms)`, 'green');
    } else {
      results.summary.criticalFailed++;
      log(`  ❌ ${check.name} - FAILED`, 'red');
      log(`     ${result.error}`, 'dim');
    }
  }

  // Run Warning Checks
  log('\n━━━ WARNING CHECKS ━━━', 'yellow');
  for (const check of CHECKS.warning) {
    log(`  Running: ${check.name}...`, 'dim');
    const result = runCheck(check);
    results.warning.push(result);

    if (result.status === 'pass') {
      results.summary.warningPassed++;
      log(`  ✅ ${check.name} (${result.duration}ms)`, 'green');
    } else {
      results.summary.warningFailed++;
      log(`  ⚠️  ${check.name} - WARNING`, 'yellow');
    }
  }

  // Run Info Checks
  log('\n━━━ INFO ━━━', 'blue');
  for (const check of CHECKS.info) {
    const result = runCheck(check);
    results.info.push(result);
    log(`  📋 ${check.name}: ${result.output || result.error}`, 'dim');
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  results.totalDuration = totalDuration;

  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                        SUMMARY                               ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝', 'cyan');

  log(`  Critical: ${results.summary.criticalPassed}/${CHECKS.critical.length} passed`,
      results.summary.criticalFailed > 0 ? 'red' : 'green');
  log(`  Warnings: ${results.summary.warningPassed}/${CHECKS.warning.length} passed`,
      results.summary.warningFailed > 0 ? 'yellow' : 'green');
  log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`, 'dim');

  // Determine exit code
  let exitCode = 0;
  let verdict = 'PASS';

  if (results.summary.criticalFailed > 0) {
    exitCode = 1;
    verdict = 'CRITICAL';
    log('\n  🚫 VERDICT: CRITICAL - Deploy BLOCKED', 'red');
  } else if (results.summary.warningFailed > 0) {
    if (args.strict) {
      exitCode = 1;
      verdict = 'FAIL (strict mode)';
      log('\n  ⚠️  VERDICT: FAIL (strict mode) - Deploy BLOCKED', 'yellow');
    } else {
      exitCode = 0;
      verdict = 'PASS with warnings';
      log('\n  ⚠️  VERDICT: PASS with warnings - Deploy OK', 'yellow');
    }
  } else {
    log('\n  ✅ VERDICT: ALL CLEAR - Safe to deploy', 'green');
  }

  results.verdict = verdict;
  results.exitCode = exitCode;

  // JSON output
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  }

  log('', 'reset');
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Diagnostics failed:', err);
  process.exit(1);
});
