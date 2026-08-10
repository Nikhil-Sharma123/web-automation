const { test, expect } = require('@playwright/test');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED CONSOLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  green:  '\x1b[32m', red:    '\x1b[31m', yellow: '\x1b[33m',
  cyan:   '\x1b[36m', bold:   '\x1b[1m',  dim:    '\x1b[2m',  reset:  '\x1b[0m',
};
const W          = 72;
const HR_THICK   = `${C.green}${'━'.repeat(W)}${C.reset}`;
const HR_THIN    = `${C.dim}${'─'.repeat(W)}${C.reset}`;
const ERR_BORDER = () => `${C.red}${C.bold}${'═'.repeat(W)}${C.reset}`;
const stripAnsi  = s => String(s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
const fmtDur     = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;

async function checkPageHealth(page, stepName) {
  let url;
  try { url = page.url(); } catch (_) { return; }

  if (!stepName.toLowerCase().startsWith('login') && url.includes('/login')) {
    const e = new Error('Session expired — page redirected to login');
    e.isShowStopper = true; e.pageUrl = url; e.uiIssue = true;
    throw e;
  }

  const has404 = await page.locator('text=/404|Page not found|Not Found/')
    .first().isVisible({ timeout: 300 }).catch(() => false);
  if (has404) {
    const e = new Error(`404 — Page not found after "${stepName}"`);
    e.pageUrl = url; e.uiIssue = true; throw e;
  }

  const errorSels = [
    '.alert-danger', '[class*="toast-error"]', '[class*="error-toast"]',
    '[class*="toast"][class*="error"]', '[class*="notification-error"]', '[class*="snackbar-error"]',
  ];
  for (const sel of errorSels) {
    const visible = await page.locator(sel).first().isVisible({ timeout: 200 }).catch(() => false);
    if (visible) {
      const txt = await page.locator(sel).first().textContent().catch(() => 'Error visible on page');
      const e   = new Error(`UI error: "${txt.trim().replace(/\s+/g, ' ').slice(0, 120)}"`);
      e.pageUrl = url; e.uiIssue = true; throw e;
    }
  }
}

function printErrorBlock(name, err, dur, isCritical) {
  const raw       = stripAnsi(err.message || '');
  const lines     = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0] || 'Unknown error';
  const ctxLines  = lines.slice(1)
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
  ctxLines.forEach(l => console.log(`  ${C.red}     ${l}${C.reset}`));
  if (err.pageUrl) console.log(`  ${C.cyan}  🌐  Page URL  : ${err.pageUrl}${C.reset}`);
  console.log(`  ${C.dim}  ⏱  Duration : ${fmtDur(dur)}${C.reset}`);
  if (isCritical || isAutoStop) {
    const reason = isAutoStop ? 'Session expired' : 'Critical step failed';
    console.log(`  ${C.yellow}${C.bold}  ⛔  ${reason} — remaining steps will be skipped${C.reset}`);
  } else {
    console.log(`  ${C.yellow}  ▷  Continuing with next step...${C.reset}`);
  }
  console.log(ERR_BORDER());
  console.log('');
}

function makeStepRunner(results, page) {
  let halted = false, haltReason = '';

  return async function step(name, fn, { critical = false } = {}) {
    if (halted) {
      results.push({ name, status: 'skipped' });
      console.log(`  ${C.yellow}○${C.reset}  ${name.padEnd(36)}  ${C.dim}skipped (${haltReason})${C.reset}`);
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
          `  ${C.green}${C.bold}✓${C.reset}  ${C.bold}${name.padEnd(36)}${C.reset}` +
          `  ${C.dim}${fmtDur(dur)}${C.reset}`
        );
      } catch (err) {
        const dur           = Date.now() - t0;
        const msg           = stripAnsi(err.message || '').split('\n')[0].trim();
        const autoStopper   = !!err.isShowStopper;
        const effectiveCrit = critical || autoStopper;
        if (!err.pageUrl) { try { err.pageUrl = page.url(); } catch (_) {} }
        results.push({ name, status: 'fail', dur, error: msg });
        const icon = err.uiIssue ? `${C.yellow}⚠${C.reset}` : `${C.red}${C.bold}✗${C.reset}`;
        console.log(
          `  ${icon}  ${C.red}${C.bold}${name.padEnd(36)}${C.reset}` +
          `  ${C.dim}${fmtDur(dur)}${C.reset}`
        );
        printErrorBlock(name, err, dur, effectiveCrit);
        if (effectiveCrit) {
          halted     = true;
          haltReason = autoStopper ? 'session expired' : 'critical step failed';
          throw err;
        }
      }
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST
// ═══════════════════════════════════════════════════════════════════════════════

test.setTimeout(720000);

test.describe('FreeDemo + DeleteBuilding', () => {
  test('Free Demo + Delete Buildings combined flow', async ({ browser }) => {

    const baseUrl              = process.env.BASE_URL               || 'https://app.mondofi.co';
    const userName             = process.env.USER_NAME;
    const password             = process.env.PASSWORD;
    const demoEmail            = process.env.DEMO_EMAIL             || 'Financy@mailinator.com';
    const demoShortname        = process.env.DEMO_SHORTNAME         || 'FL123';
    const demoFirstName        = process.env.DEMO_FIRST_NAME        || 'Financy';
    const demoLastName         = process.env.DEMO_LAST_NAME         || 'World';
    const demoBuildingName     = process.env.DEMO_BUILDING_NAME     || 'Financy world';
    const demoPhone            = process.env.DEMO_PHONE             || '9996004439';
    const demoAddress          = process.env.DEMO_ADDRESS           || 'Canada';
    const demoBuildingPassword = process.env.DEMO_BUILDING_PASSWORD;
    const superAdminUrl        = process.env.SUPER_ADMIN_URL        || 'https://sadmin.mondofi.co/';
    const superAdminEmail      = process.env.SUPER_ADMIN_EMAIL;
    const superAdminPassword   = process.env.SUPER_ADMIN_PASSWORD;
    const mailcatcherUser      = process.env.MAILCATCHER_USER;
    const mailcatcherPass      = process.env.MAILCATCHER_PASS;
    const mailcatcherUrlEnv    = process.env.MAILCATCHER_URL        || 'https://ws.mondofi.co/mailcatcher';
    const mailcatcherHost      = mailcatcherUrlEnv.replace('https://', '');
    const mailcatcherUrl       = `https://${mailcatcherUser}:${encodeURIComponent(mailcatcherPass)}@${mailcatcherHost}`;

    const context = await browser.newContext({ permissions: ['geolocation'] });
    const page    = await context.newPage();
    const results = [];
    const step    = makeStepRunner(results, page);

    let confirmPage;

    console.log(`\n${HR_THICK}`);
    console.log(`  ${C.bold}FreeDemo + DeleteBuilding  ·  Combined Flow${C.reset}`);
    console.log(HR_THIN);
    console.log(`  ${'Step'.padEnd(38)}  Duration`);
    console.log(HR_THIN);

    // ── Part 1: Stage Login & Submit Demo Form ─────────────────────────────────
    await step('Part 1 · Stage Login & Demo Form', async () => {
      await page.goto(baseUrl);
      await page.waitForTimeout(1000);
      await page.fill('xpath=//input[@placeholder="User Name"]', userName);
      await page.fill('xpath=//input[@type="password"]', password);
      try { await page.click('#Icon_ionic-md-eye-off', { timeout: 3000 }); } catch (_) {}
      await page.click('xpath=//button[@class="customButton  btn btn-primary"]');
      await page.waitForTimeout(2000);

      for (let i = 0; i <= 15; i++) {
        await page.evaluate(() => window.scrollBy(0, 200));
        await page.waitForTimeout(300);
      }
      await page.click('xpath=//a[@href="/creatingBuilding"]');
      await page.waitForTimeout(1000);
      await page.fill('xpath=//input[@name="firstName"]', demoFirstName);
      await page.waitForTimeout(500);
      await page.fill('xpath=//input[@name="lastName"]', demoLastName);
      await page.waitForTimeout(500);
      await page.fill('xpath=//input[@name="buildingEmail"]', demoEmail);
      await page.click('css=.dropbtn');
      await page.waitForTimeout(1000);
      await page.fill('css=#myInput', '91');
      await page.waitForTimeout(1000);
      await page.click('xpath=//div[@class="md-country-picker-item false"][normalize-space()="IN +91"]');
      await page.waitForTimeout(1000);
      await page.fill('xpath=//input[@name="buildingPhone"]', demoPhone);
      await page.fill('xpath=//input[@name="buildingName"]', demoBuildingName);
      await page.fill('xpath=//input[@name="buildingShortName"]', demoShortname);
      await page.waitForTimeout(1000);
      await page.fill('xpath=//input[@placeholder="Enter building address"]', demoAddress);
      await page.waitForTimeout(3000);
      await page.click('xpath=//div[@class="autocomplete-dropdown-container"]/div[2]');
      await page.waitForTimeout(2000);
      try {
        await page.click('xpath=//div[@class="Select RemoveLine__placeholder css-1wa3eu0-placeholder"]');
        await page.click('xpath=//div[@id="react-select-2-option-5"]');
      } catch (_) {}
      await page.fill('xpath=//input[@name="password"]', demoBuildingPassword);
      await page.fill('xpath=//input[@placeholder="Confirm password"]', demoBuildingPassword);
      await page.waitForTimeout(2000);
      await page.click('xpath=//button[@type="Submit"]');
      await page.waitForTimeout(5000);
    }, { critical: true });

    // ── Part 2: Super Admin Approval ───────────────────────────────────────────
    await step('Part 2 · Super Admin Approval', async () => {
      const contextSuper = await browser.newContext();
      const pageSuper    = await contextSuper.newPage();
      try {
        await pageSuper.goto(superAdminUrl);
        await pageSuper.waitForTimeout(1000);
        await pageSuper.fill('xpath=//input[@placeholder="Email ID"]', superAdminEmail);
        await pageSuper.fill('xpath=//input[@placeholder="Password"]', superAdminPassword);
        await pageSuper.waitForTimeout(1000);
        await pageSuper.click('xpath=//button[@type="Submit"]');
        await pageSuper.waitForTimeout(3000);
        const viewBtn = pageSuper.locator('xpath=//tbody/tr[1]/td[7]/div[1]/button[1]');
        await viewBtn.waitFor({ state: 'visible', timeout: 10000 });
        await viewBtn.click();
        await pageSuper.waitForTimeout(3000);
        const approveBtn = pageSuper.locator('xpath=//div[@class="common_M_Red_Btn"]/button');
        await approveBtn.waitFor({ state: 'visible', timeout: 10000 });
        await approveBtn.click();
        await pageSuper.waitForTimeout(2000);
      } finally {
        await contextSuper.close();
      }
    });

    // ── Part 3: Mailcatcher Verification ───────────────────────────────────────
    await step('Part 3 · Mailcatcher Verification', async () => {
      const pageMail = await context.newPage();
      await pageMail.goto(mailcatcherUrl);
      await pageMail.waitForTimeout(2000);

      let emailFound = false, mailRow = null;
      for (let attempt = 1; attempt <= 15; attempt++) {
        await pageMail.reload({ waitUntil: 'networkidle' });
        await pageMail.waitForTimeout(2000);
        const rows = await pageMail.locator('nav#messages table tbody tr').all();
        for (const row of rows) {
          const nameText  = await row.locator('td').nth(1).innerText().catch(() => '');
          const titleText = await row.locator('td').nth(2).innerText().catch(() => '');
          if (
            nameText.toLowerCase().includes(demoEmail.toLowerCase()) &&
            titleText.toLowerCase().includes('confirmation instructions')
          ) {
            mailRow = row; emailFound = true; break;
          }
        }
        if (emailFound) break;
        await pageMail.waitForTimeout(4000);
      }
      if (!emailFound) throw new Error('Confirmation Instructions email not found in Mailcatcher after 15 attempts');

      await mailRow.locator('td').nth(2).click();
      await pageMail.waitForTimeout(2000);
      const frameElement = await pageMail.waitForSelector('iframe');
      const emailFrame   = await frameElement.contentFrame();
      if (!emailFrame) throw new Error('Could not access email body iframe');

      const pagePromise = context.waitForEvent('page', { timeout: 30000 });
      await emailFrame.click('xpath=//td[@class="button-td button-td-primary"]');
      try {
        const newPage = await pagePromise;
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        confirmPage = newPage;
      } catch (_) {
        await pageMail.waitForLoadState('networkidle').catch(() => {});
        confirmPage = pageMail;
      }
    }, { critical: true });

    // ── Part 4: New Building Login ─────────────────────────────────────────────
    await step('Part 4 · New Building Login', async () => {
      if (!confirmPage) throw new Error('confirmPage not available — previous step may have failed');
      await confirmPage.bringToFront();
      await confirmPage.waitForLoadState();
      await confirmPage.waitForTimeout(3000);
      await confirmPage.fill('xpath=//input[@placeholder="Email ID"]', demoEmail);
      await confirmPage.fill('xpath=//input[@placeholder="Password"]', demoBuildingPassword);
      await confirmPage.waitForTimeout(1000);
      try {
        await confirmPage.click('xpath=//span[@class="eyeCloseIcon"]//*[name()="svg"]');
        await confirmPage.waitForTimeout(1000);
      } catch (_) {}
      await confirmPage.click('xpath=//button[@type="submit"]');
      await confirmPage.waitForTimeout(5000);
    });

    // ── Part 5: Super Admin Deactivate & Delete ────────────────────────────────
    await step('Part 5 · Super Admin Deactivate & Delete', async () => {
      const contextDelete = await browser.newContext();
      const pageDelete    = await contextDelete.newPage();
      try {
        await pageDelete.goto(superAdminUrl, { waitUntil: 'domcontentloaded' });
        await pageDelete.fill('xpath=//input[@placeholder="Email ID"]', superAdminEmail);
        await pageDelete.fill('xpath=//input[@placeholder="Password"]', superAdminPassword);
        await pageDelete.click('xpath=//button[@type="Submit"]');
        await pageDelete.waitForLoadState('networkidle');
        await pageDelete.waitForTimeout(2000);

        for (let i = 0; i < 3; i++) {
          const buildingsTab = pageDelete.locator('a, span, button').filter({ hasText: /^Buildings$/ }).first();
          await buildingsTab.waitFor({ state: 'visible', timeout: 10000 });
          await buildingsTab.click();
          await pageDelete.waitForLoadState('networkidle');
          await pageDelete.waitForTimeout(3000);

          const viewBtn = pageDelete.getByRole('row')
            .filter({ has: pageDelete.getByRole('button', { name: /^View$/ }) })
            .first()
            .getByRole('button', { name: /^View$/ });
          await viewBtn.waitFor({ state: 'visible', timeout: 20000 });
          await viewBtn.scrollIntoViewIfNeeded();
          await pageDelete.waitForTimeout(1500);
          await viewBtn.hover();
          await pageDelete.waitForTimeout(1000);
          await viewBtn.click();
          await pageDelete.waitForLoadState('networkidle');
          await pageDelete.waitForTimeout(3000);

          const noDataVisible = await pageDelete
            .locator('h5, h6, p').filter({ hasText: /No data found/i }).first()
            .isVisible({ timeout: 3000 }).catch(() => false);
          if (noDataVisible) {
            await pageDelete.goBack();
            await pageDelete.waitForLoadState('networkidle');
            await pageDelete.waitForTimeout(2000);
            continue;
          }

          const deactivateBtn = pageDelete.locator('button').filter({ hasText: /De.?Activate/i }).first();
          await deactivateBtn.waitFor({ state: 'visible', timeout: 15000 });
          await pageDelete.waitForTimeout(1000);
          await deactivateBtn.click();
          const confirmYesBtn = pageDelete.locator('button').filter({ hasText: /^Yes$/i }).first();
          await confirmYesBtn.waitFor({ state: 'visible', timeout: 10000 });
          await pageDelete.waitForTimeout(500);
          await confirmYesBtn.click();
          await pageDelete.waitForLoadState('networkidle');
          await pageDelete.waitForTimeout(2000);

          const deactivatedTab = pageDelete.locator('a, span, button').filter({ hasText: /^Deactivated Buildings$/ }).first();
          await deactivatedTab.waitFor({ state: 'visible', timeout: 10000 });
          await deactivatedTab.click();
          await pageDelete.waitForLoadState('networkidle');
          await pageDelete.waitForTimeout(3000);

          const deactivatedViewBtn = pageDelete.getByRole('row')
            .filter({ has: pageDelete.getByRole('button', { name: /^View$/ }) })
            .first()
            .getByRole('button', { name: /^View$/ });
          if (!await deactivatedViewBtn.isVisible({ timeout: 8000 }).catch(() => false)) continue;

          await deactivatedViewBtn.scrollIntoViewIfNeeded();
          await pageDelete.waitForTimeout(1500);
          await deactivatedViewBtn.hover();
          await pageDelete.waitForTimeout(1000);
          await deactivatedViewBtn.click();
          await pageDelete.waitForLoadState('networkidle');
          await pageDelete.waitForTimeout(3000);

          const deleteBtn = pageDelete.locator('button').filter({ hasText: /^Delete$/i }).first();
          await deleteBtn.waitFor({ state: 'visible', timeout: 10000 });
          await pageDelete.waitForTimeout(1000);
          await deleteBtn.click();
          const deleteYesBtn = pageDelete.locator('button').filter({ hasText: /^Yes$/i }).first();
          await deleteYesBtn.waitFor({ state: 'visible', timeout: 10000 });
          await pageDelete.waitForTimeout(500);
          await deleteYesBtn.click();
          await pageDelete.waitForLoadState('networkidle');
          await pageDelete.waitForTimeout(2000);
          break;
        }
      } finally {
        await contextDelete.close();
      }
    });

    // ── Summary ────────────────────────────────────────────────────────────────
    const passed   = results.filter(r => r.status === 'pass').length;
    const failed   = results.filter(r => r.status === 'fail').length;
    const skipped  = results.filter(r => r.status === 'skipped').length;
    const total    = results.length;
    const totalSec = (results.reduce((s, r) => s + (r.dur || 0), 0) / 1000).toFixed(1);

    console.log(HR_THIN);
    if (failed === 0 && skipped === 0) {
      console.log(`  ${C.green}${C.bold}✔  All ${total} steps passed${C.reset}  ${C.dim}(${totalSec}s)${C.reset}`);
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
      throw new Error(`${failed} step(s) failed: ${names}`);
    }
  });
});
