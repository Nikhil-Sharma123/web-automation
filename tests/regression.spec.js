const { test, expect } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');
const nspell = require('nspell');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ADMIN_EMAIL / ADMIN_PASSWORD are the same account as DAA_EMAIL / DAA_PASSWORD in
// .env (galaxy@mailinator.com) — this suite walks the same building-admin portal
// ClickRental.spec.js logs into, so it reuses that proven login flow and module list.
const BASE_URL       = process.env.BASE_URL     || 'https://app.mondofi.co';
const USER_NAME      = process.env.USER_NAME;
const PASSWORD       = process.env.PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || process.env.DAA_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.DAA_PASSWORD;

test.use({ storageState: undefined });

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED CONSOLE HELPERS  (identical to ClickRental.spec.js / ClickCarshare.spec.js)
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  reset:  '\x1b[0m',
};
const W          = 72;
const HR_THICK   = `${C.green}${'━'.repeat(W)}${C.reset}`;
const HR_THIN    = `${C.dim}${'─'.repeat(W)}${C.reset}`;
const ERR_BORDER = () => `${C.red}${C.bold}${'═'.repeat(W)}${C.reset}`;

const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
const fmtDur    = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;

// ═══════════════════════════════════════════════════════════════════════════════
//  UI AUDIT — font size / spelling / broken-image checks run after every module
// ═══════════════════════════════════════════════════════════════════════════════

// Words that are correctly spelled but won't be recognised by a general English
// dictionary — product names and common compound tech terms. Extend this list as
// real false positives turn up in reports.
const SPELL_WHITELIST = new Set([
  'mondofi', 'mopoints', 'mailinator', 'yopmail', 'daa', 'gw132', 'sadmin',
  'dropdown', 'dropdowns', 'checkbox', 'checkboxes', 'signup', 'signin', 'signout',
  'login', 'logout', 'username', 'filename', 'hostname', 'timestamp', 'backend',
  'frontend', 'webpage', 'onboarding', 'autocomplete', 'hyperlink', 'faqs', 'faq',
  'otp', 'api', 'url', 'urls', 'ui', 'ux', 'admin', 'app', 'apps',
]);

// Lazily loaded and cached — the dictionary is ~500KB, only worth parsing once
// per test run regardless of how many modules get audited.
let spellCheckerPromise = null;
function getSpellChecker() {
  if (!spellCheckerPromise) {
    spellCheckerPromise = import('dictionary-en').then(({ default: dictionary }) => nspell(dictionary));
  }
  return spellCheckerPromise;
}

// Heuristic, not a full linguistic audit: only lowercase words are checked.
// Capitalised words are overwhelmingly proper nouns in this app's real content —
// building names, city names, tenant names — and a general dictionary flags almost
// all of them, which would flood every module's report with false positives. This
// trades recall for precision: genuine lowercase copy typos are still caught.
async function checkSpelling(page) {
  const spell = await getSpellChecker();
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  const words = bodyText.match(/\b[a-z]{3,}\b/g) || [];

  const misspelled = [];
  const seen = new Set();
  for (const word of words) {
    if (seen.has(word) || SPELL_WHITELIST.has(word)) continue;
    seen.add(word);
    if (!spell.correct(word)) misspelled.push(word);
    if (misspelled.length >= 8) break; // smoke check, not exhaustive — cap noise per page
  }

  if (misspelled.length > 0) {
    const e = new Error(`Possible spelling issue(s): ${misspelled.join(', ')}`);
    e.uiIssue = true;
    throw e;
  }
}

// Flags visible text rendered smaller than 9px — smaller than that reads as broken
// on virtually any real display, whereas 10-11px captions are normal UI copy, so the
// threshold is set just below that to avoid flagging legitimate small text.
const MIN_FONT_PX = 9;
async function checkFontSizes(page) {
  const tiny = await page.evaluate((min) => {
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text.length < 2) continue;
      const el = node.parentElement;
      if (!el || el.offsetParent === null) continue; // skip hidden text
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size && size < min) found.push(`"${text.slice(0, 24)}" (${size}px)`);
      if (found.length >= 5) break;
    }
    return found;
  }, MIN_FONT_PX);

  if (tiny.length > 0) {
    const e = new Error(`Font-size issue(s) — text under ${MIN_FONT_PX}px: ${tiny.join(', ')}`);
    e.uiIssue = true;
    throw e;
  }
}

// Flags broken images (missing asset, bad CDN URL, etc.) — a common design regression.
// `domcontentloaded` (when this runs) fires before images finish loading, so a still-
// loading image also has naturalWidth 0 — checking `.complete` too excludes those and
// only flags images the browser has actually finished attempting to load and failed.
async function checkDesign(page) {
  const broken = await page.evaluate(() => {
    return Array.from(document.images)
      .filter(img => img.offsetParent !== null && img.src && img.complete && img.naturalWidth === 0)
      .map(img => img.src)
      .slice(0, 5);
  });

  if (broken.length > 0) {
    const e = new Error(`Design issue — broken image(s): ${broken.join(', ')}`);
    e.uiIssue = true;
    throw e;
  }
}

async function auditUi(page) {
  await checkDesign(page);
  await checkFontSizes(page);
  await checkSpelling(page);
}

// ── Silent UI health check — runs after every non-critical step ────────────────
async function checkPageHealth(page, stepName) {
  const url = page.url();

  if (!stepName.toLowerCase().startsWith('login') && url.includes('/login')) {
    const e = new Error('Session expired — page redirected to login');
    e.isShowStopper = true;
    e.pageUrl       = url;
    e.uiIssue       = true;
    throw e;
  }

  const has404 = await page.locator('text=/404|Page not found|Not Found/').first()
    .isVisible({ timeout: 300 }).catch(() => false);
  if (has404) {
    const e = new Error(`404 — Page not found after navigating to "${stepName}"`);
    e.pageUrl = url;
    e.uiIssue = true;
    throw e;
  }

  const errorSels = [
    '.alert-danger',
    '[class*="toast-error"]',
    '[class*="error-toast"]',
    '[class*="toast"][class*="error"]',
    '[class*="notification-error"]',
    '[class*="snackbar-error"]',
  ];
  for (const sel of errorSels) {
    const visible = await page.locator(sel).first()
      .isVisible({ timeout: 200 }).catch(() => false);
    if (visible) {
      const txt = await page.locator(sel).first().textContent().catch(() => 'Error visible on page');
      const e   = new Error(`UI error on page: "${txt.trim().replace(/\s+/g, ' ').slice(0, 120)}"`);
      e.pageUrl = url;
      e.uiIssue = true;
      throw e;
    }
  }

  // UI quality checks — font size, spelling, broken images
  await auditUi(page);
}

// ── Error block printer ────────────────────────────────────────────────────────
function printErrorBlock(name, err, dur, isCritical) {
  const raw          = stripAnsi(err.message || '');
  const lines        = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const firstLine    = lines[0] || 'Unknown error';
  const contextLines = lines.slice(1)
    .filter(l => /locator|selector|expected|received|timeout|waiting|url/i.test(l))
    .slice(0, 3);

  const isUiIssue  = !!err.uiIssue;
  const isAutoStop = !!err.isShowStopper;

  const banner = (isCritical || isAutoStop)
    ? `  ${C.red}${C.bold}🚨  SHOW STOPPER  ─  ${name}${C.reset}`
    : isUiIssue
      ? `  ${C.yellow}${C.bold}⚠   UI ISSUE  ─  ${name}${C.reset}`
      : `  ${C.red}${C.bold}✗   ERROR  ─  ${name}${C.reset}`;

  console.log('');
  console.log(ERR_BORDER());
  console.log(banner);
  console.log(ERR_BORDER());

  console.log(`  ${C.red}${C.bold}  ✖  ${firstLine}${C.reset}`);
  contextLines.forEach(l => console.log(`  ${C.red}     ${l}${C.reset}`));

  if (err.pageUrl) {
    console.log(`  ${C.cyan}  🌐  Page URL  : ${err.pageUrl}${C.reset}`);
  }
  console.log(`  ${C.dim}  ⏱  Duration : ${fmtDur(dur)}${C.reset}`);

  if (isCritical || isAutoStop) {
    const reason = isAutoStop ? 'Session expired' : 'Login failed';
    console.log(`  ${C.yellow}${C.bold}  ⛔  ${reason} — remaining modules will be skipped${C.reset}`);
  } else {
    console.log(`  ${C.yellow}  ▷  Continuing with next module...${C.reset}`);
  }

  console.log(ERR_BORDER());
  console.log('');
}

// ── Step runner ────────────────────────────────────────────────────────────────
function makeStepRunner(results, page) {
  let halted     = false;
  let haltReason = '';

  return async function step(name, fn, { critical = false } = {}) {
    if (halted) {
      results.push({ name, status: 'skipped' });
      console.log(
        `  ${C.yellow}○${C.reset}  ${name.padEnd(34)}  ${C.dim}skipped (${haltReason})${C.reset}`
      );
      return;
    }

    return test.step(name, async () => {
      const t0 = Date.now();
      try {
        await fn();
        if (!critical) await checkPageHealth(page, name);

        const dur = Date.now() - t0;
        results.push({ name, status: 'pass', dur });
        console.log(
          `  ${C.green}${C.bold}✓${C.reset}  ${C.bold}${name.padEnd(34)}${C.reset}` +
          `  ${C.dim}${fmtDur(dur)}${C.reset}`
        );
      } catch (err) {
        const dur           = Date.now() - t0;
        const msg           = stripAnsi(err.message || '').split('\n')[0].trim();
        const autoStopper   = !!err.isShowStopper;
        const effectiveCrit = critical || autoStopper;

        if (!err.pageUrl) err.pageUrl = page.url();

        results.push({ name, status: 'fail', dur, error: msg });

        const icon = err.uiIssue ? `${C.yellow}⚠${C.reset}` : `${C.red}${C.bold}✗${C.reset}`;
        console.log(
          `  ${icon}  ${C.red}${C.bold}${name.padEnd(34)}${C.reset}` +
          `  ${C.dim}${fmtDur(dur)}${C.reset}`
        );

        printErrorBlock(name, err, dur, effectiveCrit);

        if (effectiveCrit) {
          halted     = true;
          haltReason = autoStopper ? 'session expired' : 'login failed';
          throw err;
        }
      }
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Regression', () => {
  test('Full navigation — every module & submodule, with UI audit', async ({ page }) => {
    test.setTimeout(900000); // 15 min — full sweep of every module/submodule + UI checks

    const results = [];
    const step    = makeStepRunner(results, page);

    console.log(`\n${HR_THICK}`);
    console.log(`  ${C.bold}Regression  ·  Full Module Sweep + UI Audit${C.reset}`);
    console.log(HR_THIN);
    console.log(`  ${'Module'.padEnd(36)}  Duration`);
    console.log(HR_THIN);

    // ── Login (critical — halts on failure) ────────────────────────────────────
    await step('Login', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.locator("//input[@placeholder='User Name']").fill(USER_NAME);
      await page.locator("//input[@placeholder='Password']").fill(PASSWORD);
      await page.locator("//button[@type='submit']").click();
      await page.waitForLoadState('networkidle').catch(() => {});

      await page.locator("//a[@href='/login']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//input[@placeholder='Email ID']").fill(ADMIN_EMAIL);
      await page.locator("//input[@placeholder='Password']").fill(ADMIN_PASSWORD);
      await page.locator("//button[@type='submit']").click();
      await page.waitForLoadState('networkidle').catch(() => {});

      await page.locator('.spinnerMainDiv').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      const nativeSelectVisible = await page.locator('select').first().isVisible().catch(() => false);
      if (nativeSelectVisible) {
        await page.locator('select').first().selectOption({ index: 1 });
        await page.locator("//button[normalize-space()='Continue']").click();
        await page.waitForLoadState('networkidle').catch(() => {});
      } else {
        const dropdown = page.locator("//div[contains(@class,'Select RemoveLine__value-container')]").first();
        if (await dropdown.isVisible().catch(() => false)) {
          await dropdown.click({ timeout: 10000 });
          await page.locator("//div[@id='react-select-2-option-0']").click().catch(() => {});
          await page.locator("//div[@class='common_L_Red_Btn']/button").click().catch(() => {});
          await page.waitForLoadState('networkidle').catch(() => {});
        }
      }

      await expect(page.locator("//a[normalize-space()='Dashboard']")).toBeVisible({ timeout: 15000 });
    }, { critical: true });

    // ── Dashboard ──────────────────────────────────────────────────────────────
    await step('Dashboard', async () => {
      await page.locator("//a[normalize-space()='Dashboard']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Dashboard']")).toBeVisible();
    });

    // ── Applicants + its tabs (submodules) ────────────────────────────────────
    await step('Applicants', async () => {
      await page.locator("//a[normalize-space()='Applicants']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//nav[@class='nav nav-tabs']")).toBeVisible({ timeout: 10000 });
    });

    {
      const tabs  = page.locator("//nav[@class='nav nav-tabs']//a[@role='tab']");
      const count = await tabs.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const label = (await tabs.nth(i).textContent().catch(() => '') || '').trim() || `Tab ${i + 1}`;
        await step(`Applicants › ${label}`, async () => {
          await tabs.nth(i).click();
          await page.waitForLoadState('domcontentloaded');
        });
      }
    }

    // ── Tenants + its tabs (submodules) ───────────────────────────────────────
    await step('Tenants', async () => {
      await page.locator("//a[contains(@href,'/auth/tenant')]").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//nav[@class='nav nav-tabs']")).toBeVisible({ timeout: 10000 });
    });

    {
      const tabs  = page.locator("//nav[@class='nav nav-tabs']//a[@role='tab']");
      const count = await tabs.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const label = (await tabs.nth(i).textContent().catch(() => '') || '').trim() || `Tab ${i + 1}`;
        await step(`Tenants › ${label}`, async () => {
          await tabs.nth(i).click();
          await page.waitForLoadState('domcontentloaded');
        });
      }
    }

    // ── Manage submodules ──────────────────────────────────────────────────────
    const manageItems = [
      'Access Control',
      'Administrators',
      'Data',
      'Calendar',
      'Set Up',
      'Suites',
      'Assign Suites',
      'Banking Info',
      'MoPoints',
      'Amenity Bookings',
    ];

    for (const item of manageItems) {
      await step(`Manage › ${item}`, async () => {
        await page.locator("//*[normalize-space()='Manage']").first().click({ timeout: 10000 });
        await page.locator(
          `//div[contains(@class,'dropdown-menu show')]//a[normalize-space()='${item}']`
        ).click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/mondofi/, { timeout: 10000 });
      });
    }

    // ── Inbox ──────────────────────────────────────────────────────────────────
    await step('Inbox', async () => {
      await page.locator("//a[normalize-space()='Inbox']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("text=Inbox").first()).toBeVisible({ timeout: 10000 });
    });

    // ── Issues ─────────────────────────────────────────────────────────────────
    await step('Issues', async () => {
      await page.locator("//a[normalize-space()='Issues']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("text=Issues").first()).toBeVisible({ timeout: 10000 });
    });

    // ── View ───────────────────────────────────────────────────────────────────
    await step('View', async () => {
      await page.locator("//a[contains(normalize-space(),'View')]").first().click({ timeout: 10000 });
      await page.waitForLoadState('domcontentloaded');
      const items = page.locator("//div[contains(@class,'dropdown-menu show')]//a");
      const count = await items.count().catch(() => 0);
      if (count > 0) {
        await items.first().click();
        await page.waitForLoadState('domcontentloaded');
      }
      await expect(page).toHaveURL(/mondofi/, { timeout: 10000 });
    });

    // ── Financial ──────────────────────────────────────────────────────────────
    await step('Financial', async () => {
      await page.locator("//a[contains(normalize-space(),'Financial')]").first().click({ timeout: 10000 });
      await page.waitForLoadState('domcontentloaded');
      const items = page.locator("//div[contains(@class,'dropdown-menu show')]//a");
      const count = await items.count().catch(() => 0);
      if (count > 0) {
        await items.first().click();
        await page.waitForLoadState('domcontentloaded');
      }
      await expect(page).toHaveURL(/mondofi/, { timeout: 10000 });
    });

    // ── Car Share ──────────────────────────────────────────────────────────────
    await step('Car Share', async () => {
      await page.locator("//a[normalize-space()='Car Share']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("text=Car Share").first()).toBeVisible({ timeout: 10000 });
    });

    // ── Summary ────────────────────────────────────────────────────────────────
    // The attractive HTML/console QA reports (health score, prioritized findings,
    // pass/fail/skip counts) are generated automatically from these same
    // test.step() results by ui-passfail-reporter.js / ui-html-report-generator.js —
    // see package.json's "test:regression" script.
    const passed   = results.filter(r => r.status === 'pass').length;
    const failed   = results.filter(r => r.status === 'fail').length;
    const skipped  = results.filter(r => r.status === 'skipped').length;
    const total    = results.length;
    const totalSec = (results.reduce((s, r) => s + (r.dur || 0), 0) / 1000).toFixed(1);

    console.log(HR_THIN);
    if (failed === 0 && skipped === 0) {
      console.log(`  ${C.green}${C.bold}✔  All ${total} modules/submodules passed${C.reset}  ${C.dim}(${totalSec}s)${C.reset}`);
    } else {
      console.log(
        `  ${C.red}${C.bold}✗  ${failed} FAILED  ` +
        `${C.green}✓ ${passed} passed  ` +
        `${skipped > 0 ? `${C.yellow}○ ${skipped} skipped  ` : ''}` +
        `${C.dim}(${totalSec}s)${C.reset}`
      );
    }
    console.log(`${failed > 0 ? C.red : C.green}${'━'.repeat(W)}${C.reset}\n`);

    if (failed > 0) {
      const names = results.filter(r => r.status === 'fail').map(r => r.name).join(', ');
      throw new Error(`${failed} module(s)/submodule(s) failed: ${names}`);
    }
  });
});
