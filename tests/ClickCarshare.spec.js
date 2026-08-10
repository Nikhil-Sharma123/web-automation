const { test, expect } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL       = process.env.BASE_URL            || 'https://app.mondofi.co';
const USER_NAME      = process.env.USER_NAME;
const PASSWORD       = process.env.PASSWORD;
const CARSHARE_EMAIL = process.env.CARSHARE_EMAIL;
const CARSHARE_PASS  = process.env.CARSHARE_PASSWORD;

test.use({ storageState: undefined });

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED CONSOLE HELPERS
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

// ── Silent UI health check ─────────────────────────────────────────────────────
// Runs AFTER fn() succeeds to catch failures the app shows without throwing.
async function checkPageHealth(page, stepName) {
  const url = page.url();

  // 1. Session expired — silently redirected to login
  if (!stepName.toLowerCase().startsWith('login') && url.includes('/login')) {
    const e = new Error('Session expired — page redirected to login');
    e.isShowStopper = true;
    e.pageUrl       = url;
    e.uiIssue       = true;
    throw e;
  }

  // 2. Hard 404 / "not found" content
  const has404 = await page.locator('text=/404|Page not found|Not Found/').first()
    .isVisible({ timeout: 300 }).catch(() => false);
  if (has404) {
    const e = new Error(`404 — Page not found after navigating to "${stepName}"`);
    e.pageUrl = url;
    e.uiIssue = true;
    throw e;
  }

  // 3. Visible error toast / alert banner
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
}

// ── Error block printer ────────────────────────────────────────────────────────
function printErrorBlock(name, err, dur, isCritical) {
  const raw      = stripAnsi(err.message || '');
  const lines    = raw.split('\n').map(l => l.trim()).filter(Boolean);

  // First line = headline error
  const firstLine = lines[0] || 'Unknown error';

  // All subsequent lines that carry useful info — skip JS stack frames and
  // bare "Error:" prefixes but keep everything else (locators, expected/received,
  // timeout counts, call log entries, etc.)
  const detailLines = lines.slice(1)
    .filter(l => !/^at\s+\S+\s*\(/.test(l) && l !== 'Error:')
    .slice(0, 12);

  const isUiIssue  = !!err.uiIssue;
  const isAutoStop = !!err.isShowStopper;

  const label = (isCritical || isAutoStop)
    ? `🚨  SHOW STOPPER  ─  ${name}`
    : isUiIssue
      ? `⚠   UI ISSUE  ─  ${name}`
      : `✖   STEP FAILED  ─  ${name}`;

  // Top border — solid red block for maximum visibility
  console.log('');
  console.log(`${C.red}${C.bold}${'▓'.repeat(W)}${C.reset}`);
  console.log(`${C.red}${C.bold}  ${label}${C.reset}`);
  console.log(`${C.red}${C.bold}${'▓'.repeat(W)}${C.reset}`);

  // Headline error message
  console.log(`\n  ${C.red}${C.bold}  ${firstLine}${C.reset}`);

  // Full error detail (locator, expected, received, timeout, call log…)
  if (detailLines.length > 0) {
    console.log(`\n  ${C.dim}${'─'.repeat(W - 2)}${C.reset}`);
    detailLines.forEach(l => {
      // Highlight "Expected" / "Received" lines in distinct colours
      if (/^Expected/i.test(l)) {
        console.log(`  ${C.green}  ${l}${C.reset}`);
      } else if (/^Received/i.test(l)) {
        console.log(`  ${C.red}  ${l}${C.reset}`);
      } else {
        console.log(`  ${C.yellow}  ${l}${C.reset}`);
      }
    });
  }

  // Page URL + duration
  console.log('');
  if (err.pageUrl) {
    console.log(`  ${C.cyan}  🌐  URL      : ${err.pageUrl}${C.reset}`);
  }
  console.log(`  ${C.dim}  ⏱  Duration : ${fmtDur(dur)}${C.reset}`);

  // Critical / continue notice
  if (isCritical || isAutoStop) {
    const reason = isAutoStop ? 'Session expired' : 'Login failed';
    console.log(`\n  ${C.yellow}${C.bold}  ⛔  ${reason} — remaining modules will be skipped${C.reset}`);
  } else {
    console.log(`\n  ${C.yellow}  ▷  Continuing with next module...${C.reset}`);
  }

  console.log(`${C.red}${C.bold}${'▓'.repeat(W)}${C.reset}\n`);
}

// ── Step runner ────────────────────────────────────────────────────────────────
function makeStepRunner(results, page) {
  let halted      = false;
  let haltReason  = '';

  // timeout: max ms a single step may run before it is forcibly failed.
  // Login gets 60 s (multiple redirects + networkidle waits).
  // All other steps default to 30 s — well above the longest observed run (~7 s).
  return async function step(name, fn, { critical = false, timeout = 30000 } = {}) {
    if (halted) {
      results.push({ name, status: 'skipped' });
      console.log(
        `  ${C.yellow}○${C.reset}  ${name.padEnd(26)}  ${C.dim}skipped (${haltReason})${C.reset}`
      );
      return;
    }

    return test.step(name, async () => {
      const t0 = Date.now();
      try {
        await fn();
        // Silent UI health check — catches session expiry, 404, error toasts
        if (!critical) await checkPageHealth(page, name);

        const dur = Date.now() - t0;
        results.push({ name, status: 'pass', dur });
        console.log(
          `  ${C.green}${C.bold}✓${C.reset}  ${C.bold}${name.padEnd(26)}${C.reset}` +
          `  ${C.dim}${fmtDur(dur)}${C.reset}`
        );
      } catch (err) {
        const dur            = Date.now() - t0;
        const msg            = stripAnsi(err.message || '').split('\n')[0].trim();
        const autoStopper    = !!err.isShowStopper;
        const effectiveCrit  = critical || autoStopper;

        // Attach live page URL if not already set by checkPageHealth
        if (!err.pageUrl) err.pageUrl = page.url();

        results.push({ name, status: 'fail', dur, error: msg });

        const icon = err.uiIssue ? `${C.yellow}⚠${C.reset}` : `${C.red}${C.bold}✗${C.reset}`;
        console.log(
          `  ${icon}  ${C.red}${C.bold}${name.padEnd(26)}${C.reset}` +
          `  ${C.dim}${fmtDur(dur)}${C.reset}`
        );

        printErrorBlock(name, err, dur, effectiveCrit);

        if (effectiveCrit) {
          halted     = true;
          haltReason = autoStopper ? 'session expired' : 'login failed';
          throw err;
        }
      }
    }, { timeout });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Carshare', () => {
  test('Full navigation — all modules', async ({ page }) => {
    test.setTimeout(300000);

    const results = [];
    const step    = makeStepRunner(results, page);

    console.log(`\n${HR_THICK}`);
    console.log(`  ${C.bold}Carshare Navigation  ·  All Modules${C.reset}`);
    console.log(HR_THIN);
    console.log(`  ${'Module'.padEnd(28)}  Duration`);
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
      await page.locator("//input[@placeholder='Email ID']").fill(CARSHARE_EMAIL);
      await page.locator("//input[@placeholder='Password']").fill(CARSHARE_PASS);
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

      const reachedCarshare = await page.waitForURL(/\/auth\/carshare/, { timeout: 10000 }).catch(() => false);
      const hasApplicationsLink = await page.getByRole('link', { name: /Applications/i }).first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasLogo = await page.locator("//img[@alt='logoimage']").isVisible({ timeout: 10000 }).catch(() => false);

      if (!reachedCarshare && !hasApplicationsLink && !hasLogo) {
        throw new Error('Login did not reach the expected carshare app state');
      }
    }, { critical: true, timeout: 60000 });

    await step('Applications', async () => {
      await page.locator("//a[normalize-space()='Applications']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("a[data-rb-event-key='rejected']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("a[data-rb-event-key='denied']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("a[data-rb-event-key='denied']")).toBeVisible();
    });

    await step('Drivers', async () => {
      await page.locator("//a[normalize-space()='Drivers']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("a[data-rb-event-key='suspended']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("a[data-rb-event-key='deactivated']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("a[data-rb-event-key='deactivated']")).toBeVisible();
    });

    await step('Bookings', async () => {
      await page.locator("//a[normalize-space()='Bookings']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Bookings']")).toBeVisible();
    });

    await step('Cars', async () => {
      await page.locator("//a[normalize-space()='Cars']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Cars']")).toBeVisible();
    });

    await step('Pricing', async () => {
      await page.locator("//a[normalize-space()='Pricing']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Pricing']")).toBeVisible();
    });

    await step('Stations', async () => {
      await page.locator("//a[normalize-space()='Stations']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Stations']")).toBeVisible();
    });

    await step('Parking', async () => {
      await page.locator("//a[normalize-space()='Parking']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Parking']")).toBeVisible();
    });

    await step('Alerts', async () => {
      await page.locator("//a[normalize-space()='Alerts']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Alerts']")).toBeVisible();
    });

    await step('Fees', async () => {
      await page.locator("//a[normalize-space()='Service Fees']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Tax']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Fees']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Late Fees']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Open Return Fees']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Inspection']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Inspection']")).toBeVisible();
    });

    await step('Settings', async () => {
      await page.locator("//a[normalize-space()='Settings']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Settings']")).toBeVisible();
    });

    await step('Reports', async () => {
      await page.locator("//a[normalize-space()='Reports']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Reports']")).toBeVisible();
    });

    await step('Users', async () => {
      await page.locator("//a[@href='/auth/users']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("a[data-rb-event-key='all']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[contains(normalize-space(),'Deactivated')]").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[contains(normalize-space(),'Deactivated')]")).toBeVisible();
    });

    await step('Manage', async () => {
      const toggle = "//div[contains(@class,'mr-auto newMrAuto navbar-nav')]//div[1]//div[1]//div[1]//a[1]";
      await page.locator(toggle).click();
      await page.locator("//a[normalize-space()='Administrators']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Admin Roles']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(toggle).click();
      await page.locator("//a[normalize-space()='Set Up']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(toggle).click();
      await page.locator("//a[normalize-space()='MoPoints']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator("//a[normalize-space()='Settings']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(toggle).click();
      await page.locator("//a[normalize-space()='Mobile App URLs']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//a[normalize-space()='Mobile App URLs']")).toBeVisible();
    });

    await step('Inbox', async () => {
      const tab = (n) => `//nav[@class='nav nav-tabs']//a[@role='tab'][normalize-space()='${n}']`;
      await page.locator("//a[normalize-space()='Inbox']").click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(tab('Contacts')).click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(tab('AGENTS')).click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(tab('DAA')).click();
      await page.waitForLoadState('domcontentloaded');
      await page.locator(tab('Former Users')).click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator(tab('Former Users'))).toBeVisible();
    });

    await step('View', async () => {
      const viewToggle = "//body/div[@id='root']/div[@class='publicArea__content_main carshare_only']/div[@class='customLogedHeader']/nav[@class='navbar navbar-expand-lg navbar-light fixed-top']/div[@id='responsive-navbar-nav']/div[@class='mr-auto newMrAuto navbar-nav']/div[2]/div[1]/div[1]/a[1]";
      await page.locator(viewToggle).click();
      await page.locator("//a[normalize-space()='User App Usage']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("text=User App Usage Reports")).toBeVisible();
    });

    await step('Dashboard', async () => {
      await page.locator("//img[@alt='logoimage']").click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator("//img[@alt='logoimage']")).toBeVisible();
    });

    // ── Summary ────────────────────────────────────────────────────────────────
    const passed  = results.filter(r => r.status === 'pass').length;
    const failed  = results.filter(r => r.status === 'fail').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const total   = results.length;
    const totalSec = (results.reduce((s, r) => s + (r.dur || 0), 0) / 1000).toFixed(1);

    console.log(HR_THIN);
    if (failed === 0 && skipped === 0) {
      console.log(`  ${C.green}${C.bold}✔  All ${total} modules passed${C.reset}  ${C.dim}(${totalSec}s)${C.reset}`);
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
      throw new Error(`${failed} module(s) failed: ${names}`);
    }
  });
});
