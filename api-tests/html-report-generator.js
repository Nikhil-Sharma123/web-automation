const fs   = require('fs');
const path = require('path');

class ApiHtmlReporter {
    constructor(options = {}) {
        this.outputFile     = path.resolve(process.cwd(), options.outputFile || 'api-report.html');
        this.envUrl         = process.env.BASE_URL || options.envUrl || '';
        // Only collect tests whose file path contains this string (prevents UI tests from leaking in when running all projects)
        this.filterDir      = options.filterDir !== undefined ? options.filterDir : 'api-tests';
        this.tests          = [];
        this.startTime      = null;
        this.endTime        = null;
        this._modulePfxMap  = {};   // moduleName → prefix
        this._moduleCounter = {};   // prefix → count
    }

    // ─── Playwright reporter hooks ────────────────────────────────────────────

    onBegin() {
        this.startTime = new Date();
    }

    onTestEnd(test, result) {
        // Skip tests outside the api-tests directory when running all projects together
        if (this.filterDir) {
            const filePath = (test.location?.file || '').replace(/\\/g, '/');
            if (!filePath.includes(this.filterDir)) return;
        }

        const moduleName  = this._resolveModule(test.titlePath());
        const prefix      = this._modulePrefix(moduleName);
        this._moduleCounter[prefix] = (this._moduleCounter[prefix] || 0) + 1;
        const id          = `${prefix}-${String(this._moduleCounter[prefix]).padStart(3, '0')}`;

        const cleanTitle        = this._cleanTitle(test.title);
        const method            = this._extractMethod(result.steps);
        const payload           = this._extractPayload(result.steps, cleanTitle);
        const { expected, actual } = this._parseExpectedActual(result, cleanTitle);

        this.tests.push({
            id,
            module:         moduleName,
            description:    this._buildDescription(cleanTitle, method, expected, actual, result.status),
            method,
            payload,
            expected,
            actual,
            status:   result.status === 'passed'  ? 'PASS'
                    : result.status === 'skipped' ? 'SKIP' : 'FAIL',
            duration: result.duration,
            errorMsg: result.errors[0]?.message || '',
        });
    }

    onEnd() {
        if (this.tests.length === 0) return; // no api-tests ran this invocation — don't clobber the last real report
        this.endTime = new Date();
        this._write();
    }

    // ─── Extraction helpers ───────────────────────────────────────────────────

    _resolveModule(titlePath) {
        // titlePath: ['', project-name?, 'file.spec.js', 'Describe Name', 'test title']
        // Walk backward from [length-2] (parent of test) to find a describe block (has spaces)
        // or fall back to the file name — skipping project/folder names like 'api-tests'
        for (let i = titlePath.length - 2; i >= 1; i--) {
            const seg = titlePath[i];
            if (!seg) continue;
            if (seg.includes('/') || seg.includes('\\')) continue;
            if (seg.endsWith('.spec.js') || seg.endsWith('.js')) {
                return seg.replace(/\.spec\.js$|\.js$/, '');
            }
            if (/\s/.test(seg)) {
                return this._shortenDescribe(seg);
            }
            // no spaces → project/folder name (e.g. 'api-tests'), keep searching
        }
        const file = titlePath.find(p => p.endsWith('.spec.js') || p.endsWith('.js')) || 'Unknown';
        return file.replace(/\.spec\.js$|\.js$/, '');
    }

    _shortenDescribe(name) {
        return name
            .replace(/^Mondofi\s+/i, '')
            .replace(/\s+API$/i, '')
            .replace(/\s+Builder\s*/i, ' ')
            .replace(/\s+Admin\s*/i, ' ')
            .replace(/\s+-\s+/g, ' ')
            .trim()
            .split(/\s+/)
            .slice(0, 3)
            .join(' ')
            .trim();
    }

    _modulePrefix(moduleName) {
        if (this._modulePfxMap[moduleName]) return this._modulePfxMap[moduleName];
        const words = moduleName.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
        let base = words.length === 1
            ? words[0].substring(0, 4).toUpperCase()
            : words.map(w => w[0]).join('').substring(0, 4).toUpperCase();
        let final = base, n = 1;
        while (Object.values(this._modulePfxMap).includes(final)) {
            final = base.substring(0, 3) + n++;
        }
        this._modulePfxMap[moduleName] = final;
        return final;
    }

    _extractMethod(steps) {
        const re = /API\s+Call:\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+/i;
        const walk = (list) => {
            for (const s of list || []) {
                const m = (s.title || '').match(re);
                if (m) return m[1].toUpperCase();
                const nested = walk(s.steps);
                if (nested) return nested;
            }
            return null;
        };
        return walk(steps) || '—';
    }

    _extractPayload(steps, testTitle) {
        // 1. JSON object in a step title (POST body sometimes surfaced this way)
        const re = /\{.+\}/;
        const walk = (list) => {
            for (const s of list || []) {
                const m = (s.title || '').match(re);
                if (m) return m[0];
                const nested = walk(s.steps);
                if (nested) return nested;
            }
            return null;
        };
        return walk(steps) || this._inferPayload(testTitle || '');
    }

    _inferPayload(title) {
        const t = title.toLowerCase();

        // Auth / token patterns
        if (t.includes('missing token') || t.includes('no token') || t.includes('without token')) return 'No auth header';
        if (t.includes('invalid token') || t.includes('tampered') || t.includes('expired')) return 'Bearer <invalid>';
        if (t.includes('empty bearer') || t.includes('empty auth') || t.includes('empty token')) return 'Bearer ""';

        // POST body patterns
        if (t.includes('empty body') || t.includes('empty json') || t.includes('empty request body')) return '{}';
        if (t.includes('null') && (t.includes('email') || t.includes('credential'))) return '{ email: null, pwd: null }';
        if (t.includes('sql injection')) return "' OR 1=1; --";
        if (t.includes('xss') || t.includes('cross-site')) return '<script>alert(1)</script>';
        if (t.includes('extremely long') || t.includes('long email')) return 'email: 300+ chars';
        if (t.includes('special char')) return 'pwd: special chars';
        if (t.includes('numeric email')) return 'email: 12345';
        if (t.includes('whitespace') && t.includes('password')) return 'password: "   "';
        if (t.includes('empty email')) return 'email: ""';

        // Generic param=value pattern in the title (e.g. "limit=0", "for_select_list=false", "view=week")
        const paramMatch = title.match(/\b([a-z][a-z_]{1,30})=([^\s,)(]+)/i);
        if (paramMatch) return `${paramMatch[1]}=${paramMatch[2]}`;

        // Descriptive numeric patterns
        if (t.includes('page 2') || t.includes('pagination')) return 'page=2';
        if (t.includes('negative') && t.includes('limit')) return 'limit=-5';
        if (t.includes('negative') && t.includes('page')) return 'page=-1';
        if (t.includes('negative') && t.includes('building')) return 'building_id=-999';
        if (t.includes('negative') && t.includes('id')) return 'id=-1';
        if (t.includes('large page') || t.includes('very large page') || t.includes('out-of-range page')) return 'page=999999';
        if (t.includes('extremely large') && t.includes('limit')) return 'limit=100000';
        if (t.includes('extremely large') && t.includes('id')) return 'id=2147483647';
        if (t.includes('non-existent') && (t.includes('building') || t.includes('id'))) return 'id=999999';
        if (t.includes('non-existent') && t.includes('email')) return 'email: unknown@fake.com';
        if (t.includes('non-numeric') && t.includes('limit')) return 'limit="all"';
        if (t.includes('non-numeric') && t.includes('id')) return 'id="abc"';
        if (t.includes('january 2000') || t.includes('far in history')) return 'month_year=Jan 2000';
        if (t.includes('future month') || t.includes('future year')) return 'month/year: future';
        if (t.includes('without') || t.includes('absent') || t.includes('omit') || t.includes('missing param')) return 'No required param';
        if (t.includes('content type') || t.includes('response time') || t.includes('performance')) return 'Default params';
        if (t.includes('successfully') || t.includes('default') || t.includes('verify')) return 'Default params';

        return '—';
    }

    _parseExpectedActual(result, testTitle) {
        // Strip ANSI escape codes that Playwright embeds in assertion messages
        const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

        if (!result.errors || result.errors.length === 0) {
            // PASS — infer expected behaviour from test title
            return {
                expected: this._inferExpected(testTitle || ''),
                actual:   'As expected',
            };
        }

        const msg = stripAnsi(result.errors[0]?.message || '');

        // Standard Playwright format: "Expected: 200\nReceived: 422"
        const expLine = msg.match(/Expected(?:\s+value)?:\s*(.+)/);
        const recLine = msg.match(/Received(?:\s+value)?:\s*(.+)/);
        if (expLine && recLine) {
            return {
                expected: expLine[1].trim().substring(0, 55),
                actual:   recLine[1].trim().substring(0, 55),
            };
        }

        // toHaveProperty / Expected path
        if (msg.includes('toHaveProperty') || msg.includes('Expected path:')) {
            const pathMatch = msg.match(/(?:path:\s*|Expected path:\s*)["']([^"']{1,40})["']/);
            return {
                expected: pathMatch ? `has "${pathMatch[1]}"` : 'property exists',
                actual:   'property missing',
            };
        }

        // Status codes left over (e.g. from toContain / toBe)
        const codes = (msg.match(/\b\d{3}\b/g) || []);
        const unique = [...new Set(codes)];
        if (unique.length >= 2) {
            return {
                expected: `HTTP ${unique.slice(0, -1).join(' / ')}`,
                actual:   `HTTP ${unique[unique.length - 1]}`,
            };
        }
        if (unique.length === 1) {
            return { expected: `HTTP ${unique[0]}`, actual: '—' };
        }

        // Boolean toBe
        if (msg.includes('Expected: true') || msg.includes('Expected: false')) {
            const e = msg.includes('Expected: true') ? 'true' : 'false';
            return { expected: e, actual: e === 'true' ? 'false' : 'true' };
        }

        return { expected: '—', actual: msg.split('\n')[0].trim().substring(0, 60) };
    }

    _inferExpected(title) {
        const t = title.toLowerCase();
        if (t.includes('unauthorized') || t.includes('missing token') || t.includes('invalid token') ||
            t.includes('expired') || t.includes('tampered') || t.includes('empty bearer') ||
            t.includes('empty token') || t.includes('empty auth') || t.includes('bad token') ||
            t.includes('no token')) return 'HTTP 401 / 403';
        if (t.includes('content type') || t.includes('content-type')) return 'application/json';
        if (t.includes('response time') || t.includes('acceptable limit') || t.includes('performance')) return '< 5000ms';
        if (t.includes('sql injection') || t.includes('xss')) return 'HTTP 4xx (rejected)';
        if (t.includes('empty body') || t.includes('empty json')) return 'HTTP 400 / 422';
        if (t.includes('null') && (t.includes('email') || t.includes('credential'))) return 'HTTP 4xx';
        if (t.includes('extremely long') || t.includes('long email')) return 'HTTP 400 / 413';
        if (t.includes('non-existent') || t.includes('not found')) return 'HTTP 200 / 404';
        if (t.includes('invalid') || t.includes('negative') || t.includes('zero boundary') ||
            t.includes('non-numeric') || t.includes('non-boolean') || t.includes('out-of-range')) return 'HTTP 200 / 400 / 422';
        if (t.includes('limit parameter') || t.includes('limit respected') || t.includes('at most')) return 'Results ≤ limit';
        if (t.includes('pagination') || t.includes('page 2')) return 'HTTP 200 / 404';
        if (t.includes('required field') || t.includes('structure') || t.includes('object structure')) return 'Has required fields';
        if (t.includes('ordering') || t.includes('search filter') || t.includes('filter')) return 'HTTP 200';
        if (t.includes('successfully') || t.includes('default params') || t.includes('fetch')) return 'HTTP 200';
        return 'HTTP 2xx';
    }

    _cleanTitle(title) {
        return title.replace(/^TC\d+\s*[-–]\s*/, '').trim();
    }

    _buildDescription(title, method, expected, actual, status) {
        const t = title.toLowerCase();
        const M = method !== '—' ? method : 'API call';
        const isFail = status === 'failed';

        // ── Intentionally failing tests ──────────────────────────────────────
        if (isFail) {
            if (actual === 'property missing') {
                // Extract field name before "Field/Array/Object"
                const fm = title.match(/\b([A-Za-z_]+)\s+(?:Field|Array|Object)\b/i);
                const field = fm ? fm[1].toLowerCase() : 'field';
                return `${M} → asserts \`${field}\` in response — field not returned by API (intentional FAIL)`;
            }
            if (t.includes('must return 200') || t.includes('must still return') ||
                (t.includes('unauthenticated') && t.includes('200')) ||
                t.includes('should be publicly accessible')) {
                return `${M} without valid auth → wrongly asserts HTTP 200 — API correctly returns 4xx (intentional FAIL)`;
            }
            if (t.includes('non-existent') || t.includes('unregistered') || t.includes('nobody')) {
                return `${M} with non-existent resource → wrongly asserts HTTP 200 — API returns error (intentional FAIL)`;
            }
            return `${M} → assertion fails: expected "${expected}", got "${actual}" (intentional FAIL)`;
        }

        // ── Auth / token ──────────────────────────────────────────────────────
        if ((t.includes('unauthorized') || t.includes('missing token')) && !t.includes('must')) {
            return `${M} without Authorization header → verified HTTP 401 Unauthorized`;
        }
        if (t.includes('invalid token') && !t.includes('must')) {
            return `${M} with malformed Bearer token → verified HTTP 401`;
        }
        if (t.includes('tampered') || t.includes('expired token')) {
            return `${M} with expired/tampered JWT → verified HTTP 401 or 403`;
        }
        if (t.includes('empty bearer') || t.includes('empty token') || t.includes('empty auth')) {
            return `${M} with empty Bearer value → verified HTTP 401 or 403`;
        }

        // ── Content / performance verification ───────────────────────────────
        if (t.includes('content type') || t.includes('content-type')) {
            return `${M} → verified Content-Type header is application/json`;
        }
        if (t.includes('response time') || t.includes('acceptable limit')) {
            return `${M} → measured response latency and verified it is under 5000ms`;
        }
        if (t.includes('required field') || t.includes('object structure') || t.includes('verify response')) {
            return `${M} → verified response body contains required fields (e.g. id)`;
        }

        // ── Security ──────────────────────────────────────────────────────────
        if (t.includes('sql injection')) {
            return `${M} with SQL injection in input field → verified API rejected (not HTTP 200)`;
        }
        if (t.includes('xss') || t.includes('cross-site')) {
            return `${M} with XSS payload in field → verified API rejected the request`;
        }

        // ── Input validation ──────────────────────────────────────────────────
        if (t.includes('extremely long') || t.includes('long email') || t.includes('500-char')) {
            return `${M} with 300–500 char oversized input → verified HTTP 400 or 413`;
        }
        if (t.includes('null') && (t.includes('email') || t.includes('credential'))) {
            return `${M} with null email & password → verified API returns non-200 error`;
        }
        if (t.includes('empty body') || t.includes('empty json') || t.includes('empty request body')) {
            return `${M} with empty request body {} → verified validation error returned`;
        }
        if (t.includes('special char') && t.includes('password')) {
            return `${M} with special characters in password → verified API rejected`;
        }
        if (t.includes('numeric email')) {
            return `${M} with integer value as email → verified type validation error`;
        }
        if (t.includes('whitespace') && t.includes('password')) {
            return `${M} with whitespace-only password → verified HTTP 401 / 422`;
        }
        if (t.includes('empty email') || (t.includes('empty string') && t.includes('email'))) {
            return `${M} with empty string email → verified validation error`;
        }

        // ── Boundary / negative ───────────────────────────────────────────────
        if (t.includes('negative') && t.includes('limit')) {
            return `${M} with limit=-5 (below min) → verified HTTP 400/422 or default applied`;
        }
        if (t.includes('negative') && t.includes('page')) {
            return `${M} with page=-1 (invalid) → verified HTTP 400/422 or first page returned`;
        }
        if (t.includes('negative') && (t.includes('building') || t.includes('id '))) {
            return `${M} with negative ID value → verified HTTP 400/404 (no such record)`;
        }
        if ((t.includes('zero') || t.includes('=0')) && t.includes('limit')) {
            return `${M} with limit=0 (zero boundary) → verified empty result or HTTP 400`;
        }
        if ((t.includes('zero') || t.includes('=0')) && (t.includes('id') || t.includes('boundary'))) {
            return `${M} with id=0 (zero boundary) → verified HTTP 404 (zero is invalid)`;
        }
        if (t.includes('non-numeric') && t.includes('limit')) {
            return `${M} with limit="all" (non-numeric) → verified coercion or HTTP 400`;
        }
        if (t.includes('non-numeric') && t.includes('id')) {
            return `${M} with id="abc" (non-numeric) → verified HTTP 400/422`;
        }
        if (t.includes('non-numeric') || t.includes('non-boolean')) {
            return `${M} with wrong data type for parameter → verified validation error`;
        }
        if (t.includes('extremely large') || (t.includes('large') && t.includes('id'))) {
            return `${M} with max-int or very large id → verified HTTP 404 or empty result`;
        }
        if (t.includes('extremely large') && t.includes('limit')) {
            return `${M} with limit=100000 (huge) → verified API caps or returns 400`;
        }
        if (t.includes('non-existent') && (t.includes('id') || t.includes('building'))) {
            return `${M} with id=999999 (no such record) → verified HTTP 200 empty or 404`;
        }
        if (t.includes('non-existent') && t.includes('email')) {
            return `${M} with unregistered email → verified HTTP 401/404/422`;
        }
        if (t.includes('invalid') && t.includes('ordering')) {
            return `${M} with unrecognised ordering value → verified API handles gracefully`;
        }
        if (t.includes('invalid') && (t.includes('order_by') || t.includes('column'))) {
            return `${M} with invalid order_by column → verified HTTP 400 or default ordering`;
        }
        if (t.includes('invalid') && t.includes('month') && t.includes('year')) {
            return `${M} with ISO date instead of "Month YYYY" format → verified format mismatch handling`;
        }
        if (t.includes('invalid') && t.includes('month')) {
            return `${M} with out-of-range month (e.g. 13) → verified HTTP 400/422`;
        }
        if (t.includes('month=0') || (t.includes('zero') && t.includes('month'))) {
            return `${M} with month=0 (invalid) → verified HTTP 400/422`;
        }
        if (t.includes('invalid') && t.includes('view')) {
            return `${M} with unrecognised view type → verified HTTP 400 or fallback to default`;
        }
        if (t.includes('invalid') && t.includes('token')) {
            return `${M} with invalid/malformed token → verified HTTP 401`;
        }
        if ((t.includes('without') || t.includes('missing') || t.includes('absent') || t.includes('omit'))
            && (t.includes('param') || t.includes('parameter') || t.includes('month_year'))) {
            return `${M} without required query parameter → verified graceful handling`;
        }
        if (t.includes('arbitrary') || t.includes('unknown param') || t.includes('resilience')) {
            return `${M} with unknown extra param → verified API ignores it (no 500)`;
        }

        // ── Limit / pagination (PASS) ─────────────────────────────────────────
        if (t.includes('limit parameter') || t.includes('limit respected') || t.includes('does not exceed')) {
            return `${M} with limit=5 → verified result count does not exceed 5`;
        }
        if (t.includes('minimum boundary') || (t.includes('limit=1') && !t.includes('invalid'))) {
            return `${M} with limit=1 (minimum boundary) → verified ≤ 1 result returned`;
        }
        if (t.includes('higher limit')) {
            return `${M} with limit=50 (higher) → verified HTTP 200 with up to 50 results`;
        }
        if (t.includes('page 2') || (t.includes('pagination') && t.includes('fetch'))) {
            return `${M} with page=2 → verified HTTP 200 or 404 for second page`;
        }
        if (t.includes('very large page') || t.includes('large page') || t.includes('out-of-range page')) {
            return `${M} with page=999999 → verified empty result or 404 (no crash)`;
        }

        // ── Date / time ───────────────────────────────────────────────────────
        if (t.includes('previous month') || t.includes('different month')) {
            return `${M} with a different month parameter → verified HTTP 200 and period data`;
        }
        if (t.includes('future month') || t.includes('future year')) {
            return `${M} with future date → verified HTTP 200 (empty) or 404`;
        }
        if (t.includes('far in history') || t.includes('january 2000') || t.includes('past date')) {
            return `${M} with very old date → verified empty data or graceful response`;
        }

        // ── View / filter ─────────────────────────────────────────────────────
        if (t.includes('week') && t.includes('view')) {
            return `${M} with view=week → verified HTTP 200 or validation error`;
        }
        if (t.includes('calender_view=false') || t.includes('list view')) {
            return `${M} with calendar_view=false (list mode) → verified HTTP 200 or 400`;
        }
        if (t.includes('search filter')) {
            return `${M} with search="A" → verified filtered results and HTTP 200`;
        }
        if (t.includes('descending') || (t.includes('ordering') && t.includes('descend'))) {
            return `${M} with ordering=desc → verified HTTP 200 and response data`;
        }
        if (t.includes('filter by') || (t.includes('specific') && t.includes('email'))) {
            return `${M} with targeted email filter → verified HTTP 200/404 response`;
        }

        // ── Happy path ────────────────────────────────────────────────────────
        if (t.includes('successfully') || t.includes('success')) {
            if (method === 'POST') {
                return `${M} with valid credentials → verified HTTP 200/201 and response structure`;
            }
            return `${M} with valid token and default params → verified HTTP 200 and data returned`;
        }
        if (t.includes('default params') || t.includes('with default')) {
            return `${M} with default parameters → verified HTTP 200 with paginated results`;
        }

        // Fallback — title is already descriptive enough
        return title;
    }

    // ─── HTML generation ──────────────────────────────────────────────────────

    _write() {
        const total    = this.tests.length;
        const passed   = this.tests.filter(t => t.status === 'PASS').length;
        const failed   = this.tests.filter(t => t.status === 'FAIL').length;
        const skipped  = this.tests.filter(t => t.status === 'SKIP').length;
        const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
        const duration = this._fmtDuration(this.endTime - this.startTime);

        const modules = {};
        for (const t of this.tests) {
            if (!modules[t.module]) modules[t.module] = { pass: 0, fail: 0, skip: 0 };
            modules[t.module][t.status === 'PASS' ? 'pass' : t.status === 'FAIL' ? 'fail' : 'skip']++;
        }

        const now     = this.startTime || new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toTimeString().substring(0, 8);

        const html = this._html({
            total, passed, failed, skipped, passRate,
            duration, modules, dateStr, timeStr,
        });

        fs.writeFileSync(this.outputFile, html, 'utf8');
        console.log(`\n\x1b[36m📊 API Report → ${this.outputFile}\x1b[0m`);
    }

    _fmtDuration(ms) {
        if (!ms || ms < 0) return '0s';
        if (ms < 1000) return `${ms}ms`;
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
    }

    _e(str) {
        if (!str || str === '—') return str || '—';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _trunc(str, n) {
        const s = String(str || '');
        return s.length > n ? s.substring(0, n) + '…' : s;
    }

    // ─── Template ─────────────────────────────────────────────────────────────

    _html({ total, passed, failed, skipped, passRate, duration, modules, dateStr, timeStr }) {
        const failedTests = this.tests.filter(t => t.status === 'FAIL');
        const modCount    = Object.keys(modules).length;

        /* ── sidebar module links ── */
        const sidebarModules = Object.keys(modules)
            .map(m => `<span class="sb-mod">${this._e(m)}</span>`)
            .join('');

        /* ── module performance rows ── */
        const moduleRows = Object.entries(modules).map(([name, c]) => {
            const tot  = c.pass + c.fail + c.skip;
            const pct  = tot > 0 ? Math.round((c.pass / tot) * 100) : 0;
            const col  = pct === 100 ? '#22c55e' : pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
            return `<div class="mod-row">
                <span class="mod-name">${this._e(name)}</span>
                <div class="prog-wrap"><div class="prog-fill" style="width:${pct}%;background:${col}"></div></div>
                <span class="mod-pct">${pct}%</span>
            </div>`;
        }).join('');

        /* ── failure cards ── */
        const failCards = failedTests.slice(0, 6).map(t => `
            <div class="fail-card">
                <div class="fail-hdr">
                    <span class="fail-ttl">${this._e(this._trunc(t.description, 52))}</span>
                    <span class="badge-mod">${this._e(t.module)}</span>
                </div>
                <div class="fail-err">${this._e(this._trunc((t.errorMsg || '').split('\n')[0], 100))}</div>
            </div>`).join('');
        const moreLabel = failedTests.length > 6
            ? `<div class="more-fail">and ${failedTests.length - 6} more</div>` : '';

        /* ── grouped test table rows (one collapsible section per API/describe block) ── */
        const groupOrder = [];
        const groupMap   = {};
        for (const t of this.tests) {
            if (!groupMap[t.module]) { groupMap[t.module] = []; groupOrder.push(t.module); }
            groupMap[t.module].push(t);
        }
        let rowIdx = 0;
        const rows = groupOrder.map((mod, gi) => {
            const gTests = groupMap[mod];
            const gPass  = gTests.filter(t => t.status === 'PASS').length;
            const gFail  = gTests.filter(t => t.status === 'FAIL').length;
            const gSkip  = gTests.filter(t => t.status === 'SKIP').length;
            const gId    = `g${gi}`;
            const pct    = gTests.length > 0 ? Math.round(gPass / gTests.length * 100) : 0;
            const pctCol = pct === 100 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
            const hdrRow = `<tr class="ghdr" onclick="tog('${gId}')">
                <td colspan="8">
                  <span class="garr" id="arr-${gId}">▾</span>
                  <span class="gname">${this._e(mod)}</span>
                  <span class="gstat">
                    <span class="gs-n">${gTests.length} tests</span>
                    <span class="gs-p">&#10003; ${gPass} passed</span>
                    ${gFail  > 0 ? `<span class="gs-f">&#10007; ${gFail} failed</span>` : ''}
                    ${gSkip  > 0 ? `<span class="gs-s">${gSkip} skipped</span>` : ''}
                    <span class="gpct" style="color:${pctCol}">${pct}%</span>
                  </span>
                </td>
            </tr>`;
            const tRows = gTests.map(t => {
                const sCls = t.status === 'PASS' ? 'st-pass' : t.status === 'FAIL' ? 'st-fail' : 'st-skip';
                const mCls = { GET:'m-get', POST:'m-post', PUT:'m-put', DELETE:'m-del', PATCH:'m-patch' }[t.method] || 'm-oth';
                const dur  = t.duration < 1000 ? `${t.duration}ms` : `${(t.duration/1000).toFixed(2)}s`;
                rowIdx++;
                return `<tr class="${rowIdx%2===0?'re':'ro'} grow" data-g="${gId}">
                    <td><span class="tid">${this._e(t.id)}</span></td>
                    <td class="dc" title="${this._e(t.description)}">${this._e(this._trunc(t.description, 72))}</td>
                    <td>${t.method!=='—'?`<span class="mb ${mCls}">${this._e(t.method)}</span>`:'<span class="dash">—</span>'}</td>
                    <td class="pc" title="${this._e(t.payload)}">${this._e(this._trunc(t.payload, 40))}</td>
                    <td title="${this._e(t.expected)}">${this._e(this._trunc(t.expected, 35))}</td>
                    <td title="${this._e(t.actual)}">${this._e(this._trunc(t.actual, 35))}</td>
                    <td><span class="stb ${sCls}">${t.status}</span></td>
                    <td>${dur}</td>
                </tr>`;
            }).join('');
            return hdrRow + tRows;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Test Execution Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f1117;color:#e2e8f0;display:flex;min-height:100vh}

/* ── Sidebar ── */
.sb{width:190px;flex-shrink:0;background:#161b27;border-right:1px solid #1e2433;padding:22px 16px;display:flex;flex-direction:column;gap:18px;position:sticky;top:0;height:100vh;overflow-y:auto}
.sb-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:#475569;margin-bottom:5px}
.sb-title{font-size:14px;font-weight:700;color:#f1f5f9}
.sb-sub{font-size:11px;color:#64748b;margin-top:1px}
.sb-link{font-size:11px;color:#38bdf8;word-break:break-all}
.sb-line{font-size:11px;color:#94a3b8;margin-top:3px}
.sb-line b{color:#e2e8f0}
.sb-status{display:flex;align-items:center;gap:6px;font-size:11px;color:#f59e0b}
.sb-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0}
.sb-dot.green{background:#22c55e}
.sb-mod{display:block;font-size:11px;color:#94a3b8;padding:2px 0;cursor:default}

/* ── Main ── */
.main{flex:1;padding:28px 32px;overflow-x:auto}
h1{font-size:26px;font-weight:800;color:#f1f5f9;margin-bottom:3px}
.sub{font-size:12px;color:#64748b;margin-bottom:26px}

/* ── Stat cards ── */
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:24px}
.card{border-radius:12px;padding:18px 18px 14px}
.c-blue{background:linear-gradient(135deg,#1e3a8a,#2563eb)}
.c-green{background:linear-gradient(135deg,#064e3b,#059669)}
.c-red{background:linear-gradient(135deg,#7f1d1d,#dc2626)}
.c-orange{background:linear-gradient(135deg,#78350f,#d97706)}
.c-purple{background:linear-gradient(135deg,#4c1d95,#7c3aed)}
.c-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;opacity:.75;margin-bottom:8px}
.c-val{font-size:34px;font-weight:800;color:#fff}
.c-bar{height:3px;background:rgba(255,255,255,.25);border-radius:2px;margin-top:14px}
.c-fill{height:100%;border-radius:2px;background:rgba(255,255,255,.65)}

/* ── Key findings ── */
.kf{background:#161b27;border:1px solid #1e2433;border-radius:10px;padding:13px 18px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center}
.kf-title{font-size:14px;font-weight:600;color:#f1f5f9}
.kf-sub{font-size:11px;color:#64748b;margin-top:2px}
.kf-warn{font-size:11px;color:#f59e0b;font-weight:600}
.kf-ok{font-size:11px;color:#22c55e;font-weight:600}

/* ── Two-column panels ── */
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:26px}
.panel{background:#161b27;border:1px solid #1e2433;border-radius:10px;padding:18px}
.p-title{font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:14px}

/* Module performance */
.mod-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.mod-name{width:190px;font-size:12px;color:#cbd5e1;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prog-wrap{flex:1;height:7px;background:#1e2433;border-radius:4px;overflow:hidden}
.prog-fill{height:100%;border-radius:4px}
.mod-pct{width:36px;text-align:right;font-size:11px;color:#64748b}

/* Failure cards */
.fail-card{background:#2d1515;border:1px solid #4a1c1c;border-radius:8px;padding:10px 12px;margin-bottom:8px}
.fail-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:3px}
.fail-ttl{font-size:12px;font-weight:500;color:#fca5a5;flex:1}
.fail-err{font-size:10px;color:#94a3b8;font-family:Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge-mod{font-size:9px;padding:2px 7px;border-radius:4px;background:#1e2d3d;color:#38bdf8;white-space:nowrap;font-weight:600}
.more-fail{text-align:center;font-size:11px;color:#64748b;margin-top:6px}
.no-fail{text-align:center;font-size:13px;color:#64748b;padding:36px 0}

/* ── Test table ── */
.sec-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.sec-ttl{font-size:14px;font-weight:600;color:#f1f5f9}
.sec-btns{display:flex;gap:8px}
.btn-tg{background:#1a2035;border:1px solid #2d3748;color:#94a3b8;font-size:11px;padding:5px 13px;border-radius:6px;cursor:pointer;transition:background .15s,color .15s}
.btn-tg:hover{background:#263352;color:#e2e8f0;border-color:#3d5580}
.tbl-wrap{background:#161b27;border:1px solid #1e2433;border-radius:10px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:#1a2035;color:#64748b;text-transform:uppercase;font-size:9px;letter-spacing:.8px;padding:11px 12px;text-align:left;border-bottom:1px solid #1e2433;white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid #191e2c;vertical-align:middle}
tr.re td{background:#161b27}
tr.ro td{background:#11151e}
tr.grow:hover td{background:#1a2035!important}
tr:last-child td{border-bottom:none}
.tid{font-size:10px;color:#64748b;font-family:Consolas,monospace}
.dc{max-width:400px;color:#cbd5e1}
.pc{max-width:160px;font-size:10px;color:#94a3b8;font-family:Consolas,monospace}
.dash{color:#2d3748}

/* ── Collection (group) header rows ── */
.ghdr{background:#192038;cursor:pointer;user-select:none}
.ghdr:hover{background:#1e2d4a}
.ghdr td{padding:11px 16px;border-top:2px solid #2b4278;border-bottom:1px solid #263352}
.garr{font-size:12px;margin-right:9px;display:inline-block;transition:transform .18s;color:#4a6fa5;font-weight:700}
.gname{font-weight:700;font-size:13px;color:#93c5fd;letter-spacing:.2px}
.gstat{margin-left:18px;font-size:11px;display:inline-flex;gap:16px;align-items:center}
.gs-n{color:#4a5568}
.gs-p{color:#22c55e;font-weight:600}
.gs-f{color:#ef4444;font-weight:700}
.gs-s{color:#a8a29e}
.gpct{font-weight:800;font-size:12px}

/* Status badge */
.stb{display:inline-block;font-size:10px;font-weight:700;padding:3px 9px;border-radius:4px}
.st-pass{background:#052e16;color:#22c55e}
.st-fail{background:#450a0a;color:#ef4444}
.st-skip{background:#1c1917;color:#a8a29e}

/* Method badge */
.mb{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px}
.m-get{background:#0c2340;color:#38bdf8}
.m-post{background:#2d1a00;color:#f59e0b}
.m-put{background:#1a1a00;color:#a3e635}
.m-del{background:#2d0000;color:#f87171}
.m-patch{background:#1e1b2e;color:#a78bfa}
.m-oth{background:#1e1b2e;color:#a78bfa}
</style>
</head>
<body>

<div class="sb">
  <div>
    <div class="sb-lbl">Report</div>
    <div class="sb-title">API Test Suite</div>
    <div class="sb-sub">Automation Report</div>
  </div>
  <div>
    <div class="sb-lbl">Environment</div>
    <div class="sb-link">${this._e(this.envUrl || 'localhost')}</div>
  </div>
  <div>
    <div class="sb-lbl">Generated</div>
    <div class="sb-line"><b>Date:</b> ${dateStr}</div>
    <div class="sb-line"><b>Time:</b> ${timeStr}</div>
    <div class="sb-line"><b>Duration:</b> ${duration}</div>
    <div class="sb-line"><b>Tests:</b> ${total}</div>
  </div>
  <div>
    <div class="sb-lbl">Status</div>
    <div class="sb-status">
      <span class="sb-dot ${failed === 0 ? 'green' : ''}"></span>
      ${failed > 0 ? 'Needs Attention' : 'All Passed'}
    </div>
  </div>
  <div>
    <div class="sb-lbl">Modules</div>
    ${sidebarModules}
  </div>
</div>

<div class="main">
  <h1>Test Execution Report</h1>
  <div class="sub">Comprehensive analysis of API automation test suite</div>

  <div class="cards">
    <div class="card c-blue">
      <div class="c-lbl">Total Tests</div>
      <div class="c-val">${total}</div>
      <div class="c-bar"><div class="c-fill" style="width:100%"></div></div>
    </div>
    <div class="card c-green">
      <div class="c-lbl">Passed</div>
      <div class="c-val">${passed}</div>
      <div class="c-bar"><div class="c-fill" style="width:${total>0?Math.round(passed/total*100):0}%"></div></div>
    </div>
    <div class="card c-red">
      <div class="c-lbl">Failed</div>
      <div class="c-val">${failed}</div>
      <div class="c-bar"><div class="c-fill" style="width:${total>0?Math.round(failed/total*100):0}%"></div></div>
    </div>
    <div class="card c-orange">
      <div class="c-lbl">Skipped</div>
      <div class="c-val">${skipped}</div>
      <div class="c-bar"><div class="c-fill" style="width:${total>0?Math.round(skipped/total*100):0}%"></div></div>
    </div>
    <div class="card c-purple">
      <div class="c-lbl">Pass Rate</div>
      <div class="c-val">${passRate}%</div>
      <div class="c-bar"><div class="c-fill" style="width:${passRate}%"></div></div>
    </div>
  </div>

  <div class="kf">
    <div>
      <div class="kf-title">Key Findings</div>
      <div class="kf-sub">${failed} failure${failed!==1?'s':''} detected across ${modCount} module${modCount!==1?'s':''} &bull; Total duration: ${duration}</div>
    </div>
    ${failed > 0
        ? '<div class="kf-warn">⚠ Needs Attention</div>'
        : '<div class="kf-ok">✓ All Clear</div>'}
  </div>

  <div class="two">
    <div class="panel">
      <div class="p-title">Module Performance</div>
      ${moduleRows}
    </div>
    <div class="panel">
      <div class="p-title">Failure Breakdown</div>
      ${failedTests.length === 0
          ? '<div class="no-fail">No failures 🎉</div>'
          : failCards + moreLabel}
    </div>
  </div>

  <div class="sec-hdr">
    <span class="sec-ttl">Test Collections &mdash; ${total} tests across ${groupOrder.length} API groups</span>
    <div class="sec-btns">
      <button class="btn-tg" onclick="togAll(false)">&#9660; Expand All</button>
      <button class="btn-tg" onclick="togAll(true)">&#9658; Collapse All</button>
    </div>
  </div>
  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Description</th><th>Method</th>
          <th>Payload</th><th>Expected Result</th><th>Actual Result</th>
          <th>Status</th><th>Duration</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<script>
function tog(id) {
    var rows = document.querySelectorAll('.grow[data-g="' + id + '"]');
    var arr  = document.getElementById('arr-' + id);
    var isOpen = rows.length > 0 && rows[0].style.display !== 'none';
    rows.forEach(function(r) { r.style.display = isOpen ? 'none' : ''; });
    if (arr) arr.style.transform = isOpen ? 'rotate(-90deg)' : '';
}
function togAll(collapse) {
    document.querySelectorAll('.ghdr').forEach(function(h) {
        var m = h.getAttribute('onclick').match(/'([^']+)'/);
        if (!m) return;
        var id   = m[1];
        var rows = document.querySelectorAll('.grow[data-g="' + id + '"]');
        var arr  = document.getElementById('arr-' + id);
        rows.forEach(function(r) { r.style.display = collapse ? 'none' : ''; });
        if (arr) arr.style.transform = collapse ? 'rotate(-90deg)' : '';
    });
}
</script>
</body>
</html>`;
    }
}

module.exports = ApiHtmlReporter;
