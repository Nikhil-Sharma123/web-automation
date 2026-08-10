const path = require('path');

const c = {
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  reset:  '\x1b[0m',
};

const W = 76;

const B_PASS_TOP  = () => `${c.green}${'━'.repeat(W)}${c.reset}`;
const B_PASS_BOT  = () => `${c.dim}${'─'.repeat(W)}${c.reset}`;
const B_FAIL_TOP  = () => `${c.red}${c.bold}${'═'.repeat(W)}${c.reset}`;
const B_FAIL_BOT  = () => `${c.red}${c.bold}${'═'.repeat(W)}${c.reset}`;
const B_SKIP_TOP  = () => `${c.yellow}${'╌'.repeat(W)}${c.reset}`;
const B_SKIP_BOT  = () => `${c.dim}${'╌'.repeat(W)}${c.reset}`;
const B_INNER     = () => `  ${c.dim}${'┄'.repeat(W - 2)}${c.reset}`;

function summaryBox(label, color) {
  const line = '━'.repeat(W);
  return `${color}${c.bold}┏${line}┓\n┃  ${label.padEnd(W - 2)}┃\n┗${line}┛${c.reset}`;
}

// A failed step whose name matches one of these is treated as blocking the
// whole flow (auth/session gates) rather than a single broken feature —
// weighted as CRITICAL in the health score, same spirit as the reference
// QA report's "2 Critical" bugs dragging the score well below the raw pass rate.
const CRITICAL_NAME_PATTERN = /login|auth|session/i;

class UiPassFailReporter {
  constructor() {
    this.testCounts  = { total: 0, passed: 0, failed: 0, skipped: 0 };
    this.failedTests = [];
    // Per-test count of top-level test.step() calls seen live via onStepEnd —
    // lets onTestEnd fall back to printing the whole test only when it had none.
    this._stepCounts = new Map();

    // Full step ("module") list across the run, used to build the QA-style
    // report in onEnd() — collected from result.steps rather than piecemeal
    // from onStepEnd so passed/skipped modules are available too, not just failures.
    this.allModules = [];
    this.suiteName  = null;
    this.envUrl     = process.env.BASE_URL || 'app.mondofi.co';
  }

  // Relay everything the test itself writes to console.log/console.error —
  // Playwright only forwards a test's captured stdout to a reporter that asks for
  // it via onStdOut/onStdErr. Without this, any diagnostics the test prints
  // directly (e.g. this repo's own printErrorBlock() failure details) are
  // silently swallowed and never appear anywhere, making failures hard to debug.
  onStdOut(chunk) {
    process.stdout.write(chunk);
  }
  onStdErr(chunk) {
    process.stderr.write(chunk);
  }

  // Fires the instant a top-level test.step() STARTS — gives live feedback
  // during long-running steps (e.g. headed mode), instead of only seeing
  // results in one dump after the whole test finishes.
  onStepBegin(test, result, step) {
    if (step.category !== 'test.step' || step.parent) return;
    console.log(`  ${c.cyan}▶ RUNNING${c.reset}  ${c.dim}${step.title}...${c.reset}`);
  }

  // Fires the instant a top-level test.step() FINISHES — prints its PASS/FAIL
  // box immediately, so results stream to the console step-by-step in real
  // time rather than appearing all at once when the whole test completes.
  onStepEnd(test, result, step) {
    if (step.category !== 'test.step' || step.parent) return;
    this._stepCounts.set(test, (this._stepCounts.get(test) || 0) + 1);
    const status = step.error ? 'failed' : (step.status || 'passed');
    this._printTest(step.title, status, step.duration, step.error);
  }

  onTestEnd(test, result) {
    const hadSteps = (this._stepCounts.get(test) || 0) > 0;
    this._stepCounts.delete(test);

    if (!hadSteps) {
      // No named steps were streamed via onStepEnd — treat the whole test as one entry
      this._printTest(this._shortTitle(test), result.status, result.duration, result.error);
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      // Every individual test.step() can report "passed" to Playwright while the
      // overall test still fails — e.g. a non-critical step swallows its own error
      // internally (logged to the script's own results array, not rethrown) and the
      // test only surfaces it as a final throw after all steps finished. Without this,
      // that failure would silently vanish from the summary — 100% steps passed, but
      // the test itself failed. Surface it as its own entry so it's counted.
      this._printTest(`${this._shortTitle(test)}  (overall test result)`, result.status, result.duration, result.error);
    }

    if (!this.suiteName) {
      this.suiteName = test.parent?.title || this._titleFromFile(test.location?.file) || 'UI Test';
    }

    // Walk the full step tree for the QA report below — mirrors the HTML
    // reporter's approach so the console gets the same module-level detail
    // (including passed/skipped entries, which onStepEnd doesn't retain here).
    const modules = [];
    const collect = (steps) => {
      for (const s of steps || []) {
        if (s.category === 'test.step') {
          const st = s.status || (s.error ? 'failed' : 'passed');
          modules.push({
            name:   s.title || 'Step',
            status: st === 'passed' ? 'PASS' : st === 'skipped' ? 'SKIP' : 'FAIL',
            dur:    s.duration || 0,
            error:  s.error ? this._errLine(s.error) : '',
          });
        } else {
          collect(s.steps || []);
        }
      }
    };
    collect(result.steps || []);

    if ((result.status === 'failed' || result.status === 'timedOut') && !modules.some(m => m.status === 'FAIL')) {
      modules.push({
        name:   `${test.title} (overall test result)`,
        status: 'FAIL',
        dur:    result.duration || 0,
        error:  result.error ? this._errLine(result.error) : '',
      });
    }

    this.allModules.push(...modules);
  }

  _printTest(title, status, durationMs, error) {
    this.testCounts.total += 1;
    const n      = this.testCounts.total;
    const numStr = `${c.dim}[${String(n).padStart(3)}]${c.reset}`;
    const dur    = this._fmt(durationMs);

    const isPass = status === 'passed';
    const isFail = status === 'failed' || status === 'timedOut' || !!error;
    const isSkip = !isPass && !isFail;

    if (isPass) {
      this.testCounts.passed += 1;
      console.log('\n' + B_PASS_TOP());
      console.log(`  ${c.green}${c.bold}✓ PASS${c.reset}  ${numStr}  ${c.bold}${title}${c.reset}  ${c.dim}${dur}${c.reset}`);
      console.log(B_PASS_BOT());

    } else if (isFail) {
      this.testCounts.failed += 1;
      const errLine = this._errLine(error);
      console.log('\n' + B_FAIL_TOP());
      console.log(`  ${c.red}${c.bold}✗ FAIL${c.reset}  ${numStr}  ${c.red}${c.bold}${title}${c.reset}  ${c.dim}${dur}${c.reset}`);
      console.log(B_INNER());
      console.log(`    ${c.red}${c.bold}✖  Error :${c.reset}  ${c.red}${errLine}${c.reset}`);
      console.log(`    ${c.dim}⏱  Duration : ${dur}${c.reset}`);
      console.log(B_FAIL_BOT());
      this.failedTests.push({ num: n, title, error: errLine });

    } else {
      this.testCounts.skipped += 1;
      console.log('\n' + B_SKIP_TOP());
      console.log(`  ${c.yellow}${c.bold}– SKIP${c.reset}  ${numStr}  ${c.dim}${title}${c.reset}`);
      console.log(B_SKIP_BOT());
    }
  }

  onEnd() {
    this._printQaReport();

    const { total, passed, failed, skipped } = this.testCounts;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    console.log('\n\n');
    console.log(summaryBox('UI TEST RUN  ─  FINAL SUMMARY', failed > 0 ? c.red : c.green));
    console.log('');
    console.log(
      `  ${c.dim}Tests ${c.reset}  ${c.bold}${String(total).padEnd(6)}${c.reset}`
      + `  ${c.green}${c.bold}✓ Passed  ${String(passed).padEnd(6)}${c.reset}`
      + `  ${c.red}${c.bold}✗ Failed  ${String(failed).padEnd(6)}${c.reset}`
      + `  ${c.yellow}– Skipped  ${String(skipped).padEnd(6)}${c.reset}`
      + `  ${c.bold}Pass Rate  ${passRate}%${c.reset}`
    );

    if (this.failedTests.length > 0) {
      console.log('');
      console.log(`  ${c.red}${c.bold}✗  FAILED STEPS  (${this.failedTests.length} / ${total})${c.reset}`);
      console.log(`  ${c.dim}${'─'.repeat(W - 2)}${c.reset}`);
      this.failedTests.forEach(({ num, title, error }, i) => {
        console.log(
          `  ${c.bold}${String(i + 1).padStart(2)}.${c.reset}  `
          + `${c.dim}[${num}]${c.reset}  ${c.red}${c.bold}${title}${c.reset}`
        );
        console.log(`         ${c.red}${c.dim}↳  ${error}${c.reset}`);
      });
    } else {
      console.log('');
      console.log(`  ${c.green}${c.bold}✔  All ${total} steps passed!${c.reset}`);
    }

    console.log('');
    console.log(`${c.dim}${'━'.repeat(W)}${c.reset}\n`);
  }

  // ─── QA-style report ────────────────────────────────────────────────────
  // Modeled on the reference "Mondofi QA Report" format: health score,
  // executive summary, module status overview table, and a prioritized
  // findings list — built from the same step ("module") data the live
  // PASS/FAIL boxes above already streamed, just reassembled as a report.

  _printQaReport() {
    const modules = this.allModules;
    if (modules.length === 0) return; // nothing step-based ran — skip the QA report

    const total    = modules.length;
    const passed   = modules.filter(m => m.status === 'PASS').length;
    const failedM  = modules.filter(m => m.status === 'FAIL');
    const skipped  = modules.filter(m => m.status === 'SKIP').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    const critical = failedM.filter(m => CRITICAL_NAME_PATTERN.test(m.name));
    const high     = failedM.filter(m => !CRITICAL_NAME_PATTERN.test(m.name));
    const healthScore = Math.max(0, Math.min(100,
      Math.round(passRate) - critical.length * 15 - high.length * 5
    ));

    const scoreColor = healthScore >= 90 ? c.green : healthScore >= 70 ? c.yellow : c.red;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });

    console.log('\n');
    console.log(`${c.bold}${'═'.repeat(W)}${c.reset}`);
    console.log(`  ${c.bold}Mondofi QA Report  ·  ${this.suiteName || 'UI Test'}${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(W)}${c.reset}`);
    console.log(`  ${c.dim}Test Date${c.reset}      ${dateStr}`);
    console.log(`  ${c.dim}Platform URL${c.reset}   ${this.envUrl}`);
    console.log(`  ${c.dim}Health Score${c.reset}   ${scoreColor}${c.bold}${healthScore} / 100${c.reset}`);
    console.log(`${c.bold}${'═'.repeat(W)}${c.reset}`);

    console.log(`\n  ${c.bold}Executive Summary${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(W - 2)}${c.reset}`);
    console.log(
      `  ${total} step(s) executed  ·  ${c.green}${passed} passed${c.reset}  ·  `
      + `${c.red}${failedM.length} failed${c.reset}  ·  ${c.yellow}${skipped} skipped${c.reset}`
    );
    console.log(
      `  ${c.red}${c.bold}${critical.length} Critical${c.reset}   `
      + `${c.yellow}${c.bold}${high.length} High${c.reset}   `
      + `${c.green}${c.bold}${passed} Passed${c.reset}`
    );

    console.log(`\n  ${c.bold}Module Status Overview${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(W - 2)}${c.reset}`);
    modules.forEach(m => {
      const badge = m.status === 'PASS'
        ? `${c.green}${c.bold}PASS${c.reset}`
        : m.status === 'FAIL'
          ? `${c.red}${c.bold}FAIL${c.reset}`
          : `${c.yellow}${c.bold}SKIP${c.reset}`;
      const name = m.name.length > 46 ? m.name.slice(0, 45) + '…' : m.name;
      console.log(`  ${name.padEnd(48)}  ${badge.padEnd(20)}  ${c.dim}${this._fmt(m.dur)}${c.reset}`);
    });
    console.log(`  ${c.dim}${'─'.repeat(W - 2)}${c.reset}`);

    console.log(`\n  ${c.bold}All Findings — Prioritized${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(W - 2)}${c.reset}`);
    const ranked = [...critical, ...high];
    if (ranked.length === 0) {
      console.log(`  ${c.green}${c.bold}✔  No findings — every module passed${c.reset}`);
    } else {
      ranked.forEach((m, i) => {
        const isCritical = CRITICAL_NAME_PATTERN.test(m.name);
        const sevTag = isCritical ? `${c.red}${c.bold}[CRITICAL]${c.reset}` : `${c.yellow}${c.bold}[HIGH]${c.reset}`;
        console.log(`  ${c.bold}F-${String(i + 1).padStart(3, '0')}${c.reset}  ${sevTag}  ${c.bold}${m.name}${c.reset}`);
        if (m.error) console.log(`         ${c.dim}↳  ${m.error}${c.reset}`);
      });
    }
    console.log(`  ${c.dim}${'─'.repeat(W - 2)}${c.reset}`);
  }

  _errLine(error) {
    if (!error) return 'Unknown error';
    const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const msg = stripAnsi(error.message || '');
    return msg.split('\n').find(l => l.trim()) || msg || 'Unknown error';
  }

  _titleFromFile(file) {
    if (!file) return '';
    return path.basename(file).replace(/\.spec\.js$/i, '');
  }

  _shortTitle(test) {
    const parts = [];
    let cur = test;
    while (cur) {
      if (cur.title) parts.unshift(cur.title);
      cur = cur.parent;
    }
    return parts
      .filter(p =>
        p &&
        !p.endsWith('.spec.js') &&
        !p.endsWith('.js') &&
        !p.includes('/') &&
        !p.includes('\\') &&
        p !== 'tests'
      )
      .join(' › ');
  }

  _fmt(ms) {
    if (ms == null || ms < 0) return '—';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  }
}

module.exports = UiPassFailReporter;
