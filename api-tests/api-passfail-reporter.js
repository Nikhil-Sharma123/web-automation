const path = require('path');

const c = {
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  reset:   '\x1b[0m',
};

// Distinct colour per HTTP method — makes GET vs POST (vs others) visually obvious in step lines
function methodColor(method) {
  switch (method) {
    case 'GET':    return c.cyan;
    case 'POST':   return c.magenta;
    case 'PUT':    return c.yellow;
    case 'PATCH':  return c.yellow;
    case 'DELETE': return c.red;
    default:       return c.dim;
  }
}

const W = 76;

// Border styles
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

class ApiPassFailReporter {
  constructor() {
    this.testCounts   = { total: 0, passed: 0, failed: 0, skipped: 0 };
    this.stepCounts   = { total: 0, passed: 0, failed: 0 };
    this.methodCounts = {}; // e.g. { GET: { total, passed, failed }, POST: { ... } }
    this.failedTests  = [];
  }

  onTestEnd(test, result) {
    // Registered top-level (Playwright has no working per-project reporter option),
    // so this fires for every project's tests — only handle specs living alongside
    // this file (api-tests/*.spec.js), not the UI specs under tests/.
    if (path.dirname(test.location?.file || '') !== __dirname) return;

    this.testCounts.total += 1;
    const n = this.testCounts.total;

    const isFail = result.status === 'failed';
    const isPass = result.status === 'passed';
    const isSkip = result.status === 'skipped';

    if (isPass)      this.testCounts.passed  += 1;
    else if (isFail) this.testCounts.failed  += 1;
    else if (isSkip) this.testCounts.skipped += 1;

    const sc = this._countSteps(result.steps || []);
    this.stepCounts.total  += sc.total;
    this.stepCounts.passed += sc.passed;
    this.stepCounts.failed += isFail ? Math.max(sc.failed, 1) : sc.failed;

    const methodSc = this._countStepsByMethod(result.steps || []);
    for (const [method, counts] of Object.entries(methodSc)) {
      const bucket = this.methodCounts[method] || (this.methodCounts[method] = { total: 0, passed: 0, failed: 0 });
      bucket.total  += counts.total;
      bucket.passed += counts.passed;
      bucket.failed += isFail ? Math.max(counts.failed, 1) : counts.failed;
    }

    const title    = this._shortTitle(test);
    const dur      = this._fmt(result.duration);
    const numStr   = `${c.dim}[${String(n).padStart(3)}]${c.reset}`;
    const stepLines = this._renderSteps(result.steps || []);

    if (isPass) {
      // ────────────────── PASS block ──────────────────────────────────────
      console.log('\n' + B_PASS_TOP());
      console.log(`  ${c.green}${c.bold}✓ PASS${c.reset}  ${numStr}  ${c.bold}${title}${c.reset}`);
      console.log(B_INNER());
      if (stepLines.length > 0) {
        stepLines.forEach(l => console.log(l));
      } else {
        console.log(`    ${c.dim}(no named steps)  ${dur}${c.reset}`);
      }
      console.log(B_PASS_BOT());

    } else if (isFail) {
      // ────────────────── FAIL block ──────────────────────────────────────
      const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const msg       = stripAnsi(result.error?.message || '');
      const errLine   = msg.split('\n').find(l => l.trim()) || msg;

      console.log('\n' + B_FAIL_TOP());
      console.log(`  ${c.red}${c.bold}✗ FAIL${c.reset}  ${numStr}  ${c.red}${c.bold}${title}${c.reset}`);
      console.log(B_INNER());

      // Steps section
      if (stepLines.length > 0) {
        stepLines.forEach(l => console.log(l));
      } else {
        console.log(`    ${c.dim}(no named steps)${c.reset}`);
      }

      // Error section
      console.log(B_INNER());
      console.log(`    ${c.red}${c.bold}✖  Error :${c.reset}  ${c.red}${errLine.trim()}${c.reset}`);
      console.log(`    ${c.dim}⏱  Duration : ${dur}${c.reset}`);
      console.log(B_FAIL_BOT());

      this.failedTests.push({ num: n, title, error: errLine.trim() });

    } else {
      // ────────────────── SKIP block ──────────────────────────────────────
      console.log('\n' + B_SKIP_TOP());
      console.log(`  ${c.yellow}${c.bold}– SKIP${c.reset}  ${numStr}  ${c.dim}${title}${c.reset}`);
      console.log(B_SKIP_BOT());
    }
  }

  onEnd() {
    if (this.testCounts.total === 0) return; // no api-tests ran this invocation

    const { total, passed, failed, skipped } = this.testCounts;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    console.log('\n\n');
    console.log(summaryBox('API TEST RUN  ─  FINAL SUMMARY', failed > 0 ? c.red : c.green));
    console.log('');
    console.log(
      `  ${c.dim}Tests ${c.reset}  ${c.bold}${String(total).padEnd(6)}${c.reset}`
      + `  ${c.green}${c.bold}✓ Passed  ${String(passed).padEnd(6)}${c.reset}`
      + `  ${c.red}${c.bold}✗ Failed  ${String(failed).padEnd(6)}${c.reset}`
      + `  ${c.yellow}– Skipped  ${skipped}${c.reset}`
    );
    console.log(
      `  ${c.dim}Steps ${c.reset}  ${c.bold}${String(this.stepCounts.total).padEnd(6)}${c.reset}`
      + `  ${c.green}✓ Passed  ${String(this.stepCounts.passed).padEnd(6)}${c.reset}`
      + `  ${c.red}${c.bold}✗ Failed  ${String(this.stepCounts.failed).padEnd(6)}${c.reset}`
      + `  ${c.bold}Pass Rate  ${passRate}%${c.reset}`
    );

    const methods = Object.keys(this.methodCounts).sort();
    if (methods.length > 0) {
      console.log('');
      console.log(`  ${c.dim}By HTTP Method${c.reset}`);
      methods.forEach(method => {
        const mc = this.methodCounts[method];
        console.log(
          `    ${methodColor(method)}${c.bold}${method.padEnd(6)}${c.reset}`
          + `  ${c.dim}Total${c.reset} ${String(mc.total).padEnd(5)}`
          + `  ${c.green}✓ ${String(mc.passed).padEnd(5)}${c.reset}`
          + `  ${c.red}✗ ${String(mc.failed).padEnd(5)}${c.reset}`
        );
      });
    }

    if (this.failedTests.length > 0) {
      console.log('');
      console.log(`  ${c.red}${c.bold}✗  FAILED TESTS  (${this.failedTests.length} / ${total})${c.reset}`);
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
      console.log(`  ${c.green}${c.bold}✔  All ${total} tests passed!${c.reset}`);
    }

    console.log('');
    console.log(`${c.dim}${'━'.repeat(W)}${c.reset}\n`);
  }

  // ── Stdout rendering ─────────────────────────────────────────────────────

  _renderStdout(stdout) {
    const lines = [];
    for (const entry of stdout) {
      const text = typeof entry === 'string' ? entry : (entry.text || '');
      text.split('\n').forEach(line => {
        if (line.trim()) {
          lines.push(`    ${c.cyan}${line}${c.reset}`);
        }
      });
    }
    return lines;
  }

  // ── Step rendering ────────────────────────────────────────────────────────

  _renderSteps(steps) {
    const lines = [];
    this._walkSteps(steps, 0, lines);
    return lines;
  }

  _walkSteps(list, level, lines) {
    let stepNum = 0;
    for (const s of list || []) {
      // Only render named test.step() blocks — skip pw:api / fixture internals
      if (s.category !== 'test.step') continue;

      stepNum += 1;
      const pad  = '    ' + '  '.repeat(level);
      const st   = s.status || (s.error ? 'failed' : 'passed');
      const icon = st === 'passed' ? `${c.green}✓${c.reset}`
                 : st === 'failed' ? `${c.red}✗${c.reset}`
                 :                   `${c.yellow}~${c.reset}`;

      let title = (s.title || 'step').replace(/\s+/g, ' ').trim();
      const dur   = s.duration != null
          ? `  ${c.dim}${this._fmt(s.duration)}${c.reset}`
          : '';

      // Colour-code the HTTP method (GET/POST/...) inline within "API Call: METHOD /path" titles
      const methodMatch = title.match(/^(API Call: )(GET|POST|PUT|PATCH|DELETE)\b(.*)$/);
      if (methodMatch) {
        const [, prefix, method, rest] = methodMatch;
        title = `${prefix}${methodColor(method)}${c.bold}${method}${c.reset}${rest}`;
      }

      // Step number tag
      const tag = `${c.dim}Step ${stepNum}${c.reset}`;

      lines.push(`${pad}${icon}  ${tag}  ${title}${dur}`);

      // If the step itself failed, show its error inline
      if (s.error) {
        const m = String(s.error.message || '')
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .split('\n')[0];
        lines.push(`${pad}      ${c.red}↳ ${m}${c.reset}`);
      }

      // Recurse into nested test.step children
      const childSteps = (s.steps || []).filter(ch => ch.category === 'test.step');
      if (childSteps.length > 0) {
        this._walkSteps(childSteps, level + 1, lines);
      }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

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
        p !== 'api-tests'
      )
      .join(' › ');
  }

  _fmt(ms) {
    if (ms == null || ms < 0) return '—';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  }

  _countSteps(steps) {
    const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
    for (const s of steps) {
      if (s.category === 'test.step') {
        counts.total += 1;
        const st = s.status || (s.error ? 'failed' : 'passed');
        if      (st === 'passed')  counts.passed  += 1;
        else if (st === 'failed')  counts.failed  += 1;
        else if (st === 'skipped') counts.skipped += 1;
      }
      if (Array.isArray(s.steps) && s.steps.length > 0) {
        const n = this._countSteps(s.steps);
        counts.total   += n.total;
        counts.passed  += n.passed;
        counts.failed  += n.failed;
        counts.skipped += n.skipped;
      }
    }
    return counts;
  }

  _countStepsByMethod(steps, acc = {}) {
    for (const s of steps || []) {
      if (s.category === 'test.step') {
        const m = (s.title || '').match(/^API Call: (GET|POST|PUT|PATCH|DELETE)\b/);
        if (m) {
          const method = m[1];
          const bucket = acc[method] || (acc[method] = { total: 0, passed: 0, failed: 0 });
          bucket.total += 1;
          const st = s.status || (s.error ? 'failed' : 'passed');
          if      (st === 'passed') bucket.passed += 1;
          else if (st === 'failed') bucket.failed += 1;
        }
      }
      if (Array.isArray(s.steps) && s.steps.length > 0) {
        this._countStepsByMethod(s.steps, acc);
      }
    }
    return acc;
  }
}

module.exports = ApiPassFailReporter;
