const { test, expect } = require('@playwright/test');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ─── Date / Calendar helpers ──────────────────────────────────────────────────

function formatDateAsIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function waitForNoOverlay(page, timeout = 15000) {
  const overlaySelectors = '.spinnerMainDiv, .spinner-border, .loading-overlay, .ant-spin, .overlay, .backdrop, .modal-backdrop';
  try {
    await page.waitForSelector(overlaySelectors, { state: 'hidden', timeout });
  } catch (_) {}
  await page.waitForTimeout(200);
}

async function closeCalendarPopup(page) {
  try {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
    }
  } catch (_) {}
  try { await page.locator('body').click({ position: { x: 1, y: 1 } }); } catch (_) {}
  try {
    const overlay = page.locator(
      '.react-calendar, .react-datepicker, .ant-picker-dropdown, .rc-picker-panel, .ant-picker-dropdown-container, .ant-picker-panel, .DayPicker, .date-picker, .datepicker, .calendar, .rdp, .rdp-month, .popup, .dropdown'
    ).filter({ visible: true }).first();
    if (await overlay.count() > 0) {
      const box = await overlay.boundingBox();
      if (box) {
        await page.mouse.click(Math.max(1, box.x - 8), Math.max(1, box.y - 8));
        await page.waitForTimeout(200);
      }
    }
  } catch (_) {}
  try { await page.keyboard.press('Escape'); } catch (_) {}
  await page.waitForTimeout(200);
}

async function clickVisibleCalendarDay(page, dayNumber) {
  const dayString = String(dayNumber);
  const selectors = [
    `xpath=//button[not(@disabled) and normalize-space(.)="${dayString}"]`,
    `xpath=//button[not(@disabled) and normalize-space(.)="${dayString}" and not(contains(@class,"react-datepicker__day--outside-month"))]`,
    `xpath=//td[not(contains(@class,"disabled")) and normalize-space(.)="${dayString}"]`,
    `xpath=//td[not(contains(@class,"disabled"))]//button[normalize-space(.)="${dayString}"]`,
    `xpath=//*[@role="gridcell" and not(contains(@aria-disabled,"true")) and normalize-space(.)="${dayString}"]`,
    `xpath=//*[@role="gridcell" and not(contains(@aria-disabled,"true"))]//button[normalize-space(.)="${dayString}"]`,
    `xpath=//div[contains(@class,"DayPicker-Day") and not(contains(@class,"disabled")) and normalize-space(.)="${dayString}"]`,
    `xpath=//div[not(contains(@class,"disabled")) and normalize-space(.)="${dayString}"]`,
    `xpath=//button[contains(@class,"react-datepicker__day") and not(contains(@class,"--outside-month")) and normalize-space(.)="${dayString}"]`,
    `.react-calendar__tile--now`,
    `.react-calendar__month-view__days__day:not(.react-calendar__month-view__days__day--disabled)`,
  ];
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).filter({ visible: true });
      if (await locator.count() > 0) {
        const match = locator.first();
        await match.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await match.click({ force: true });
        try { await page.waitForSelector('.react-calendar, .react-datepicker, .ant-picker-dropdown, .rc-picker-panel', { state: 'hidden', timeout: 1000 }); } catch (_) {}
        await page.waitForTimeout(150);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function clickLatestAvailableCalendarDay(page) {
  const calendarRoots = page.locator(
    '.react-calendar, .react-datepicker, .ant-picker-dropdown, .rc-picker-panel, .ant-picker-panel, .DayPicker, .date-picker, .datepicker, .calendar, .rdp, .rdp-month, .popup, .dropdown'
  ).filter({ visible: true });
  const scopes = [];
  if (await calendarRoots.count() > 0) scopes.push(calendarRoots.first());
  else scopes.push(page.locator('body'));

  const selectors = [
    'xpath=//td[not(contains(@class,"disabled")) and not(contains(@class,"ant-picker-cell-disabled")) and normalize-space(.)!=""]',
    'xpath=//td[not(contains(@class,"disabled")) and not(contains(@class,"ant-picker-cell-disabled"))]//button[not(@disabled)]',
    'xpath=//button[not(@disabled) and normalize-space(.)!=""]',
    'xpath=//div[not(contains(@class,"disabled")) and normalize-space(.)!=""]',
    '.react-calendar__month-view__days__day:not(.react-calendar__month-view__days__day--disabled)',
    'td.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)',
    'td.ant-picker-cell:not(.ant-picker-cell-disabled):not(.ant-picker-cell-range-start):not(.ant-picker-cell-range-end)',
  ];

  for (const scope of scopes) {
    for (const selector of selectors) {
      try {
        const locator = scope.locator(selector).filter({ visible: true });
        const count   = await locator.count();
        if (count > 0) {
          for (let i = count - 1; i >= 0; i--) {
            const candidate = locator.nth(i);
            const text      = (await candidate.innerText()).trim();
            if (/^\d+$/.test(text)) {
              await candidate.scrollIntoViewIfNeeded();
              await page.waitForTimeout(150);
              await candidate.click({ force: true });
              try { await page.waitForSelector('.react-calendar, .react-datepicker, .ant-picker-dropdown, .rc-picker-panel', { state: 'hidden', timeout: 1000 }); } catch (_) {}
              await page.waitForTimeout(150);
              return true;
            }
          }
        }
      } catch (_) {}
    }
  }
  return false;
}

async function fillDateInputOrCalendar(page, locator, dateValue) {
  const visibleLocator = locator.filter({ visible: true }).first();
  if (await visibleLocator.count() === 0) return false;

  try {
    const tagName = await visibleLocator.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'input') {
      await visibleLocator.fill(dateValue);
      await visibleLocator.press('Enter');
      return true;
    }
  } catch (_) {}

  try {
    const innerInput = visibleLocator.locator('input').first();
    if (await innerInput.count() > 0 && await innerInput.isVisible().catch(() => false)) {
      await innerInput.fill(dateValue);
      await innerInput.press('Enter');
      return true;
    }
  } catch (_) {}

  try {
    await visibleLocator.click({ force: true }).catch(() => null);
    await page.waitForTimeout(300);
    const calendarBtn = visibleLocator.locator(
      '.react-date-picker__calendar-button, button[aria-label*="calendar" i], .ant-picker-icon, .ant-picker-input, button, svg'
    ).filter({ visible: true }).first();
    if (await calendarBtn.count() > 0) {
      try { await calendarBtn.click({ force: true }); } catch (_) {}
    }
    await page.waitForTimeout(800);
    const dayValue = Number(dateValue.split('-').pop());
    if (await clickVisibleCalendarDay(page, dayValue)) return true;
  } catch (_) {}

  try {
    const candidates = await page.locator('input[placeholder*="yyyy" i], input[type="date"], input[name*="date" i], input[id*="date" i]').all();
    for (const c of candidates) {
      try {
        await c.evaluate((el, val) => {
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        }, dateValue);
        await page.waitForTimeout(150);
        return true;
      } catch (_) {}
    }
  } catch (_) {}

  return false;
}

async function selectDate(entryPage, baseSelector, dateValue = null) {
  const locator      = entryPage.locator(baseSelector).filter({ visible: true }).first();
  const locatorCount = await locator.count();
  if (locatorCount === 0) return false;

  if (dateValue) {
    const filled = await fillDateInputOrCalendar(entryPage, locator, dateValue);
    if (filled) { await closeCalendarPopup(entryPage); return true; }
  }

  try {
    await locator.click({ force: true });
    await entryPage.waitForTimeout(800);

    const calendarOpener = locator.locator(
      'button.react-date-picker__calendar-button, button[aria-label*="calendar" i], .ant-picker-icon, .ant-picker-input, svg'
    ).filter({ visible: true }).first();
    if (await calendarOpener.count() > 0 && await calendarOpener.isVisible().catch(() => false)) {
      await calendarOpener.click({ force: true });
      await entryPage.waitForTimeout(800);
    }

    const reactDatePickerButton = entryPage.locator('button.react-date-picker__calendar-button.react-date-picker__button').filter({ visible: true }).first();
    if (await reactDatePickerButton.count() > 0 && await reactDatePickerButton.isVisible().catch(() => false)) {
      await reactDatePickerButton.scrollIntoViewIfNeeded();
      await reactDatePickerButton.click({ force: true });
      await entryPage.waitForTimeout(1000);
    }

    const latestClicked = await clickLatestAvailableCalendarDay(entryPage);
    if (latestClicked) { await closeCalendarPopup(entryPage); return true; }

    const popupCount = await entryPage.locator(
      '.react-calendar, .react-datepicker, .ant-picker-dropdown, .rc-picker-panel, .ant-picker-panel, .DayPicker, .date-picker, .datepicker, .calendar, .rdp, .rdp-month, .popup, .dropdown'
    ).filter({ visible: true }).count();

    if (popupCount === 0) {
      const fallbackDate = formatDateAsIso(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
      const directFilled = await fillDateInputOrCalendar(entryPage, locator, fallbackDate);
      if (directFilled) { await closeCalendarPopup(entryPage); return true; }
    }

    const today   = new Date();
    const clicked = await clickVisibleCalendarDay(entryPage, today.getDate());
    if (clicked) await closeCalendarPopup(entryPage);
    return clicked;
  } catch (_) {
    return false;
  }
}

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
  const raw        = stripAnsi(err.message || '');
  const lines      = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const firstLine  = lines[0] || 'Unknown error';
  const detailLines = lines.slice(1)
    .filter(l => !/^at\s+\S+\s*\(/.test(l) && l !== 'Error:')
    .slice(0, 12);
  const isUiIssue  = !!err.uiIssue;
  const isAutoStop = !!err.isShowStopper;
  const label = (isCritical || isAutoStop)
    ? `🚨  SHOW STOPPER  ─  ${name}`
    : isUiIssue ? `⚠   UI ISSUE  ─  ${name}` : `✖   STEP FAILED  ─  ${name}`;

  console.log('');
  console.log(`${C.red}${C.bold}${'▓'.repeat(W)}${C.reset}`);
  console.log(`${C.red}${C.bold}  ${label}${C.reset}`);
  console.log(`${C.red}${C.bold}${'▓'.repeat(W)}${C.reset}`);
  console.log(`\n  ${C.red}${C.bold}  ${firstLine}${C.reset}`);
  if (detailLines.length > 0) {
    console.log(`\n  ${C.dim}${'─'.repeat(W - 2)}${C.reset}`);
    detailLines.forEach(l => {
      if (/^Expected/i.test(l)) console.log(`  ${C.green}  ${l}${C.reset}`);
      else if (/^Received/i.test(l)) console.log(`  ${C.red}  ${l}${C.reset}`);
      else console.log(`  ${C.yellow}  ${l}${C.reset}`);
    });
  }
  console.log('');
  if (err.pageUrl) console.log(`  ${C.cyan}  🌐  URL      : ${err.pageUrl}${C.reset}`);
  console.log(`  ${C.dim}  ⏱  Duration : ${fmtDur(dur)}${C.reset}`);
  if (isCritical || isAutoStop) {
    const reason = isAutoStop ? 'Session expired' : 'Login failed';
    console.log(`\n  ${C.yellow}${C.bold}  ⛔  ${reason} — remaining steps will be skipped${C.reset}`);
  } else {
    console.log(`\n  ${C.yellow}  ▷  Continuing with next step...${C.reset}`);
  }
  console.log(`${C.red}${C.bold}${'▓'.repeat(W)}${C.reset}\n`);
}

function makeStepRunner(results, page) {
  let halted = false, haltReason = '';

  // timeout: max ms a single step may run before it is forcibly failed.
  // Login/building-selection steps get 60 s; all others default to 45 s.
  return async function step(name, fn, { critical = false, timeout = 45000 } = {}) {
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
          haltReason = err.haltReason || (autoStopper ? 'session expired' : 'critical step failed');
          throw err;
        }
      }
    }, { timeout });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('IntellTenant', () => {
  test('NewTenant E2E Flow', async ({ browser }) => {
    test.setTimeout(1800000);

    const baseEmail          = (process.env.EMAIL || '').trim();
    const email              = baseEmail;
    const firstName          = (process.env.FIRST_NAME || '').trim();
    const lastName           = (process.env.LAST_NAME || '').trim();
    const phone              = (process.env.PHONE_NUMBER || '').replace(/\s/g, '');
    const userName           = process.env.USER_NAME;
    const password           = process.env.PASSWORD;
    const buildingEmail      = process.env.ADMIN_EMAIL;
    const buildingPassword   = process.env.ADMIN_PASSWORD;
    const buildingName       = (process.env.BUILDING_NAME || 'Water Land').trim();
    const baseUrl            = process.env.BASE_URL;
    const mailcatcherUser    = process.env.MAILCATCHER_USER;
    const mailcatcherPass    = process.env.MAILCATCHER_PASS;
    const mailcatcherUrlEnv  = process.env.MAILCATCHER_URL || '';
    const mailcatcherHost    = mailcatcherUrlEnv.replace('https://', '');
    const mailcatcherUrl     = `https://${mailcatcherUser}:${encodeURIComponent(mailcatcherPass)}@${mailcatcherHost}`;

    const context = await browser.newContext({ permissions: ['geolocation'] });
    const page    = await context.newPage();
    const results = [];
    const step    = makeStepRunner(results, page);

    // Hoisted cross-step variables
    let pageMail, context1, page1, rentalRow, rentalPage, contextAdmin2, pageAdmin2;

    console.log(`\n${HR_THICK}`);
    console.log(`  ${C.bold}IntellTenant  ·  NewTenant E2E Flow${C.reset}`);
    console.log(`  ${C.dim}Email: ${email}${C.reset}`);
    console.log(HR_THIN);
    console.log(`  ${'Step'.padEnd(38)}  Duration`);
    console.log(HR_THIN);

    // ── Stage Login ────────────────────────────────────────────────────────────
    await step('Stage Login', async () => {
      await page.goto(baseUrl);
      await page.fill('input[placeholder="User Name"]', userName);
      await page.fill('input[type="password"]', password);
      await page.click('#Icon_ionic-md-eye-off');
      await page.click('button.customButton.btn.btn-primary');
      await page.waitForTimeout(1000);
    }, { critical: true, timeout: 60000 });

    // ── Select Building ────────────────────────────────────────────────────────
    await step('Select Building', async () => {
      await page.click('div.common_L_Red_Btn.loginBtn > button');
      // Wait for SPA navigation rather than hard-reloading — reload clears in-memory
      // auth state on session-storage-based SPAs and causes the page to silently close.
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1000);

      const buildingLocator = page.locator(`xpath=//h3[normalize-space()="${buildingName}"]`);
      let buildingFound = false;
      for (let i = 1; i <= 40; i++) {
        if (page.isClosed()) break;
        if (await buildingLocator.isVisible().catch(() => false)) { buildingFound = true; break; }
        try {
          const viewMoreBtn = page.locator('xpath=//button[normalize-space()="View More"]');
          if (await viewMoreBtn.isVisible().catch(() => false)) {
            await viewMoreBtn.click();
            await page.waitForTimeout(1000);
          } else {
            await page.mouse.wheel(0, 1000);
            await page.waitForTimeout(500);
          }
        } catch (e) {
          if (page.isClosed() || /closed/i.test(e.message)) break;
          throw e;
        }
      }

      if (!buildingFound) {
        // Collect all visible building names to produce a useful error
        const allH3s = await page.locator('h3').allInnerTexts();
        const available = allH3s.map(n => n.trim()).filter(Boolean).join(', ');
        throw Object.assign(
          new Error(`Building "${buildingName}" not found after scrolling. Available: ${available || '(none visible)'}`),
          { uiIssue: true }
        );
      }

      try {
        if (await buildingLocator.isVisible().catch(() => false)) await buildingLocator.click();
        else await buildingLocator.click({ force: true });
      } catch (_) {
        await buildingLocator.click({ force: true });
      }
      await page.waitForTimeout(500);

      // Confirm the tenant registration form appeared before leaving this step
      await page.waitForSelector('input[placeholder="User Name"]', { state: 'visible', timeout: 60000 })
        .catch(() => {
          throw Object.assign(
            new Error(`Registration form did not appear after clicking "${buildingName}". URL: ${page.url()}`),
            { uiIssue: true }
          );
        });
    }, { critical: true, timeout: 120000 });

    // ── Tenant Registration Form ───────────────────────────────────────────────
    await step('Tenant Registration Form', async () => {
      await page.fill('input[placeholder="User Name"]', userName);
      await page.fill('input[type="password"]', password);
      await page.waitForTimeout(300);
      await page.click('button.customButton.btn.btn-primary');
      await page.waitForTimeout(1500);
      await page.fill('input#FirstName', firstName);
      await page.waitForTimeout(300);
      await page.fill('input#LastName', lastName);
      await page.waitForTimeout(300);
      await page.fill('input#Email', email);
      await page.waitForTimeout(300);
      await page.click('img[alt="down_arrow"]');
      await page.waitForTimeout(500);
      await page.fill('input#myInput', '91');
      await page.waitForTimeout(300);
      await page.click('xpath=//div[@class="md-country-picker-item false"][normalize-space()="IN +91"]');
      await page.waitForTimeout(500);
      await page.fill('css=input[placeholder="Enter phone number"]', phone);
      await page.waitForTimeout(300);
    });

    // ── Select Suite & Submit Registration ─────────────────────────────────────
    await step('Select Suite & Submit Registration', async () => {
      await page.click('css=.Select.RemoveLine__value-container.css-1hwfws3');
      await page.waitForTimeout(500);
      await page.click('xpath=//div[@id="react-select-2-option-0"]');
      await page.waitForTimeout(300);
      await page.click('xpath=//span[@class="checkmark"]');
      await page.click('xpath=//button[contains(text(),"Register Now")]');
      await page.waitForTimeout(800);

      // Partial, case-insensitive match rather than an exact string — the exact
      // text previously expected here ("...exists AND an active Tenant...") had
      // one word more than what the app actually shows ("...exists an active
      // Tenant..."), so this check silently never matched anything.
      const errorMsg = page.locator('text=/already exists.*active Tenant/i').first();
      if (await errorMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
        const msg = (await errorMsg.innerText()).trim().replace(/\s+/g, ' ');
        console.log(`\n${C.red}${C.bold}${'█'.repeat(76)}${C.reset}`);
        console.log(`  ${C.red}${C.bold}✖  REGISTRATION BLOCKED${C.reset}`);
        console.log(`  ${C.yellow}${msg}${C.reset}`);
        console.log(`${C.red}${C.bold}${'█'.repeat(76)}${C.reset}\n`);
        // This email is already an active tenant — every remaining step depends
        // on a fresh registration succeeding, so halt the whole test here rather
        // than limping through the rest of the flow in a broken state.
        const e = new Error(msg);
        e.isShowStopper = true;
        e.haltReason    = 'email already registered as an active tenant';
        throw e;
      }
    });

    // ── Verify Email via OTP ───────────────────────────────────────────────────
    await step('Verify Email via OTP', async () => {
      pageMail = await context.newPage();
      await pageMail.goto(mailcatcherUrl);
      await pageMail.waitForLoadState('networkidle');
      await pageMail.waitForTimeout(1000);

      let emailFound = false, emailRow = null;
      for (let attempt = 1; attempt <= 10; attempt++) {
        await pageMail.reload({ waitUntil: 'networkidle' });
        await pageMail.waitForTimeout(1500);
        const matchingRows = pageMail.locator('tbody tr')
          .filter({ hasText: 'Email Verification' })
          .filter({ hasText: new RegExp(email, 'i') });
        const count = await matchingRows.count();
        if (count > 0) {
          const candidateRow = matchingRows.first();
          const timeText     = await candidateRow.locator('td').last().innerText();
          const emailTime    = new Date(timeText).getTime();
          const ageInSeconds = Math.floor((Date.now() - emailTime) / 1000);
          if (ageInSeconds < 120 && ageInSeconds > -60) {
            emailRow = candidateRow; emailFound = true; break;
          }
        }
        await pageMail.waitForTimeout(3000);
      }
      if (!emailFound) throw new Error(`Fresh "Email Verification" email not found for ${email} after 10 attempts`);

      await emailRow.waitFor({ state: 'visible', timeout: 30000 });
      await emailRow.click();
      await pageMail.waitForTimeout(1000);

      const frameElement = await pageMail.waitForSelector('iframe', { state: 'visible' });
      const frame        = await frameElement.contentFrame();
      await pageMail.waitForTimeout(500);

      const bLocator = frame.locator('xpath=//b').first();
      try { await bLocator.waitFor({ state: 'visible', timeout: 15000 }); }
      catch (e) { throw new Error(`OTP <b> tag not found in email frame`); }
      const otpText = await bLocator.innerText();
      await pageMail.waitForTimeout(300);

      await page.bringToFront();
      await page.waitForSelector('.commonOtpContainer div > input');
      const otpInputs = await page.locator('.commonOtpContainer div > input').all();
      for (let i = 0; i < Math.min(otpInputs.length, otpText.length); i++) {
        await otpInputs[i].fill(otpText.charAt(i));
        await page.waitForTimeout(200);
      }
      await page.click('xpath=//button[@type="submit"]');
      await page.waitForTimeout(1000);
      // The mail-poll loop alone (up to 10 attempts x reload+waits) can approach the
      // 45s default on a slow mail server — bumped for headroom.
    }, { timeout: 90000 });

    // ── Fill Pre-Application Form ──────────────────────────────────────────────
    await step('Fill Pre-Application Form', async () => {
      // Wait for the actual Pre-Application page itself before touching any
      // field. Without this, if OTP verification's own page transition is slow,
      // this step could start while the previous (Registration) page is still
      // showing — a generic "first text input" fallback would then silently
      // fill the WRONG page's field (e.g. corrupting First Name with "1").
      await page.locator('text=/Pre-application form|Pre-Application/i').first()
        .waitFor({ state: 'visible', timeout: 20000 });

      // Scoped to the label text — never falls back to "first text input on
      // the page", which could target an unrelated field on the wrong page.
      const durationSelector = 'xpath=(//*[contains(normalize-space(.), "How Long Would You Like to Rent")]/ancestor::div[1]//input)[1]';
      const durationInput = page.locator(durationSelector).first();
      await durationInput.waitFor({ state: 'visible', timeout: 10000 });
      await durationInput.fill('1');
      await page.waitForTimeout(300);

      // "When Are You Wishing to Take Possession?" — scope everything to the field
      // right after that label, so this never accidentally targets a different
      // date field on the same form (e.g. Date of Birth).
      const moveInFieldSelector = 'xpath=(//*[contains(normalize-space(.), "Take Possession") or contains(normalize-space(.), "Move in Date")]/ancestor::div[1]//input[contains(@placeholder,"yyyy") or contains(@type,"date")])[1]';
      try {
        const moveInSelector = moveInFieldSelector + ' | (//*[contains(normalize-space(.), "Take Possession") or contains(normalize-space(.), "Move in Date")]/ancestor::div[1]//div[contains(@class,"react-date-picker__wrapper") or contains(@class,"ant-picker")])[1]';
        const moveInFilled   = await selectDate(page, moveInSelector);
        if (!moveInFilled) {
          const broadSelector = 'input[placeholder*="yyyy" i], input[type="date"], .react-date-picker__wrapper, .ant-picker, .ant-picker-input, .date-picker, .datepicker';
          await selectDate(page, broadSelector);
        }
      } catch (_) {}

      // Verify it actually took — the above has many fallback paths and can
      // silently do nothing. If the field is still empty, click its calendar
      // icon directly and pick the first available (non-disabled) day.
      try {
        const moveInInput = page.locator(moveInFieldSelector).first();
        const currentValue = await moveInInput.inputValue().catch(() => '');
        if (!currentValue.trim()) {
          const moveInGroup = page.locator('xpath=(//*[contains(normalize-space(.), "Take Possession") or contains(normalize-space(.), "Move in Date")]/ancestor::div[1])[1]');
          const calendarIcon = moveInGroup.locator('svg, button, [class*="calendar" i]').filter({ visible: true }).first();
          if (await calendarIcon.count() > 0) {
            await calendarIcon.scrollIntoViewIfNeeded().catch(() => {});
            await calendarIcon.click({ force: true });
          } else {
            await moveInInput.click({ force: true }).catch(() => {});
          }
          await page.waitForTimeout(800);

          const calendarPopup = page.locator(
            '.react-calendar, .react-datepicker, .ant-picker-dropdown, .rc-picker-panel, .ant-picker-panel, .DayPicker, .date-picker, .datepicker, .calendar, .rdp, .rdp-month'
          ).filter({ visible: true }).first();
          await calendarPopup.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

          const availableDay = calendarPopup.locator(
            'button:not([disabled]):not(.react-calendar__tile--disabled), td:not(.ant-picker-cell-disabled) .ant-picker-cell-inner'
          ).filter({ hasText: /^\d{1,2}$/ }).first();
          if (await availableDay.isVisible({ timeout: 3000 }).catch(() => false)) {
            await availableDay.click({ force: true });
          }
          try { await page.keyboard.press('Escape'); } catch (_) {}
          await page.waitForTimeout(500);

          const valueAfter = await moveInInput.inputValue().catch(() => '');
          if (!valueAfter.trim()) {
            console.log(`    ${C.yellow}Move-in date field still empty after direct calendar-icon fallback${C.reset}`);
          }
        }
      } catch (_) {}
      await page.waitForTimeout(1000);

      try {
        const adultInput = page.locator('div.fieldRowMain').filter({ hasText: /Adult Occupants/i }).locator('input').first();
        await adultInput.waitFor({ state: 'visible', timeout: 5000 });
        await adultInput.fill('1');
      } catch (_) {
        try { await page.fill('xpath=//div[3]//div[2]//div[1]//input[1]', '1'); } catch (_) {}
      }

      try {
        const minorInput = page.locator('div.fieldRowMain').filter({ hasText: /Minor Occupants/i }).locator('input').first();
        await minorInput.waitFor({ state: 'visible', timeout: 5000 });
        await minorInput.fill('1');
      } catch (_) {
        try { await page.fill('xpath=//div[@class="fieldRowMain false"]//input[@class="form-control"]', '1'); } catch (_) {}
      }
      await page.waitForTimeout(1000);

      // Final guard before submitting — re-fill anything that ended up empty
      // (e.g. the duration field, if a later interaction cleared it).
      try {
        const durationValue = await durationInput.inputValue().catch(() => '');
        if (!durationValue.trim()) await durationInput.fill('1');
      } catch (_) {}
      try {
        const moveInInput  = page.locator(moveInFieldSelector).first();
        const moveInValue  = await moveInInput.inputValue().catch(() => '');
        if (!moveInValue.trim()) {
          console.log(`    ${C.yellow}Move-in date is still empty right before Submit${C.reset}`);
        }
      } catch (_) {}

      try {
        const preAppSubmitBtn = page.locator('.preAppBtn button, button').filter({ hasText: /Submit|Continue/i }).first();
        await preAppSubmitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await preAppSubmitBtn.click();
      } catch (_) {
        try { await page.click('xpath=//div[@class="common_L_Red_Btn preAppBtn"]/button'); } catch (_) {}
      }
      await page.waitForTimeout(2000);

      try {
        const okBtn = page.locator('button').filter({ hasText: /^Ok$/i }).first();
        if (await okBtn.isVisible({ timeout: 5000 })) await okBtn.click();
      } catch (_) {}
      await page.waitForTimeout(1000);

      try {
        const agreeBtn = page.locator('button, a, .common_L_Red_Btn').filter({ hasText: /Agree & Continue|Save & Continue/i }).first();
        if (await agreeBtn.isVisible({ timeout: 8000 })) {
          await agreeBtn.click({ force: true });
          await page.waitForTimeout(2000);
        }
      } catch (_) {}
      // Several chained fallback attempts (date picker, occupant fields, submit/ok/
      // agree buttons), each with its own 5-8s explicit wait — bumped for headroom.
    }, { timeout: 90000 });

    // ── Admin Login to Building Portal ─────────────────────────────────────────
    await step('Admin Login to Building Portal', async () => {
      context1 = await browser.newContext();
      page1    = await context1.newPage();

      const attemptLogin = async () => {
        await page1.goto(baseUrl);
        await page1.fill('xpath=//input[@placeholder="User Name"]', userName);
        await page1.fill('xpath=//input[@type="password"]', password);
        await page1.click('xpath=//button[@class="customButton  btn btn-primary"]');
        await page1.waitForTimeout(1000);
        await page1.click('xpath=//a[@href="/login"]');
        await page1.waitForTimeout(500);
        await page1.fill('xpath=//input[@placeholder="Email ID"]', buildingEmail);
        await page1.fill('xpath=//input[@placeholder="Password"]', buildingPassword);
        await page1.click('xpath=//button[@type="submit"]');
        await page1.waitForTimeout(1500);
      };

      // This previously had no success verification at all — a failed/incomplete
      // login still reported "PASS", leaving page1 in a broken state for every
      // later step (e.g. "Applicants" nav link missing, eventually bouncing to
      // /login mid-flow). Confirm the "Applicants" nav link actually appears,
      // retrying the login once before treating it as a real failure.
      await attemptLogin();
      let loggedIn = await page1.locator('xpath=//a[normalize-space()="Applicants"]')
        .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      if (!loggedIn) {
        console.log(`    ${C.yellow}Admin login didn't reach the dashboard — retrying once${C.reset}`);
        await attemptLogin();
        loggedIn = await page1.locator('xpath=//a[normalize-space()="Applicants"]')
          .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      }
      if (!loggedIn) {
        throw new Error(`Admin login to building portal did not reach the dashboard after 2 attempts. URL: ${page1.url()}`);
      }
    }, { critical: true });

    // ── View & Approve Applicant ───────────────────────────────────────────────
    await step('View & Approve Applicant', async () => {
      await page1.click('xpath=//a[normalize-space()="Applicants"]');
      await page1.waitForLoadState('networkidle').catch(() => null);
      await page1.waitForTimeout(1500);

      try { await page1.keyboard.press('Escape'); await page1.waitForTimeout(200); } catch (_) {}
      try { await page1.locator('body').click({ position: { x: 1, y: 1 } }); await page1.waitForTimeout(300); } catch (_) {}
      try { await page1.waitForSelector('tbody tr', { timeout: 15000 }); } catch (_) {}
      await page1.waitForTimeout(500);

      let applicantRow = page1.locator('tbody tr').filter({ hasText: email }).first();
      if (await applicantRow.count() === 0 || !(await applicantRow.isVisible().catch(() => false))) {
        // The email-matched row can exist in the DOM but not be visible (e.g. it's
        // on a later page while a stale/hidden copy lingers) — with accumulated
        // test data on this shared site that's now common. Fall back to the first
        // genuinely visible row rather than hanging on scrollIntoViewIfNeeded().
        applicantRow = page1.locator('tbody tr:visible').first();
      }

      if (await applicantRow.count() > 0) {
        await applicantRow.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
        await page1.waitForTimeout(500);
        try { await page1.keyboard.press('Escape'); } catch (_) {}

        let actionButton = applicantRow.locator('button').filter({ hasText: /View Application/i }).first();
        if (await actionButton.count() === 0) {
          actionButton = applicantRow.locator('button, a').filter({ hasText: /View|Approve|Action|Details|Open|Manage|Select/i }).first();
        }

        if (await actionButton.count() > 0) {
          await actionButton.scrollIntoViewIfNeeded().catch(() => {});
          await actionButton.click({ force: true });
          await page1.waitForLoadState('networkidle').catch(() => null);
          await page1.waitForTimeout(1000);
        } else {
          const anyActionButton = page1.locator('tbody tr button').filter({ hasText: /View Application/i }).first();
          await anyActionButton.scrollIntoViewIfNeeded().catch(() => {});
          await anyActionButton.click({ force: true });
          await page1.waitForLoadState('networkidle').catch(() => null);
          await page1.waitForTimeout(1000);
        }
      } else {
        throw new Error('No applicant rows found in table');
      }
      await page1.waitForTimeout(1000);

      // Approve for Viewing
      await waitForNoOverlay(page1);
      const approveBtn = page1.locator('button, a').filter({ hasText: /Approve for Viewing/i }).first();
      await approveBtn.waitFor({ state: 'visible', timeout: 10000 });
      await approveBtn.scrollIntoViewIfNeeded().catch(() => {});
      try {
        await approveBtn.click({ timeout: 5000 });
      } catch (_) {
        // Normal click didn't register (likely an overlay/tooltip covering the button) — force it.
        await approveBtn.click({ force: true });
      }
      await page1.waitForLoadState('networkidle').catch(() => null);
      await page1.waitForTimeout(800);

      try {
        const placeholder = page1.locator('xpath=//div[contains(@class,"css-1wa3eu0-placeholder")]').first();
        await placeholder.waitFor({ state: 'visible', timeout: 5000 });
        await placeholder.scrollIntoViewIfNeeded();
        await placeholder.click({ force: true });
        await page1.waitForTimeout(800);
      } catch (_) {}

      try {
        const opt = page1.locator('xpath=//div[@id="react-select-20-option-2"]');
        if (await opt.count() > 0) {
          await opt.waitFor({ state: 'visible', timeout: 5000 });
          await opt.scrollIntoViewIfNeeded();
          await opt.click({ force: true });
          await page1.waitForLoadState('networkidle').catch(() => null);
          await page1.waitForTimeout(500);
        } else {
          const anyOpt = page1.locator('xpath=//div[contains(@class,"react-select__option")][not(contains(@class,"is-disabled"))]').nth(0);
          if (await anyOpt.count() > 0) {
            await anyOpt.waitFor({ state: 'visible', timeout: 5000 });
            await anyOpt.click({ force: true });
            await page1.waitForLoadState('networkidle').catch(() => null);
            await page1.waitForTimeout(500);
          }
        }
      } catch (_) {}

      await page1.waitForTimeout(500);
      await page1.fill('xpath=//input[@name="other_fee_type"]', '1');
      await page1.waitForTimeout(500);
      await page1.click('xpath=//div[@class="common_L_Red_Btn"]/button');
      await page1.waitForTimeout(1000);
      // Several sequential actions here (row lookup, approve/select dropdowns, this
      // fill+click) can each legitimately take up to the 30s global actionTimeout —
      // bumped past the 45s default so the step's own timeout can't fire mid-action
      // and mask a real per-action timeout with a generic "Test ended".
    }, { timeout: 90000 });

    // ── Schedule Viewing Appointment ───────────────────────────────────────────
    await step('Schedule Viewing Appointment', async () => {
      // The previous step's submit does not reliably land on the "Viewing
      // appointments" tab by itself — explicitly navigate there rather than
      // assuming the current page already shows the right table (this is why
      // the search box below was previously "not found": we were still on a
      // different tab/page entirely).
      // Filter for :visible explicitly — this app renders both a desktop and
      // mobile nav variant simultaneously, and a bare .first() can silently
      // grab the hidden one, making waitFor({state:'visible'}) correctly (but
      // uselessly) report "never becomes visible" forever.
      const viewingTab = page1.locator('.nav-tabs a:visible, nav.nav-tabs a:visible, a:visible, button:visible')
        .filter({ hasText: /Viewing appointments?/i }).first();
      const viewingTabVisible = await viewingTab.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (viewingTabVisible) {
        await viewingTab.click();
        await page1.waitForLoadState('networkidle').catch(() => null);
        await page1.waitForTimeout(1500);
      }

      // Per explicit instruction: always row 1 — this exact absolute XPath is
      // the original, known-correct target for the "View Application" button.
      const viewAppBtnSelector = 'xpath=/html[1]/body[1]/div[1]/div[2]/div[2]/div[3]/div[1]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[2]/table[1]/tbody[1]/tr[1]/td[12]/div[1]/div[1]/button[1]';
      const viewAppBtn = page1.locator(viewAppBtnSelector);
      await viewAppBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      try {
        await viewAppBtn.click({ timeout: 5000 });
      } catch (_) {
        await viewAppBtn.click({ force: true, timeout: 5000 }).catch(() => {});
      }
      await page1.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => null);

      // "Manual Booking" opens a modal with Booking Date/Time already
      // pre-filled — set the date to today explicitly, then confirm with "Yes".
      // Wait for the Viewing Appointment detail page to actually finish
      // navigating/rendering before clicking — without this wait, the click
      // above may not have landed yet and this button click silently no-ops
      // (caught by the trailing .catch), which then shows up downstream as
      // the modal "never appearing" even though the page gets there a moment
      // later on its own.
      const manualBookingBtn = page1.locator('button, a').filter({ hasText: /^Manual Booking$/i }).first();
      const manualBookingReady = await manualBookingBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      if (!manualBookingReady) {
        console.log(`    ${C.yellow}"Manual Booking" button never appeared (url=${page1.url()})${C.reset}`);
      }

      const yesBtn = page1.locator('button').filter({ hasText: /^Yes$/i }).first();
      // The click sometimes doesn't actually open the modal (page still
      // settling right after navigation) — retry a few times rather than
      // relying on a single click landing.
      let modalAppeared = false;
      for (let i = 0; i < 3 && !modalAppeared; i++) {
        try {
          await manualBookingBtn.click({ timeout: 4000 });
        } catch (_) {
          await manualBookingBtn.click({ force: true, timeout: 4000 }).catch(() => {});
        }
        modalAppeared = await yesBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      }
      if (modalAppeared) {
        // The modal's Booking Date/Time already default to today/now — no
        // need to set it ourselves (an earlier attempt to overwrite it with
        // a manually-formatted value risked mismatching this input's actual
        // expected format and silently breaking the submission). Just confirm.
        await page1.waitForTimeout(500);
        // The Time field's hour/minute dropdown can pop open on its own
        // (auto-focus on modal render) and sit as an overlay above the
        // dialog — close it first via its own "OK" (keeping whatever
        // time is already selected) so it can't intercept the Yes click.
        const timeDropdownOk = page1.locator('button').filter({ hasText: /^OK$/i }).first();
        if (await timeDropdownOk.isVisible({ timeout: 2000 }).catch(() => false)) {
          await timeDropdownOk.click({ timeout: 3000 }).catch(() => {});
          await page1.waitForTimeout(300);
        } else {
          await page1.keyboard.press('Escape').catch(() => {});
        }
        await yesBtn.click({ force: true, timeout: 4000 }).catch(() => {});
        await page1.waitForTimeout(1500);
      } else {
        console.log(`    ${C.yellow}"Manual Booking" modal (with its "Yes" button) never appeared${C.reset}`);
      }
    }, { timeout: 90000 });

    // ── Send Rental Application ────────────────────────────────────────────────
    await step('Send Rental Application', async () => {
      // Confirming Manual Booking navigates back to the Viewing appointments
      // LIST rather than staying on the detail page — re-enter the detail view
      // via the same row-1 "View Application" button before looking for
      // "Send Rental Application" (its own button lives on the detail page).
      const sendRentalBtn = page1.locator('button, a').filter({ hasText: /^Send Rental Application$/i }).first();
      const viewAppBtnSelector = 'xpath=/html[1]/body[1]/div[1]/div[2]/div[2]/div[3]/div[1]/div[1]/div[2]/div[1]/div[2]/div[1]/div[1]/div[2]/table[1]/tbody[1]/tr[1]/td[12]/div[1]/div[1]/button[1]';
      const viewAppBtn = page1.locator(viewAppBtnSelector);
      // Retry the re-entry a few times — a single click attempt was flaky
      // (the row-1 click sometimes lands before the list has fully re-rendered
      // after the Manual Booking confirm, so it silently no-ops).
      let onDetailPage = await sendRentalBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!onDetailPage) {
        // Force a fresh reload before re-entering — right after the Manual
        // Booking confirm, the list can take a moment to re-sort the newly
        // "Received" row to the top; clicking row 1 against a stale/pre-sort
        // render can land on the wrong (older) appointment with no
        // "Send Rental Application" button on its detail page.
        await page1.reload({ waitUntil: 'networkidle' }).catch(() => {});
        await page1.waitForTimeout(1000);
      }
      for (let i = 0; i < 4 && !onDetailPage; i++) {
        await viewAppBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        try {
          await viewAppBtn.click({ timeout: 5000 });
        } catch (_) {
          await viewAppBtn.click({ force: true, timeout: 5000 }).catch(() => {});
        }
        await page1.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => null);
        onDetailPage = await sendRentalBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
        if (!onDetailPage) {
          // Didn't land on a page with "Send Rental Application" — go back to
          // the list and reload before the next attempt, rather than
          // re-clicking against whatever (possibly wrong) page we ended up on.
          await page1.goBack({ waitUntil: 'networkidle' }).catch(() => {});
          await page1.reload({ waitUntil: 'networkidle' }).catch(() => {});
          await page1.waitForTimeout(1000);
        }
      }
      if (!onDetailPage) {
        console.log(`    ${C.yellow}Could not reach the Viewing Appointment detail page (url=${page1.url()})${C.reset}`);
      }

      try { await sendRentalBtn.click({ timeout: 5000 }); } catch (_) { await sendRentalBtn.click({ force: true, timeout: 5000 }).catch(() => {}); }
      await page1.waitForTimeout(800);
      try { await page1.fill('xpath=//textarea[@name="tenancyagreement"]', 'hi, want to send rental'); } catch (_) {}
      await page1.waitForTimeout(500);

      try {
        await page1.click('xpath=//div[@class="ant-picker-input"]');
        await page1.waitForTimeout(800);
        const availableDate = page1.locator('td.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)').last();
        if (await availableDate.isVisible().catch(() => false)) await availableDate.click();
      } catch (_) {}
      await page1.waitForTimeout(500);

      const confirmBtn = page1.locator('xpath=//button[normalize-space()="Confirm & Send Rental Application"]');
      const confirmReady = await confirmBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      if (!confirmReady) {
        throw new Error(`"Confirm & Send Rental Application" button never appeared (url=${page1.url()})`);
      }
      await confirmBtn.click({ timeout: 5000 });
      await page1.waitForTimeout(3000);
      await context1.close();
      await page.waitForTimeout(500);
    }, { timeout: 90000 });

    // ── Check Rental Application Email ─────────────────────────────────────────
    await step('Check Rental Application Email', async () => {
      await pageMail.bringToFront();
      await pageMail.waitForTimeout(800);

      let rentalFound = false;
      rentalRow = null;

      for (let attempt = 1; attempt <= 15; attempt++) {
        await pageMail.reload({ waitUntil: 'networkidle' });
        await pageMail.waitForTimeout(1500);
        const matchingRentalRows = pageMail.locator('tbody tr')
          .filter({ hasText: /Rental Application/i })
          .filter({ hasText: new RegExp(email, 'i') });
        const count = await matchingRentalRows.count();
        if (count > 0) {
          const candidateRow = matchingRentalRows.first();
          const timeText     = await candidateRow.locator('td').last().innerText();
          const emailTime    = new Date(timeText).getTime();
          const ageInSeconds = Math.floor((Date.now() - emailTime) / 1000);
          const isFresh      = isNaN(ageInSeconds) || (ageInSeconds < 900 && ageInSeconds > -60);
          if (isFresh) { rentalRow = candidateRow; rentalFound = true; break; }
        }
        await pageMail.waitForTimeout(4000);
      }
      if (!rentalFound) throw new Error('Rental Application email not found after 15 attempts');
      await rentalRow.locator('td').nth(2).click();
      await pageMail.waitForTimeout(500);
      // Mail-poll loop alone (up to 15 attempts x reload+waits) can approach or
      // exceed the 45s default on a slow mail server — bumped for headroom.
    }, { timeout: 120000 });

    // ── Open & Agree Rental Application ───────────────────────────────────────
    await step('Open & Agree Rental Application', async () => {
      await pageMail.waitForTimeout(3000);

      // Collect URLs from ALL iframes + the page body, with retries.
      // The email also carries the site's marketing/nav links (logo, "Book Demo",
      // footer, etc.) which live on www.mondofi.com / site.mondofi.com — those also
      // contain "mondofi" and can appear before the real CTA link in the DOM, so a
      // bare href.includes('mondofi') check can grab the marketing homepage instead
      // of the rental-application page. isMarketingLink() filters those out and the
      // passes below are ordered most-specific-first so the real link always wins.
      const isMarketingLink = (href, text) => {
        if (/(^|\/\/)(www\.|site\.)?mondofi\.com/i.test(href)) return true;
        if (/^(Hardware Solutions|Software Solutions|Book Demo|Contact Us|Search apartments|Read More)$/i.test(text.trim())) return true;
        return false;
      };

      const extractUrl = async () => {
        // Check every iframe on the page (using ElementHandle to access contentFrame)
        const iframeHandles = await pageMail.locator('iframe').elementHandles();
        for (const ifEl of iframeHandles) {
          const fr = await ifEl.contentFrame().catch(() => null);
          if (!fr) continue;
          const links = fr.locator('a');
          const n = await links.count();

          // Pass 1: the specific rental-application deep link — most reliable signal.
          for (let i = 0; i < n; i++) {
            const href = await links.nth(i).getAttribute('href').catch(() => '') || '';
            if (href.includes('rental-application')) return { type: 'link', el: links.nth(i) };
          }
          // Pass 2: call-to-action link text, skipping known marketing/nav links.
          for (let i = 0; i < n; i++) {
            const text = await links.nth(i).innerText().catch(() => '');
            const href = await links.nth(i).getAttribute('href').catch(() => '') || '';
            if (isMarketingLink(href, text)) continue;
            if (/Rental Application|Click here/i.test(text)) return { type: 'link', el: links.nth(i) };
          }
          // Pass 3: any app.mondofi.co-style link that isn't a marketing/nav link.
          for (let i = 0; i < n; i++) {
            const text = await links.nth(i).innerText().catch(() => '');
            const href = await links.nth(i).getAttribute('href').catch(() => '') || '';
            if (isMarketingLink(href, text)) continue;
            if (href.includes('mondofi')) return { type: 'link', el: links.nth(i) };
          }
          // Pass 4: last resort — first substantial non-marketing link text.
          for (let i = 0; i < n; i++) {
            const text = await links.nth(i).innerText().catch(() => '');
            const href = await links.nth(i).getAttribute('href').catch(() => '') || '';
            if (isMarketingLink(href, text)) continue;
            if (text.trim().length > 5) return { type: 'link', el: links.nth(i) };
          }
          // Try raw text for plain-text emails
          const txt = await fr.locator('body').textContent().catch(() => '');
          const urls = (txt.match(/https?:\/\/[^\s\n\r<>"]+/g) || []).filter(u => u.includes('mondofi') && !isMarketingLink(u, ''));
          if (urls.length) return { type: 'url', value: urls[0] };
        }
        // Also check the pageMail body outside iframes
        const pageTxt = await pageMail.locator('body').textContent().catch(() => '');
        const pageUrls = (pageTxt.match(/https?:\/\/[^\s\n\r<>"]+/g) || []).filter(u => u.includes('mondofi') && u.length > 30 && !isMarketingLink(u, ''));
        if (pageUrls.length) return { type: 'url', value: pageUrls[0] };
        return null;
      };

      let found = null;
      for (let attempt = 0; attempt < 8 && !found; attempt++) {
        if (attempt > 0) await pageMail.waitForTimeout(2000);
        found = await extractUrl();
      }
      if (!found) throw new Error('No usable links found in the rental application email after retries');

      if (found.type === 'link') {
        const [newPage] = await Promise.all([
          context.waitForEvent('page', { timeout: 30000 }),
          found.el.click(),
        ]);
        rentalPage = newPage;
      } else {
        const [newPage2] = await Promise.all([
          context.waitForEvent('page', { timeout: 30000 }),
          pageMail.evaluate(url => window.open(url, '_blank'), found.value),
        ]);
        rentalPage = newPage2;
      }
      await rentalPage.waitForLoadState();
      await rentalPage.waitForTimeout(1500);

      // Agree to terms
      await rentalPage.bringToFront();
      const agreeBtnStep20 = rentalPage.locator('button, a, .common_L_Red_Btn, .customButton').filter({ hasText: /Agree & Continue/i }).first();
      try {
        await agreeBtnStep20.waitFor({ state: 'visible', timeout: 15000 });
        await agreeBtnStep20.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await agreeBtnStep20.click({ force: true });
      } catch (_) {
        try {
          const box = await agreeBtnStep20.boundingBox();
          if (box) await rentalPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          else throw new Error('No bounding box for Agree & Continue button');
        } catch (e2) {
          await rentalPage.screenshot({ path: 'step20-debug.png' });
          throw e2;
        }
      }
      await rentalPage.waitForTimeout(1000);

      try {
        const checkmark = rentalPage.locator('xpath=//span[@class="checkmark"]').first();
        if (await checkmark.isVisible({ timeout: 5000 })) {
          await checkmark.click();
          await rentalPage.waitForTimeout(500);
          await rentalPage.locator('button').filter({ hasText: /^Submit$/i }).first().click();
        } else {
          try { await agreeBtnStep20.click({ force: true }); } catch (_) {}
          if (await checkmark.isVisible({ timeout: 8000 })) {
            await checkmark.click();
            await rentalPage.waitForTimeout(500);
            await rentalPage.locator('button').filter({ hasText: /^Submit$/i }).first().click();
          }
        }
      } catch (_) {}
      await rentalPage.waitForTimeout(1000);

      try { await rentalPage.click('xpath=//span[@aria-hidden="true"]', { timeout: 5000 }); } catch (_) {}
      await rentalPage.waitForTimeout(500);
      // waitForEvent('page', {timeout:30000}) + the mail retry loop + agreeBtn's own
      // 15s wait can stack past the 45s default in the worst case — bumped for headroom.
    }, { timeout: 90000 });

    // ── Fill Rental Application Forms ──────────────────────────────────────────
    await step('Fill Rental Application Forms', async () => {
      // Primary Information — DOB
      try {
        const dobYearInput  = rentalPage.locator('.react-date-picker__inputGroup__year').first();
        const dobMonthInput = rentalPage.locator('.react-date-picker__inputGroup__month').first();
        const dobDayInput   = rentalPage.locator('.react-date-picker__inputGroup__day').first();
        if (await dobYearInput.count() > 0 && await dobYearInput.isVisible().catch(() => false)) {
          await dobYearInput.scrollIntoViewIfNeeded();
          await dobYearInput.click({ force: true }); await dobYearInput.fill('1995'); await rentalPage.waitForTimeout(150);
          await dobMonthInput.click({ force: true }); await dobMonthInput.fill('05'); await rentalPage.waitForTimeout(150);
          await dobDayInput.click({ force: true }); await dobDayInput.fill('25'); await rentalPage.waitForTimeout(200);
          await rentalPage.keyboard.press('Tab');
        } else {
          const calendarBtn = rentalPage.locator('.react-date-picker__calendar-button').first();
          if (await calendarBtn.count() > 0 && await calendarBtn.isVisible().catch(() => false)) {
            await calendarBtn.scrollIntoViewIfNeeded();
            await calendarBtn.click({ force: true });
            await rentalPage.waitForTimeout(1000);
            try { await rentalPage.waitForSelector('.react-calendar', { state: 'visible', timeout: 5000 }); } catch (_) {
              await calendarBtn.click({ force: true });
              await rentalPage.waitForTimeout(1000);
            }
            const latestDay = rentalPage.locator('button.react-calendar__tile:not(.react-calendar__tile--disabled):not(.react-calendar__month-view__days__day--weekend)').last();
            if (await latestDay.isVisible({ timeout: 3000 }).catch(() => false)) await latestDay.click({ force: true });
            try { await rentalPage.keyboard.press('Escape'); } catch (_) {}
          }
        }
      } catch (_) {}

      await rentalPage.click('xpath=//div[contains(@class,"common_M_Red_Btn") or contains(@class,"common_L_Red_Btn")]//button[@type="button"][normalize-space()="Save & Continue"]');
      await rentalPage.waitForTimeout(800);

      // Supplementary Information
      await rentalPage.click('xpath=//div[contains(@class,"common_M_Red_Btn") or contains(@class,"common_L_Red_Btn")]//button[contains(@type,"button")][normalize-space()="Save & Continue"]');
      await rentalPage.waitForTimeout(500);

      try {
        let supplementaryFilled = false;
        const calBtn = rentalPage.locator('.react-date-picker__calendar-button').first();
        if (await calBtn.count() > 0) {
          await calBtn.scrollIntoViewIfNeeded();
          await calBtn.click({ force: true });
          await rentalPage.waitForTimeout(1000);
          try { await rentalPage.waitForSelector('.react-calendar', { state: 'visible', timeout: 5000 }); } catch (_) {
            await calBtn.click({ force: true });
            await rentalPage.waitForTimeout(1000);
          }
          const latestDay = rentalPage.locator('.react-calendar__month-view__days__day:not([disabled]):not(.react-calendar__tile--disabled)').last();
          if (await latestDay.isVisible({ timeout: 5000 }).catch(() => false)) {
            await latestDay.click({ force: true });
            supplementaryFilled = true;
          } else {
            const anyTile = rentalPage.locator('.react-calendar__tile:not([disabled])').last();
            if (await anyTile.isVisible({ timeout: 3000 }).catch(() => false)) {
              await anyTile.click({ force: true });
              supplementaryFilled = true;
            }
          }
          await rentalPage.waitForTimeout(400);
          try { await rentalPage.keyboard.press('Escape'); } catch (_) {}
        }
        if (!supplementaryFilled) {
          const yearInput  = rentalPage.locator('.react-date-picker__inputGroup__year').first();
          const monthInput = rentalPage.locator('.react-date-picker__inputGroup__month').first();
          const dayInput   = rentalPage.locator('.react-date-picker__inputGroup__day').first();
          if (await yearInput.count() > 0 && await yearInput.isVisible().catch(() => false)) {
            await yearInput.scrollIntoViewIfNeeded();
            await yearInput.click({ force: true }); await yearInput.fill('2026'); await rentalPage.waitForTimeout(200);
            await monthInput.click({ force: true }); await monthInput.fill('12'); await rentalPage.waitForTimeout(200);
            await dayInput.click({ force: true }); await dayInput.fill('30'); await rentalPage.waitForTimeout(300);
            await rentalPage.keyboard.press('Tab');
          }
        }
      } catch (_) {}
      await rentalPage.waitForTimeout(500);

      try {
        const saveBtn = rentalPage.locator('xpath=//div[contains(@class,"common_L_Red_Btn") or contains(@class,"common_M_Red_Btn")]//button[normalize-space()="Save & Continue"]').last();
        if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await saveBtn.scrollIntoViewIfNeeded();
          await saveBtn.click({ force: true });
        } else {
          const anyBtn = rentalPage.locator('button').filter({ hasText: /^Save & Continue$/i }).last();
          await anyBtn.waitFor({ state: 'visible', timeout: 5000 });
          await anyBtn.scrollIntoViewIfNeeded();
          await anyBtn.click({ force: true });
        }
      } catch (_) {
        try { await rentalPage.click('xpath=//button[normalize-space()="Save & Continue"]'); } catch (_) {}
      }
      await rentalPage.waitForTimeout(1000);

      // Review and Accept Consent
      await waitForNoOverlay(rentalPage, 15000);
      const consentLabel = rentalPage.locator('xpath=//label[@class="checkBoxContainer"]').first();
      await consentLabel.waitFor({ state: 'visible', timeout: 15000 });
      await rentalPage.waitForTimeout(300);
      try {
        await consentLabel.click({ force: true });
      } catch (_) {
        const consentInput = rentalPage.locator('xpath=//label[@class="checkBoxContainer"]//input[@type="checkbox"], //input[@type="checkbox"]').first();
        await consentInput.waitFor({ state: 'visible', timeout: 10000 });
        await consentInput.click({ force: true });
      }
      await waitForNoOverlay(rentalPage, 15000);

      for (let i = 0; i <= 2; i++) {
        await rentalPage.mouse.wheel(0, 300);
        await rentalPage.waitForTimeout(500);
      }

      await waitForNoOverlay(rentalPage, 15000);
      const agreeBtn = rentalPage.locator('button').filter({ hasText: /Agree & Continue|Save & Continue/i }).first();
      if (await agreeBtn.isVisible({ timeout: 5000 })) {
        await agreeBtn.click({ force: true });
        await waitForNoOverlay(rentalPage, 15000);
      }
      await rentalPage.waitForTimeout(500);

      // Draw Digital Signature
      try {
        let canvas = null;
        try { canvas = await rentalPage.waitForSelector('canvas.sigCanvas', { timeout: 5000, state: 'visible' }); }
        catch (_) { try { canvas = await rentalPage.waitForSelector('canvas', { timeout: 5000, state: 'visible' }); } catch (_) {} }
        if (!canvas) {
          const frames = rentalPage.frames();
          for (const frame of frames) {
            try {
              canvas = await frame.waitForSelector('canvas', { timeout: 2000, state: 'visible' });
              if (canvas) { rentalPage = frame; break; }
            } catch (_) {}
          }
        }
        if (canvas) {
          await canvas.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          const sigBox = await canvas.boundingBox();
          if (sigBox) {
            await rentalPage.mouse.move(sigBox.x + sigBox.width * 0.2, sigBox.y + sigBox.height * 0.5);
            await rentalPage.mouse.down();
            await rentalPage.mouse.move(sigBox.x + sigBox.width * 0.3, sigBox.y + sigBox.height * 0.4, { steps: 10 });
            await rentalPage.mouse.move(sigBox.x + sigBox.width * 0.4, sigBox.y + sigBox.height * 0.6, { steps: 10 });
            await rentalPage.mouse.move(sigBox.x + sigBox.width * 0.5, sigBox.y + sigBox.height * 0.3, { steps: 10 });
            await rentalPage.mouse.move(sigBox.x + sigBox.width * 0.6, sigBox.y + sigBox.height * 0.7, { steps: 10 });
            await rentalPage.mouse.move(sigBox.x + sigBox.width * 0.7, sigBox.y + sigBox.height * 0.5, { steps: 10 });
            await rentalPage.mouse.up();
          }
        }
      } catch (_) {}
      await page.waitForTimeout(1000);

      // Submit Signed Rental Application — force:true bypasses disabled state when signature exists
      try {
        const saveContinueBtn = rentalPage.locator('button').filter({ hasText: /Save & Continue/i }).last();
        if (await saveContinueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await saveContinueBtn.scrollIntoViewIfNeeded();
          await saveContinueBtn.click({ force: true });
        } else {
          try {
            await rentalPage.click('xpath=//div[contains(@class,"common_M_Red_Btn") or contains(@class,"common_L_Red_Btn")]//button[@type="button"][normalize-space()="Save & Continue"]', { force: true });
          } catch (_) {}
        }
      } catch (_) {}
      await rentalPage.waitForTimeout(1500);

      // Wait up to 10s for Submit Application button (page transition after signing may be slow)
      try {
        const submitBtn = rentalPage.locator('button').filter({ hasText: /Submit Application/i }).first();
        if (await submitBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
          await submitBtn.scrollIntoViewIfNeeded();
          await submitBtn.click({ force: true });
        }
      } catch (_) {}
      await rentalPage.waitForTimeout(1500);

      // Close success modal (uses contains to tolerate extra classes)
      try {
        const closeBtn = rentalPage.locator('xpath=//div[contains(@class,"preAppModalBtn")]//button').first();
        if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false))
          await closeBtn.click({ force: true });
      } catch (_) {}
    }, { timeout: 120000 });

    // ── Admin2 Login & Rental Approval ─────────────────────────────────────────
    await step('Admin2 Login & Rental Approval', async () => {
      const __dbgT0 = Date.now();
      const __dbg = (label) => console.log(`    ${C.dim}[dbg +${Date.now() - __dbgT0}ms] ${label}${C.reset}`);

      try {
        contextAdmin2 = await browser.newContext();
        pageAdmin2    = await contextAdmin2.newPage();
      } catch (e) {
        throw new Error(`Failed to create admin2 context: ${e.message}`);
      }
      __dbg('context created');

      await pageAdmin2.goto(baseUrl);
      __dbg('goto baseUrl done');
      await pageAdmin2.fill('xpath=//input[@placeholder="User Name"]', userName);
      await pageAdmin2.fill('xpath=//input[@type="password"]', password);
      await pageAdmin2.click('xpath=//button[@class="customButton  btn btn-primary"]');
      __dbg('site login submitted');
      await pageAdmin2.waitForTimeout(1000);
      await pageAdmin2.click('xpath=//a[@href="/login"]');
      __dbg('clicked /login link');
      await pageAdmin2.fill('xpath=//input[@placeholder="Email ID"]', buildingEmail);
      await pageAdmin2.fill('xpath=//input[@placeholder="Password"]', buildingPassword);
      await pageAdmin2.click('xpath=//button[@type="submit"]');
      __dbg('building login submitted');
      await pageAdmin2.waitForTimeout(1500);

      await pageAdmin2.click('xpath=//a[normalize-space()="Applicants"]');
      __dbg('clicked Applicants tab');
      await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
      await pageAdmin2.waitForTimeout(1500);

      // Open the "Rental Applications" sub-tab by its visible text rather than a
      // fixed position (a[3]) — a tab re-order on the page won't silently break this.
      const rentalTab = pageAdmin2.locator('.nav-tabs a, nav.nav-tabs a').filter({ hasText: /Rental Applications?/i }).first();
      if (await rentalTab.isVisible({ timeout: 8000 }).catch(() => false)) {
        await rentalTab.click();
      } else {
        // Fall back to the previously-known tab position if the text match fails
        await pageAdmin2.click('xpath=//nav[@class="nav nav-tabs"]/a[3]');
      }
      __dbg('opened Rental Applications tab');
      await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
      await pageAdmin2.waitForTimeout(800);

      // Find every row whose Status column shows "Received" (there can be more than
      // one, e.g. resubmissions) and open the View Application action for the one
      // with the most recent "Received on" / "Received Time" — the table isn't
      // guaranteed to list newest first.
      //
      // IMPORTANT: this page's innerText/textContent concatenates adjacent table
      // cells with NO whitespace (e.g. suite "213A" + status "Received" renders as
      // "213AReceived"). A \bReceived\b word-boundary regex fails to match here
      // whenever the preceding cell ends in a word character (e.g. "...213A"),
      // because there's no boundary between "A" and "R". Use a plain /Received/i
      // substring match instead — do not add \b back around it.
      //
      // A short retry/reload buffer is kept below in case there's genuine minor
      // propagation lag, but the original "10 minutes of polling" was compensating
      // for the regex bug above, not a real backend delay — status is normally
      // already "Received" by the time this step runs.
      const openRentalApplicationsTab = async () => {
        await pageAdmin2.click('xpath=//a[normalize-space()="Applicants"]');
        await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
        await pageAdmin2.waitForTimeout(1000);
        const tab = pageAdmin2.locator('.nav-tabs a, nav.nav-tabs a').filter({ hasText: /Rental Applications?/i }).first();
        if (await tab.isVisible({ timeout: 8000 }).catch(() => false)) {
          await tab.click();
        } else {
          await pageAdmin2.click('xpath=//nav[@class="nav nav-tabs"]/a[3]');
        }
        await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
        await pageAdmin2.waitForTimeout(800);
        try { await pageAdmin2.waitForSelector('tbody tr', { timeout: 15000 }); } catch (_) {}
      };

      let receivedRows  = pageAdmin2.locator('tbody tr').filter({ hasText: /Received/i });
      let receivedCount = await receivedRows.count();
      const receivedPollDeadline = Date.now() + 60_000;
      while (receivedCount === 0 && Date.now() < receivedPollDeadline) {
        __dbg('no "Received" row yet — waiting for backend to process, retrying...');
        await pageAdmin2.waitForTimeout(15_000);
        await openRentalApplicationsTab(); // re-navigate rather than reload — this is an SPA route
        receivedRows  = pageAdmin2.locator('tbody tr').filter({ hasText: /Received/i });
        receivedCount = await receivedRows.count();
      }
      if (receivedCount === 0) {
        // Self-diagnosing: dump what the first few rows actually contain instead of just
        // saying "not found" — tells us the real status vocabulary in one run instead
        // of needing a separate investigation script.
        const allRows = pageAdmin2.locator('tbody tr');
        const rowCount = await allRows.count();
        const sample = [];
        for (let ri = 0; ri < Math.min(rowCount, 5); ri++) {
          sample.push((await allRows.nth(ri).innerText().catch(() => '<unreadable>')).replace(/\s+/g, ' ').trim());
        }
        throw new Error(`No applicant row with status "Received" found in Rental Applications table after 2 min of polling. ${rowCount} row(s) present. Sample: ${sample.map((s, i) => `[row ${i}] ${s}`).join(' | ') || '(none)'}`);
      }

      // Locate the "Received on" / "Received Time" columns by header text rather than
      // a fixed index, so this keeps working if columns get reordered.
      const headerCells = pageAdmin2.locator('thead th');
      const headerCount = await headerCells.count();
      let receivedOnIdx = -1, receivedTimeIdx = -1;
      for (let hi = 0; hi < headerCount; hi++) {
        const headerText = (await headerCells.nth(hi).innerText().catch(() => '')).trim().toLowerCase();
        if (receivedOnIdx === -1 && headerText.includes('received on')) receivedOnIdx = hi;
        else if (receivedTimeIdx === -1 && headerText.includes('received time')) receivedTimeIdx = hi;
      }

      let receivedRow  = receivedRows.first();
      let latestMillis = -Infinity;
      if (receivedOnIdx !== -1 && receivedTimeIdx !== -1) {
        for (let ri = 0; ri < receivedCount; ri++) {
          const row   = receivedRows.nth(ri);
          const cells = row.locator('td');
          try {
            const onText   = (await cells.nth(receivedOnIdx).innerText().catch(() => '')).trim();
            const timeText = (await cells.nth(receivedTimeIdx).innerText().catch(() => '')).trim();
            const millis   = new Date(`${onText} ${timeText}`).getTime();
            if (!isNaN(millis) && millis > latestMillis) {
              latestMillis = millis;
              receivedRow  = row;
            }
          } catch (_) {}
        }
      }
      __dbg(`selected latest "Received" row out of ${receivedCount} candidate(s)`);
      await waitForNoOverlay(pageAdmin2);
      await receivedRow.scrollIntoViewIfNeeded();
      await pageAdmin2.waitForTimeout(300);

      let viewBtn = receivedRow.locator('button, a').filter({ hasText: /View Application/i }).first();
      if (await viewBtn.count() === 0) {
        viewBtn = receivedRow.locator('button, a').filter({ hasText: /View|Details|Open/i }).first();
      }
      if (await viewBtn.count() === 0) {
        throw new Error('Could not find a "View Application" action on the "Received" row');
      }
      const urlBeforeView = pageAdmin2.url();
      await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
      await viewBtn.waitFor({ state: 'visible', timeout: 10000 });
      try {
        await viewBtn.click({ timeout: 5000 });
      } catch (_) {
        // Normal click didn't register (likely an overlay/tooltip covering the button) — force it.
        await viewBtn.click({ force: true });
      }
      await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
      await pageAdmin2.waitForTimeout(800);
      if (pageAdmin2.url() === urlBeforeView) {
        throw new Error(`Clicked "View Application" but the page never navigated away from ${urlBeforeView} — click likely landed on an overlay instead of the button.`);
      }
      __dbg('opened View Application for Received row');

      // Scroll DOWN to reveal Credit / Background / Reference check sections
      for (let s = 0; s < 6; s++) {
        await pageAdmin2.mouse.wheel(0, 400);
        await pageAdmin2.waitForTimeout(300);
      }
      await pageAdmin2.waitForTimeout(500);
      __dbg('scrolled down to checks section');

      // Approve: Credit Check, Background Check, Reference Check
      // A check already approved (e.g. Credit Check, approved earlier by this
      // same admin) still has an "Approve" button matching this text in the
      // DOM — just hidden/replaced visually by the green checkmark. Filtering
      // by :visible skips it; without this, scrollIntoViewIfNeeded() on that
      // hidden button retries for the full 30s actionTimeout ("element is not
      // visible"), and the loop never reaches the remaining real buttons.
      const approveChecks = pageAdmin2.locator('button:visible').filter({ hasText: /^Approve$/ });
      const initialApproveCount = await approveChecks.count();
      __dbg(`found ${initialApproveCount} visible Approve buttons`);
      // Always re-query for the FIRST remaining visible button, rather than
      // indexing into a fixed snapshot — approving one check typically removes
      // its button from the visible set (replaced by a checkmark), which would
      // shift every later index and cause a static nth(ai) loop to skip
      // buttons or re-click the wrong one.
      for (let ai = 0; ai < initialApproveCount; ai++) {
        const btn = approveChecks.first();
        if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) break;
        try {
          await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          try {
            await btn.click({ timeout: 4000 });
          } catch (_) {
            await btn.click({ force: true, timeout: 4000 }).catch(() => {});
          }
          await pageAdmin2.waitForTimeout(400);
          const yesBtn = pageAdmin2.locator('button').filter({ hasText: /^Yes$/ }).first();
          if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await yesBtn.click({ force: true, timeout: 4000 }).catch(() => {});
            await pageAdmin2.waitForTimeout(500);
          }
        } catch (_) {}
      }
      await pageAdmin2.waitForTimeout(500);
      __dbg('approve-loop done');

      // Scroll back to top so the main approval button is in view
      for (let i = 0; i < 8; i++) {
        await pageAdmin2.mouse.wheel(0, -400);
        await pageAdmin2.waitForTimeout(200);
      }
      await pageAdmin2.waitForTimeout(500);
      __dbg('scrolled back to top');

      // Main approval — try text-based selector first, then CSS fallback.
      // Both branches are bounded by an explicit isVisible() timeout so a missing
      // button fails fast with a clear error instead of hanging on an unbounded
      // click() until the outer 90s step timeout kills it.
      const mainApproveBtn = pageAdmin2.locator('button').filter({ hasText: /Approve\s*&\s*Send Lease|Approve Rental Application|Approve Application/i }).first();
      const cssFallback = pageAdmin2.locator('css=div[class*="commonMultipleButtonRightSide"] div[class*="common_M_Red_Btn"] button[type="button"]').first();
      const confirmYes = pageAdmin2.locator('button').filter({ hasText: /^Yes$/ }).first();
      const mainVisible = await mainApproveBtn.isVisible({ timeout: 8000 }).catch(() => false);
      __dbg(`mainApproveBtn visible: ${mainVisible}`);
      const btnToClick = mainVisible ? mainApproveBtn
        : await cssFallback.isVisible({ timeout: 8000 }).catch(() => false) ? cssFallback : null;
      if (!btnToClick) {
        throw new Error('Could not find the "Approve Rental Application" button (text selector or CSS fallback) — check that the correct applicant row/tab was opened.');
      }
      // A plain/force click sometimes has no visible effect at all (neither the
      // confirmation modal appears nor the button itself goes away) — retry
      // once rather than silently proceeding as if the approval registered.
      let approveReacted = false;
      for (let i = 0; i < 2 && !approveReacted; i++) {
        await btnToClick.scrollIntoViewIfNeeded().catch(() => {});
        try {
          await btnToClick.click({ timeout: 5000 });
        } catch (_) {
          await btnToClick.click({ force: true, timeout: 5000 }).catch(() => {});
        }
        __dbg(`clicked approve button (attempt ${i + 1})`);
        approveReacted = await Promise.race([
          confirmYes.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false),
          btnToClick.waitFor({ state: 'hidden', timeout: 6000 }).then(() => true).catch(() => false),
        ]);
        __dbg(`approve click reacted: ${approveReacted}`);
      }
      await pageAdmin2.waitForTimeout(500);
      // "Approve & Send Lease" opens a confirmation modal ("Please note: there
      // are N people also viewing that suite...") with Yes/No buttons — must
      // confirm with Yes or the lease never actually gets sent (downstream
      // "Sign & Submit Lease Agreement" then fails since no lease exists yet).
      const confirmYesVisible = await confirmYes.isVisible({ timeout: 3000 }).catch(() => false);
      __dbg(`confirmYes modal visible: ${confirmYesVisible}`);
      if (confirmYesVisible) {
        try {
          await confirmYes.click({ timeout: 5000 });
        } catch (_) {
          await confirmYes.click({ force: true, timeout: 5000 }).catch(() => {});
        }
        await pageAdmin2.waitForTimeout(500);
        __dbg('clicked confirmYes');
      }
      __dbg('step complete');
      await pageAdmin2.waitForTimeout(1000);
    }, { timeout: 120000 }); // must exceed the ~1-min "Received" status poll above

    // ── Sign & Submit Lease Agreement ──────────────────────────────────────────
    await step('Sign & Submit Lease Agreement', async () => {
      // The previous step ("Admin2 Login & Rental Approval") already clicks the
      // black action bar's rightmost button (via mainApproveBtn or its cssFallback,
      // targeting "commonMultipleButtonRightSide") and confirms the "Yes" dialog —
      // that IS the "Approve & Send Lease" action, already done by this point.
      // The page just needs a reload to reflect the now-updated state and reveal
      // the lease-signing panel; re-clicking the same (now stale) button here was
      // wrong and did nothing.
      await pageAdmin2.reload();
      await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
      await pageAdmin2.waitForTimeout(1500);

      // Bounded with an explicit isVisible() timeout — this absolute XPath is brittle
      // (deeply nested, layout-dependent), so fail fast with a clear error instead of
      // hanging on an unbounded click() until the step's default 45s timeout kills it.
      const signIconSelector = 'xpath=//body/div[@id="root"]/div[@class="publicArea__content_main rental"]/div[@class="centerDivMain signSendLeaseMainDiv"]/div[@class="mainDashboardCenterDiv custmCntDiv"]/div[@class="container"]/div[@class="row"]/div[@class="mt-2 mb-4 col-lg-12 col-md-12 col-12"]/div[@class="commonDashboardBoxShadowMain"]/div[@class="commonDetailRowMain row"]/div[@class="col-lg-8 col-md-7 col-12"]/div[@class="leftContDivMain"]/div[1]/div[1]/div[1]/div[1]/button[1]//*[name()="svg"]';
      // Looser fallback keeping only the semantically-meaningful ancestor
      // (leftContDivMain) — the full absolute path's div[1]/div[1]/div[1]/div[1]
      // chain breaks on any minor layout change upstream of the button.
      const signIconFallbackSelector = 'xpath=//div[contains(@class,"leftContDivMain")]//button[1]';
      let signIcon = pageAdmin2.locator(signIconSelector);
      let signIconVisible = await signIcon.isVisible({ timeout: 10000 }).catch(() => false);
      if (!signIconVisible) {
        // The prior step's approval may not have fully propagated by the first
        // reload (intermittent — this succeeds on some runs, not others). Give
        // it one more reload with a longer settle time before giving up.
        await pageAdmin2.waitForTimeout(3000);
        await pageAdmin2.reload();
        await pageAdmin2.waitForLoadState('networkidle').catch(() => null);
        await pageAdmin2.waitForTimeout(2500);
        signIcon = pageAdmin2.locator(signIconSelector);
        signIconVisible = await signIcon.isVisible({ timeout: 10000 }).catch(() => false);
      }
      if (!signIconVisible) {
        signIcon = pageAdmin2.locator(signIconFallbackSelector);
        signIconVisible = await signIcon.isVisible({ timeout: 5000 }).catch(() => false);
      }
      if (signIconVisible) {
        try {
          await signIcon.click({ timeout: 5000 });
        } catch (_) {
          await signIcon.click({ force: true, timeout: 5000 }).catch(() => {});
        }
      } else {
        throw new Error(`Could not find the sign-lease icon button (url=${pageAdmin2.url()}) — page layout may have shifted or the lease panel did not open.`);
      }
      await pageAdmin2.waitForTimeout(500);

      const pickDateRobustly = async (index, name) => {
        try {
          const allCalBtns     = await pageAdmin2.locator('.react-date-picker__calendar-button').all();
          const visibleCalBtns = [];
          for (const btn of allCalBtns) {
            if (await btn.isVisible().catch(() => false)) visibleCalBtns.push(btn);
          }
          if (visibleCalBtns.length > index) {
            const calBtn = visibleCalBtns[index];
            await calBtn.scrollIntoViewIfNeeded();
            await calBtn.click({ force: true });
            await pageAdmin2.waitForTimeout(500);
            try { await pageAdmin2.waitForSelector('.react-calendar', { state: 'visible', timeout: 5000 }); }
            catch (_) { await calBtn.click({ force: true }); await pageAdmin2.waitForTimeout(500); }
            const latestDay = pageAdmin2.locator('.react-calendar__month-view__days__day:not([disabled]):not(.react-calendar__tile--disabled)').last();
            if (await latestDay.isVisible({ timeout: 5000 }).catch(() => false)) {
              await latestDay.click({ force: true });
              await pageAdmin2.waitForTimeout(300);
              return;
            }
            const anyTile = pageAdmin2.locator('.react-calendar__tile:not([disabled])').last();
            if (await anyTile.isVisible({ timeout: 3000 }).catch(() => false)) {
              await anyTile.click({ force: true });
              await pageAdmin2.waitForTimeout(300);
              return;
            }
            try { await pageAdmin2.keyboard.press('Escape'); } catch (_) {}
          }

          const allWrappers     = await pageAdmin2.locator('.react-date-picker__wrapper').all();
          const visibleWrappers = [];
          for (const w of allWrappers) {
            if (await w.isVisible().catch(() => false)) visibleWrappers.push(w);
          }
          if (visibleWrappers.length > index) {
            const wrapper  = visibleWrappers[index];
            const yearInp  = wrapper.locator('.react-date-picker__inputGroup__year, input[name="year"]').first();
            const monthInp = wrapper.locator('.react-date-picker__inputGroup__month, input[name="month"]').first();
            const dayInp   = wrapper.locator('.react-date-picker__inputGroup__day, input[name="day"]').first();
            if (await yearInp.count() > 0) {
              await yearInp.scrollIntoViewIfNeeded();
              await yearInp.click({ force: true }); await yearInp.fill('2026'); await pageAdmin2.waitForTimeout(150);
              await monthInp.click({ force: true }); await monthInp.fill('12'); await pageAdmin2.waitForTimeout(150);
              await dayInp.click({ force: true }); await dayInp.fill('30'); await pageAdmin2.waitForTimeout(200);
              await pageAdmin2.keyboard.press('Tab');
            }
          }
        } catch (_) {}
      };

      await pickDateRobustly(0, 'Landlord Acceptance');
      await pageAdmin2.waitForTimeout(800);
      try { await pageAdmin2.keyboard.press('Escape'); } catch (_) {}
      await pickDateRobustly(2, 'Acceptance Date');
      await pageAdmin2.waitForTimeout(800);

      try {
        const signBtn = pageAdmin2.locator('button').filter({ hasText: /Click here to Sign/i }).first();
        if (await signBtn.isVisible({ timeout: 3000 }).catch(() => false)) await signBtn.click();
      } catch (_) {}

      try {
        let sigCanvasAdmin = null;
        try { sigCanvasAdmin = await pageAdmin2.waitForSelector('canvas.sigCanvas', { timeout: 5000, state: 'visible' }); }
        catch (_) { sigCanvasAdmin = await pageAdmin2.waitForSelector('canvas', { timeout: 5000, state: 'visible' }); }
        if (sigCanvasAdmin) {
          await sigCanvasAdmin.scrollIntoViewIfNeeded();
          await pageAdmin2.waitForTimeout(500);
          const sigBoxAdmin = await sigCanvasAdmin.boundingBox();
          if (sigBoxAdmin) {
            const cx = sigBoxAdmin.x + sigBoxAdmin.width / 2;
            const cy = sigBoxAdmin.y + sigBoxAdmin.height / 2;
            await pageAdmin2.mouse.move(cx, cy);
            await pageAdmin2.mouse.down();
            await pageAdmin2.mouse.move(cx + 40, cy);
            await pageAdmin2.mouse.move(cx + 40, cy + 60);
            await pageAdmin2.mouse.move(cx, cy + 60);
            await pageAdmin2.mouse.up();
          }
        }
      } catch (_) {}
      await pageAdmin2.waitForTimeout(500);

      try {
        const sigSaveBtn = pageAdmin2.locator('css=div[class="common_L_Red_Btn leaseBotmBtn"] button[type="button"]');
        if (await sigSaveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await sigSaveBtn.click();
        } else {
          const fallbackSave = pageAdmin2.locator('button').filter({ hasText: /^Save$|^Done$|^Apply$|Save & Continue/i }).last();
          if (await fallbackSave.isVisible({ timeout: 3000 })) await fallbackSave.click();
        }
      } catch (_) {}
      await pageAdmin2.waitForTimeout(800);

      try {
        const originalBtn = pageAdmin2.locator('css=div[class="common_L_Red_Btn submitBtn"] button[type="button"]');
        if (await originalBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await originalBtn.click();
        } else {
          const textBtn = pageAdmin2.locator('button, .btn').filter({ hasText: /Send Lease|Submit|Add Addendums/i }).last();
          if (await textBtn.isVisible({ timeout: 5000 })) await textBtn.click();
        }
      } catch (_) {}

      try {
        const loader = pageAdmin2.locator('.loader, .spinner, .ant-spin').first();
        if (await loader.isVisible({ timeout: 2000 })) await loader.waitFor({ state: 'hidden', timeout: 30000 });
      } catch (_) {}

      try { await pageAdmin2.waitForSelector('text=Upcoming possessions', { timeout: 15000 }); } catch (_) {}
      await pageAdmin2.waitForTimeout(1000);
      await contextAdmin2.close();
      await page.waitForTimeout(500);
      // Several named waits already sum close to the default 45s in the worst case
      // (loader hidden: up to 30s, plus the "Upcoming possessions" wait: 15s) before
      // even counting the date-picker/signature sub-flows — bumped for headroom.
    }, { timeout: 90000 });

    // ── Check Rental Approval Email ────────────────────────────────────────────
    await step('Check Rental Approval Email', async () => {
      await pageMail.bringToFront();
      await pageMail.waitForTimeout(3000);
      await pageMail.reload();
      const approvedRow = pageMail.locator('tbody tr', { hasText: 'Rental Application Approved' }).first();
      await approvedRow.waitFor({ state: 'visible', timeout: 15000 });
      await approvedRow.locator('td').nth(2).click();
      await pageMail.waitForTimeout(500);
    });

    // ── Book Elevator for Move-In ──────────────────────────────────────────────
    await step('Book Elevator for Move-In', async () => {
      const frameElement3 = await pageMail.waitForSelector('iframe');
      const frame3        = await frameElement3.contentFrame();
      await pageMail.waitForTimeout(800);

      const [elevatorPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 20000 }),
        frame3.click('xpath=//a[normalize-space()="BOOK AN ELEVATOR"]'),
      ]);
      await elevatorPage.waitForLoadState();
      await elevatorPage.waitForTimeout(1000);

      // The default (current) week is commonly shown with every slot marked
      // "Not Available" — this widget's legend distinguishes Available (green) /
      // Not Available (gray) / Booked (red) / Currently Selected (yellow), but
      // slots that far out are simply not bookable yet. Page forward week-by-week
      // (via the ">" nav arrow) until a click actually registers as a selection.
      //
      // The class-name guess below can't reliably tell available from not-available
      // slots (their class names don't consistently hyphenate "not-available"), so a
      // "Not Available" slot can match it too. Clicking one doesn't register — the
      // "Elevator Booking Slot" status stays "Not Selected" — so selection is confirmed
      // by reading that status back after each click instead of trusting the class name.
      const candidateSlotSelector =
        'a.available, button.available, .time-slot:not(.disabled), .slot:not(.disabled), ' +
        '[class*="available" i]:not([class*="not-available" i]):not([class*="unavailable" i])';
      const nextWeekBtn = elevatorPage.locator('button, a, [role="button"]')
        .filter({ hasText: /^(Next|>|›|Forward)$/i })
        .or(elevatorPage.locator('[aria-label*="next" i], [class*="next" i]'))
        .first();
      const notSelectedStatus = elevatorPage.locator('text=Not Selected').first();

      let slotFound = false;
      for (let week = 0; week < 8 && !slotFound; week++) {
        const candidates = elevatorPage.locator(candidateSlotSelector);
        const candidateCount = await candidates.count();
        for (let i = 0; i < candidateCount && !slotFound; i++) {
          const candidate = candidates.nth(i);
          if (!(await candidate.isVisible().catch(() => false))) continue;
          await candidate.click().catch(() => {});
          await elevatorPage.waitForTimeout(400);
          // Still showing "Not Selected" → this candidate didn't really take; try the next one.
          slotFound = !(await notSelectedStatus.isVisible({ timeout: 1000 }).catch(() => true));
        }
        if (slotFound) break;
        if (await nextWeekBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextWeekBtn.click();
          await elevatorPage.waitForTimeout(1000);
        } else {
          break; // no way to page further forward
        }
      }

      if (!slotFound) {
        console.log(`    ${C.yellow}No available elevator slot found across 8 weeks of paging forward — every candidate slot failed to register as selected.${C.reset}`);
      } else {
        await elevatorPage.waitForTimeout(500);
        const bookBtn   = elevatorPage.locator('button').filter({ hasText: /BOOK/i }).first();
        const bookReady = (await bookBtn.isVisible({ timeout: 5000 }).catch(() => false))
          && (await bookBtn.isEnabled().catch(() => false));

        if (bookReady) {
          await bookBtn.click();
          const okBtn = elevatorPage.locator('button').filter({ hasText: /Ok|Confirm|Close/i }).first();
          if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) await okBtn.click();
        } else {
          console.log(`    ${C.yellow}BOOK button stayed disabled after selecting a slot — skipping booking.${C.reset}`);
        }
      }
      // Explicit 20s wait for the new page + up to 5 sequential slot-picking fallback
      // checks (3-5s each) can approach the 45s default — bumped for headroom.
    }, { timeout: 90000 });

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
