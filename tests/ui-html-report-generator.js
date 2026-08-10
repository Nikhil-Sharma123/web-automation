const fs   = require('fs');
const path = require('path');

// A failed step whose name matches one of these is treated as blocking the
// whole flow (auth/session gates) rather than a single broken feature —
// weighted as CRITICAL in the health score. Kept identical to the pattern
// used by ui-passfail-reporter.js so the console and HTML reports agree.
const CRITICAL_NAME_PATTERN = /login|auth|session/i;

// Styled after the reference "Mondofi Platform — Full QA Test Report" PDF:
// gradient header banner with meta chips, an executive-summary card with a
// health score, a module status overview list, and a prioritized findings
// list with severity badges — rather than the earlier dashboard/sidebar layout.
class UiHtmlReporter {
    constructor(options = {}) {
        this.outputFileOverride = options.outputFile; // optional fixed filename (pins every test to the same file)
        this.envUrl    = process.env.BASE_URL || '';
        this.testCredential = process.env.EMAIL || process.env.CARSHARE_EMAIL || process.env.USER_NAME || '';
    }

    // Writes a report the instant each test finishes, keyed by that test's own
    // suite/steps — so running the whole tests/ folder produces one report per
    // spec file instead of a single report merging every suite together.
    onTestEnd(test, result) {
        // This reporter is registered top-level, so Playwright calls it for every
        // project's tests — including api-tests, which has its own dedicated reporter
        // and a many-tests-per-describe shape that doesn't fit this one-test-per-report
        // model. Only handle specs that live alongside this file (tests/*.spec.js).
        const specDir = path.dirname(test.location?.file || '');
        if (specDir !== __dirname) return;

        const modules = [];

        // Walk the full step tree and collect every top-level test.step() as a "module" —
        // don't recurse into a step's own children so nested assertions stay out of the table.
        const collect = (steps) => {
            for (const s of steps || []) {
                if (s.category === 'test.step') {
                    const st = s.status || (s.error ? 'failed' : 'passed');
                    modules.push({
                        name:   s.title || 'Step',
                        status: st === 'passed' ? 'PASS' : st === 'skipped' ? 'SKIP' : 'FAIL',
                        dur:    s.duration || 0,
                        error:  s.error
                            ? String(s.error.message || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').split('\n')[0].trim()
                            : '',
                    });
                } else {
                    collect(s.steps || []);
                }
            }
        };
        collect(result.steps || []);

        // A non-critical test.step() can swallow its own error internally (logged to
        // a script's own results array, not rethrown) so Playwright sees it as
        // "passed" — the failure only surfaces as a final throw after all steps
        // finished, failing the overall test despite every individual step reporting
        // green. Without this, that failure would silently vanish from the report.
        if (result.status === 'failed' || result.status === 'timedOut') {
            const anyStepFailed = modules.some(m => m.status === 'FAIL');
            if (!anyStepFailed) {
                modules.push({
                    name:   `${test.title}  (overall test result)`,
                    status: 'FAIL',
                    dur:    result.duration || 0,
                    error:  result.error
                        ? String(result.error.message || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').split('\n')[0].trim()
                        : '',
                });
            }
        }

        if (modules.length === 0) return; // not a step-based UI test — nothing to report

        const suiteName = test.parent?.title || this._titleFromFile(test.location?.file) || 'UI Test';
        this._write({
            suiteName,
            testTitle: test.title,
            modules,
            startTime: result.startTime,
            durationMs: result.duration,
        });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _titleFromFile(file) {
        if (!file) return '';
        return path.basename(file).replace(/\.spec\.js$/i, '');
    }

    _slug(str) {
        return String(str || 'ui')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'ui';
    }

    _fmtMs(ms) {
        if (!ms || ms < 0) return '0ms';
        if (ms < 1000) return `${ms}ms`;
        const s = (ms / 1000).toFixed(2);
        return `${s}s`;
    }

    _fmtDuration(ms) {
        if (!ms || ms < 0) return '0s';
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
    }

    _e(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _write({ suiteName, testTitle, modules, startTime, durationMs }) {
        const total   = modules.length;
        const passed  = modules.filter(m => m.status === 'PASS').length;
        const failedMods = modules.filter(m => m.status === 'FAIL');
        const skipped = modules.filter(m => m.status === 'SKIP').length;
        const rate    = total > 0 ? ((passed / total) * 100) : 0;

        const critical = failedMods.filter(m => CRITICAL_NAME_PATTERN.test(m.name));
        const high     = failedMods.filter(m => !CRITICAL_NAME_PATTERN.test(m.name));
        const healthScore = Math.max(0, Math.min(100,
            Math.round(rate) - critical.length * 15 - high.length * 5
        ));

        const elapsed = this._fmtDuration(durationMs);
        const now     = startTime ? new Date(startTime) : new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
        const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
        const genStr  = now.toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

        const outputFile = path.resolve(
            process.cwd(),
            this.outputFileOverride || `${this._slug(suiteName)}-report.html`
        );

        const html = this._buildHtml({
            suiteName, testTitle, modules, total, passed, failedMods, skipped, rate, healthScore,
            critical, high, elapsed, dateStr, weekday, genStr,
        });

        fs.writeFileSync(outputFile, html, 'utf8');
        console.log(`\n\x1b[36m📊 ${suiteName} Report → ${outputFile}\x1b[0m`);
    }

    // ─── HTML ─────────────────────────────────────────────────────────────────

    _buildHtml({ suiteName: rawSuiteName, testTitle, modules, total, passed, failedMods, skipped,
                 rate, healthScore, critical, high, elapsed, dateStr, weekday, genStr }) {
        const suiteName = this._e(rawSuiteName || 'UI Test');
        const scoreColor = healthScore >= 90 ? '#16a34a' : healthScore >= 70 ? '#d97706' : '#dc2626';

        const summaryText = failedMods.length === 0
            ? `All ${total} modules in this suite passed. No failures detected in this run.`
            : `${passed} of ${total} modules passed. ${critical.length ? `${critical.length} critical (auth/session-blocking) ` : ''}` +
              `${critical.length && high.length ? 'and ' : ''}${high.length ? `${high.length} high-severity module failure(s) ` : ''}` +
              `were found in this run${skipped ? `, and ${skipped} module(s) were skipped as a result` : ''}.`;

        const statusPill = (status) => {
            const cls = status === 'PASS' ? 'pill-pass' : status === 'FAIL' ? 'pill-fail' : 'pill-skip';
            return `<span class="pill ${cls}">${status}</span>`;
        };

        const moduleRows = modules.map((m, i) => `
            <div class="mod-row ${i % 2 === 0 ? 're' : 'ro'}">
                <div class="mod-info">
                    <div class="mod-name">${this._e(m.name)}</div>
                    ${m.error ? `<div class="mod-sub">${this._e(m.error.slice(0, 140))}${m.error.length > 140 ? '…' : ''}</div>` : ''}
                </div>
                <div class="mod-dur">${this._fmtMs(m.dur)}</div>
                ${statusPill(m.status)}
            </div>`).join('');

        const ranked = [...critical, ...high];
        const findingCards = ranked.length === 0
            ? `<div class="no-find">✓ No findings — every module passed</div>`
            : ranked.map((m, i) => {
                const isCritical = CRITICAL_NAME_PATTERN.test(m.name);
                const sevLabel = isCritical ? 'CRITICAL' : 'HIGH';
                const sevClass = isCritical ? 'sev-critical' : 'sev-high';
                const barClass = isCritical ? 'bar-critical' : 'bar-high';
                return `
                <div class="finding ${barClass}">
                    <div class="finding-hdr">
                        <span class="finding-id">F-${String(i + 1).padStart(3, '0')}</span>
                        <span class="finding-title">${this._e(m.name)}</span>
                        <span class="sev-badge ${sevClass}">${sevLabel}</span>
                    </div>
                    ${m.error ? `<div class="finding-body">${this._e(m.error)}</div>` : ''}
                    <div class="finding-loc">↗ ${this._e(rawSuiteName || 'Suite')} › ${this._e(m.name)}</div>
                </div>`;
            }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${suiteName} QA Test Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f1f5f9;color:#1e293b;padding:32px 0}
.wrap{max-width:920px;margin:0 auto;padding:0 20px}

.header{background:linear-gradient(135deg,#7f1d1d,#b91c1c);border-radius:14px;padding:26px 30px;color:#fff;margin-bottom:22px}
.header h1{font-size:24px;font-weight:800;margin-bottom:4px}
.header .sub{font-size:13px;opacity:.9;margin-bottom:18px}
.chips{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.chip{background:rgba(255,255,255,.14);border-radius:10px;padding:10px 14px}
.chip-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;opacity:.75;margin-bottom:4px}
.chip-val{font-size:14px;font-weight:700}
.chip-sub{font-size:11px;opacity:.8;margin-top:1px}

.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:20px}
.exec{display:flex;gap:22px;align-items:flex-start}
.score-circle{flex-shrink:0;width:78px;height:78px;border-radius:50%;border:6px solid ${scoreColor};display:flex;align-items:center;justify-content:center;flex-direction:column}
.score-num{font-size:22px;font-weight:800;color:${scoreColor}}
.score-den{font-size:9px;color:#94a3b8}
.exec-body h2{font-size:15px;font-weight:700;margin-bottom:6px}
.exec-body p{font-size:13px;color:#475569;line-height:1.5;margin-bottom:12px}
.pills-row{display:flex;flex-wrap:wrap;gap:8px}
.badge{font-size:11px;font-weight:700;padding:4px 12px;border-radius:14px}
.b-critical{background:#fee2e2;color:#b91c1c}
.b-high{background:#ffedd5;color:#c2410c}
.b-pass{background:#dcfce7;color:#15803d}

.sec-title{font-size:15px;font-weight:700;margin:0 0 12px 4px}

.mod-list{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px}
.mod-row{display:flex;align-items:center;gap:14px;padding:12px 20px}
.mod-row.re{background:#fff}
.mod-row.ro{background:#f8fafc}
.mod-info{flex:1;min-width:0}
.mod-name{font-size:13px;font-weight:600;color:#1e293b}
.mod-sub{font-size:11px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mod-dur{font-size:11px;color:#94a3b8;font-family:Consolas,monospace;flex-shrink:0;width:60px;text-align:right}
.pill{font-size:10px;font-weight:700;padding:4px 12px;border-radius:12px;flex-shrink:0;width:52px;text-align:center}
.pill-pass{background:#dcfce7;color:#15803d}
.pill-fail{background:#fee2e2;color:#b91c1c}
.pill-skip{background:#f1f5f9;color:#64748b}

.finding{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #cbd5e1;border-radius:8px;padding:14px 18px;margin-bottom:12px}
.finding.bar-critical{border-left-color:#dc2626}
.finding.bar-high{border-left-color:#f97316}
.finding-hdr{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.finding-id{font-size:12px;font-weight:700;color:#94a3b8}
.finding-title{font-size:13px;font-weight:700;color:#1e293b;flex:1}
.sev-badge{font-size:9px;font-weight:800;padding:3px 9px;border-radius:10px;letter-spacing:.4px}
.sev-critical{background:#fee2e2;color:#b91c1c}
.sev-high{background:#ffedd5;color:#c2410c}
.finding-body{font-size:12px;color:#475569;font-family:Consolas,monospace;margin-bottom:6px;word-break:break-word}
.finding-loc{font-size:11px;color:#94a3b8}
.no-find{text-align:center;font-size:13px;color:#15803d;font-weight:600;padding:24px 0}

.footer{text-align:center;font-size:11px;color:#94a3b8;padding:18px 0}
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <h1>${suiteName} — QA Test Report</h1>
    <div class="sub">${this._e(testTitle || '')}</div>
    <div class="chips">
      <div class="chip">
        <div class="chip-lbl">Test Date</div>
        <div class="chip-val">${dateStr}</div>
        <div class="chip-sub">${weekday}</div>
      </div>
      <div class="chip">
        <div class="chip-lbl">Platform URL</div>
        <div class="chip-val">${this._e(this.envUrl || 'app.mondofi.co')}</div>
        <div class="chip-sub">Staging environment</div>
      </div>
      <div class="chip">
        <div class="chip-lbl">Test Credential</div>
        <div class="chip-val">${this._e(this.testCredential || '—')}</div>
      </div>
      <div class="chip">
        <div class="chip-lbl">Health Score</div>
        <div class="chip-val">${healthScore} / 100</div>
        <div class="chip-sub">${failedMods.length} failure(s) · ${skipped} skipped</div>
      </div>
    </div>
  </div>

  <div class="card exec">
    <div class="score-circle">
      <div class="score-num">${healthScore}</div>
      <div class="score-den">/100</div>
    </div>
    <div class="exec-body">
      <h2>Executive Summary</h2>
      <p>${summaryText}</p>
      <div class="pills-row">
        <span class="badge b-critical">${critical.length} Critical</span>
        <span class="badge b-high">${high.length} High</span>
        <span class="badge b-pass">${passed} Passed</span>
      </div>
    </div>
  </div>

  <div class="sec-title">Module Status Overview</div>
  <div class="mod-list">
    ${moduleRows}
  </div>

  <div class="sec-title">All Findings — Prioritized</div>
  <div>
    ${findingCards}
  </div>

  <div class="footer">${suiteName} QA Report · Generated ${genStr} · ${total} Modules · ✓ ${passed} Passed · ✗ ${failedMods.length} Failed · ⚠ ${skipped} Skipped</div>

</div>
</body>
</html>`;
    }
}

module.exports = UiHtmlReporter;
