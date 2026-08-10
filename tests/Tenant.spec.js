const { test, expect } = require('@playwright/test');
require('dotenv').config();

// ─── Date / Calendar helpers ──────────────────────────────────────────────────

function formatDateAsIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function clickVisibleCalendarDay(page, dayNumber) {
  const dayString = String(dayNumber);
  const selectors = [
    `xpath=//button[not(@disabled) and normalize-space(.)="${dayString}"]`,
    `xpath=//div[not(contains(@class,"disabled")) and normalize-space(.)="${dayString}"]`,
    `xpath=//*[@role="gridcell" and not(contains(@aria-disabled,"true")) and normalize-space(.)="${dayString}"]`,
    `xpath=//button[contains(@class,"react-datepicker__day") and not(contains(@class,"--outside-month")) and normalize-space(.)="${dayString}"]`,
    `.react-calendar__tile--now`,
    `.react-calendar__month-view__days__day:not(.react-calendar__month-view__days__day--disabled)`,
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).filter({ visible: true });
    if (await locator.count() > 0) {
      await locator.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await locator.first().click({ force: true });
      return true;
    }
  }
  return false;
}

async function openCalendarAndSelectToday(page, inputLocator) {
  const today = new Date();
  await inputLocator.scrollIntoViewIfNeeded();
  await inputLocator.click({ force: true });
  await page.waitForTimeout(800);
  const clicked = await clickVisibleCalendarDay(page, today.getDate());
  if (clicked) return;
  const fallbackInput = page.locator('input[placeholder*="yyyy" i], input[type="date"]').filter({ visible: true }).first();
  if (await fallbackInput.count() > 0) {
    await fallbackInput.fill(formatDateAsIso(today));
    await fallbackInput.press('Enter');
  } else {
    await page.keyboard.type(formatDateAsIso(today));
    await page.keyboard.press('Enter');
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

test.describe('Tenant', () => {
  test('Tenant Registration Flow', async ({ page, context }) => {
    let {
      BASE_URL, USER_NAME, PASSWORD,
      FIRST_NAME, LAST_NAME, EMAIL, PHONE_NUMBER,
      MAILCATCHER_URL, MAILCATCHER_USER, MAILCATCHER_PASS,
      ADMIN_EMAIL, ADMIN_PASSWORD,
    } = process.env;

    BASE_URL = BASE_URL.trim();
    test.setTimeout(600000);
    page.on('console', msg => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));

    const uniqueEmail = (EMAIL || 'test@mondofi.co').replace('@', `${Date.now().toString().slice(-6)}@`);

    const results = [];
    const step    = makeStepRunner(results, page);

    console.log(`\n${HR_THICK}`);
    console.log(`  ${C.bold}Tenant Registration  ·  Full E2E Flow${C.reset}`);
    console.log(`  ${C.dim}Email: ${uniqueEmail}${C.reset}`);
    console.log(HR_THIN);
    console.log(`  ${'Step'.padEnd(38)}  Duration`);
    console.log(HR_THIN);

    // ── Stage Login ────────────────────────────────────────────────────────────
    await step('Stage Login', async () => {
      await page.goto(BASE_URL);
      await page.locator("//input[@placeholder='User Name']").fill(USER_NAME);
      await page.locator("//input[@placeholder='Password']").fill(PASSWORD);
      await page.locator("//button[@type='submit']").click();
      await page.waitForLoadState('networkidle');
    }, { critical: true });

    // ── Find Rental World Building ─────────────────────────────────────────────
    await step('Find Rental World Building', async () => {
      const buildingLink = page.getByRole('link', { name: 'Rental World', exact: true })
        .or(page.getByText('Rental World', { exact: false }).first());
      await expect(buildingLink).toBeVisible({ timeout: 60000 });
      await buildingLink.click();
      await page.waitForLoadState('networkidle');

      const appLoginInput = page.locator("//input[@placeholder='User Name']")
        .or(page.locator("//input[@placeholder='Email ID']"));
      const isAppLoginVisible = await appLoginInput.isVisible().catch(() => false);
      if (isAppLoginVisible) {
        await appLoginInput.fill(USER_NAME);
        await page.locator("//input[@placeholder='Password']").fill(PASSWORD);
        await page.locator("//button[@type='submit']").click();
        await page.waitForLoadState('networkidle');
      }
    });

    // ── Fill & Register Tenant Form ────────────────────────────────────────────
    await step('Fill & Register Tenant Form', async () => {
      await page.getByPlaceholder('Enter first name').fill(FIRST_NAME);
      await page.getByPlaceholder('Enter last name').fill(LAST_NAME);
      await page.getByPlaceholder('Enter email').fill(uniqueEmail);
      await page.getByPlaceholder('Enter phone number').fill(PHONE_NUMBER);
      await page.locator('div[class*="value-container"]').first().click();
      await page.locator('div[id*="option-0"]').click();
      await page.waitForTimeout(1000);
      await page.getByText(/Prior to submitting application/i).click({ force: true });
      await page.getByRole('button', { name: 'Register Now' }).click();
      await expect(page.getByText(/Please Verify Email/i)).toBeVisible({ timeout: 15000 });
    });

    // ── Extract OTP from Mailcatcher ───────────────────────────────────────────
    let otp = '';
    await step('Extract OTP from Mailcatcher', async () => {
      const mailPage = await context.newPage();
      const cleanPass = (MAILCATCHER_PASS || '').replace(/^["']/g, '').replace(/["']$/g, '');
      const urlObj   = new URL(MAILCATCHER_URL);
      urlObj.username = MAILCATCHER_USER || '';
      urlObj.password = cleanPass;

      await mailPage.goto(urlObj.toString(), { timeout: 45000, waitUntil: 'load' });

      const mcUser     = mailPage.locator('input[name="user"], input[placeholder*="User" i]').first();
      const mcPass     = mailPage.locator('input[type="password"]');
      const mcLoginBtn = mailPage.locator('button[type="submit"], input[type="submit"], button:has-text("Login")').first();
      if (await mcUser.isVisible({ timeout: 15000 })) {
        await mcUser.fill(MAILCATCHER_USER || '');
        await mcPass.fill(cleanPass);
        await mcLoginBtn.click();
        await mailPage.waitForLoadState('networkidle');
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await mailPage.goto(MAILCATCHER_URL);
          await mailPage.waitForLoadState('networkidle', { timeout: 30000 });
          await mailPage.reload({ waitUntil: 'networkidle' });
          await mailPage.waitForTimeout(5000);

          const row = mailPage.locator('tr').filter({ hasText: uniqueEmail }).first();
          if (await row.isVisible({ timeout: 10000 })) {
            await row.click();
            const iframe = mailPage.frameLocator('iframe').first();
            await expect(iframe.locator('body')).toContainText(/\b\d{4}\b/, { timeout: 15000 });
            const emailContent = await iframe.locator('body').innerText();
            const otpMatches   = emailContent.match(/\b\d{4}\b/g);
            if (otpMatches) {
              const currentYear = new Date().getFullYear().toString();
              otp = otpMatches.find(m => m !== currentYear && m !== '2026') || otpMatches[0];
              break;
            }
          }
        } catch (_) {}
        if (attempt < 3 && !otp) await mailPage.waitForTimeout(5000);
      }
      await mailPage.close();
      if (!otp) throw new Error(`Failed to extract OTP for ${uniqueEmail} after 3 attempts`);
    });

    // ── Verify OTP ─────────────────────────────────────────────────────────────
    await step('Verify OTP', async () => {
      await page.bringToFront();
      await expect(page.getByText(/Please Verify Email/i)).toBeVisible({ timeout: 15000 });
      const firstBox = page.getByLabel(/Character 1/i);
      await firstBox.click();
      await page.keyboard.type(otp, { delay: 100 });
      const verifyBtn = page.getByRole('button', { name: /Verify & Continue/i });
      await expect(verifyBtn).toBeEnabled({ timeout: 5000 });
      await verifyBtn.click();
    });

    // ── Fill Pre-Application Form ──────────────────────────────────────────────
    await step('Fill Pre-Application Form', async () => {
      await expect(page.getByText('Please fill Pre-application form below:')).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(2000);

      async function fillClosestInput(labelText, value) {
        const heading   = page.locator(`h5:has-text("${labelText}")`).last();
        const container = page.locator('div, section')
          .filter({ has: heading })
          .filter({ has: page.locator('input, [role="textbox"], [role="spinbutton"]') })
          .last();
        const locator = container.locator('input, [role="textbox"], [role="spinbutton"]').first();
        await expect(locator).toBeVisible({ timeout: 10000 });
        await locator.click({ force: true });
        if (value.match(/^\d+$/)) {
          await locator.fill('');
          await locator.type(value, { delay: 100 });
        } else {
          await locator.fill('');
          await locator.fill(value);
        }
        await locator.evaluate(el => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        });
      }

      await fillClosestInput('For How Long Would You Like to Rent', '1');

      try {
        const dateInput = page.locator(
          'input[placeholder="yyyy - mm - dd"], .react-date-picker__calendar-button, input[placeholder*="yyyy" i], input[type="date"]'
        ).first();
        await expect(dateInput).toBeVisible({ timeout: 15000 });
        await openCalendarAndSelectToday(page, dateInput);
      } catch (_) {}
      await page.keyboard.press('Escape');

      await fillClosestInput('How Many Adult Occupants', '1').catch(() => {});
      await fillClosestInput('How Many Minor Occupants', '2').catch(() => {});

      const selectNo = async (labelText) => {
        const heading   = page.locator('h5').filter({ hasText: new RegExp(labelText.replace(/[?*]/g, ''), 'i') }).last();
        const container = page.locator('div, section')
          .filter({ has: heading })
          .filter({ has: page.locator('label').filter({ hasText: /^No$/i }) })
          .last();
        await container.locator('label').filter({ hasText: /^No$/i }).click({ force: true });
        await container.locator('label').filter({ hasText: /^No$/i }).evaluate(el => {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        });
      };
      try {
        await selectNo('Do You Own Any Pets');
        await selectNo('Do You Smoke');
        await selectNo('Are You Employed');
      } catch (_) {}

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
      });
      await page.waitForTimeout(200);

      const submitBtn = page.getByRole('button', { name: 'Submit Pre-Application' }).last();
      const submissionPromise = page.waitForResponse(
        r => (r.url().includes('preApplication') || r.url().includes('pre-application')) && r.status() >= 200 && r.status() < 300,
        { timeout: 60000 }
      ).catch(() => {});

      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click({ force: true, delay: 200 }).catch(() => {});
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Submit Pre-Application'));
        if (btn) btn.click();
      }).catch(() => {});

      await Promise.race([
        submissionPromise,
        page.getByText(/Request Received/i).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      ]);

      const successModal = page.getByText(/Request Received/i);
      const okBtn        = page.getByRole('button', { name: 'Ok' });
      try {
        await expect(successModal).toBeVisible({ timeout: 5000 });
        await okBtn.click();
        await expect(successModal).toBeHidden({ timeout: 10000 });
      } catch (_) {
        await expect(page.getByText('Please fill Pre-application form below:')).toBeHidden({ timeout: 10000 }).catch(() => {});
      }
      await page.waitForTimeout(1000);
    });

    // ── Admin Approval ─────────────────────────────────────────────────────────
    await step('Admin Approval', async () => {
      const adminUrl = `${BASE_URL.replace(/\/$/, '')}/login`;
      await page.goto(adminUrl);
      await page.getByPlaceholder(/Email|User Name/i).fill(ADMIN_EMAIL);
      await page.getByPlaceholder(/Password/i).fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: /Login|Submit/i }).click();
      await page.waitForLoadState('networkidle');

      const applicantsLink = page.getByRole('link', { name: 'Applicants' });
      await expect(applicantsLink).toBeVisible({ timeout: 20000 });
      await applicantsLink.click();
      await page.waitForLoadState('networkidle');

      const preAppTab = page.getByRole('tab', { name: /Pre-applications|Pre apps/i });
      try {
        await preAppTab.waitFor({ state: 'visible', timeout: 10000 });
        await preAppTab.click({ force: true });
      } catch (_) {}

      const searchInput = page.locator('input[placeholder*="Search" i]').first();
      await expect(searchInput).toBeVisible({ timeout: 15000 });
      await searchInput.clear();
      await searchInput.fill(uniqueEmail);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      let row = page.locator('tr').filter({ hasText: uniqueEmail }).first();
      let isRowVisible = true;
      try { await row.waitFor({ state: 'visible', timeout: 10000 }); } catch (_) { isRowVisible = false; }

      if (!isRowVisible) {
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.getByRole('link', { name: 'Applicants' }).click();
        await page.getByRole('tab', { name: /Pre-applications|Pre apps/i }).click();
        const retrySearch = page.locator('input[placeholder*="Search" i]').first();
        await retrySearch.fill(uniqueEmail);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        row = page.locator('tr').filter({ hasText: uniqueEmail }).first();
      }

      await expect(row).toBeVisible({ timeout: 30000 });
      await row.getByRole('button', { name: /View Application/i }).click();
      await page.waitForLoadState('networkidle');

      const approveBtn = page.getByRole('button', { name: /Approve/i });
      await expect(approveBtn).toBeVisible({ timeout: 15000 });
      await approveBtn.click();

      try {
        const modal = page.locator('div[role="dialog"]').filter({ hasText: /Approve for Viewing/i });
        await expect(modal).toBeVisible({ timeout: 10000 });

        const suiteDropdown = modal.locator('div')
          .filter({ has: page.getByText(/Assign Suite No/i) })
          .locator('.css-1hwfws3, .value-container, [class*="-ValueContainer"]')
          .last();
        await suiteDropdown.scrollIntoViewIfNeeded();
        await suiteDropdown.click({ force: true });
        const firstOption = page.locator('[id*="-option-0"], .react-select__option');
        try {
          await expect(firstOption).toBeVisible({ timeout: 10000 });
          await firstOption.first().click();
        } catch (_) {
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        }

        const fillIfEditable = async (name, value) => {
          const input = modal.locator(`input[name="${name}"]`);
          if (await input.count() > 0 && await input.isEditable()) await input.fill(value);
        };
        await fillIfEditable('monthlyRent', '1200');
        await fillIfEditable('securityDeposit', '600');
        await fillIfEditable('petDamageDeposit', '0');

        const parkingNo = modal.locator('label').filter({ hasText: /^No$/i }).last();
        await parkingNo.click({ force: true });

        const confirmBtn = modal.getByRole('button', { name: /Confirm|Continue|Yes/i });
        await expect(confirmBtn).toBeVisible({ timeout: 5000 });
        await confirmBtn.click();
        await expect(modal).toBeHidden({ timeout: 15000 });
      } catch (_) {}
      await page.waitForTimeout(2000);
    });

    // ── Manual Booking ─────────────────────────────────────────────────────────
    await step('Manual Booking', async () => {
      const sendRentalBtnQuick = page.getByRole('button', { name: 'Send Rental Application' });
      if (await sendRentalBtnQuick.isVisible({ timeout: 5000 }).catch(() => false)) return;

      await page.getByRole('link', { name: 'Applicants' }).click();
      await page.waitForLoadState('networkidle');

      const viewingTab = page.getByRole('tab', { name: /Viewing appointments|Viewing Appts/i });
      await expect(viewingTab).toBeVisible({ timeout: 15000 });
      await viewingTab.click({ force: true });

      const viewingHeading = page.locator('h4, h5').filter({ hasText: /Viewing appointments/i }).first();
      try {
        await expect(viewingHeading).toBeVisible({ timeout: 10000 });
      } catch (_) {
        await viewingTab.click({ force: true });
        await expect(viewingHeading).toBeVisible({ timeout: 10000 });
      }
      await page.waitForLoadState('networkidle');

      const searchInputView = page.locator('input[placeholder*="Search" i]').filter({ visible: true }).first();
      await searchInputView.clear();
      await searchInputView.fill(uniqueEmail);
      await page.keyboard.press('Enter');

      const row = page.locator('tr').filter({ hasText: uniqueEmail }).first();
      await expect(row).toBeVisible({ timeout: 30000 });

      const viewBtn = row.locator('button, [role="button"], a').filter({ hasText: /View Application/i }).first();
      await viewBtn.scrollIntoViewIfNeeded();
      await viewBtn.click({ force: true, delay: 100 });

      const detailsLoaded = page.locator('button, a').filter({ hasText: /Back/i })
        .or(page.locator('button').filter({ hasText: /Manual Booking/i }));
      try {
        await expect(detailsLoaded.first()).toBeVisible({ timeout: 15000 });
      } catch (_) {
        await viewBtn.evaluate(b => b.click());
        await expect(detailsLoaded.first()).toBeVisible({ timeout: 15000 });
      }
      await page.waitForLoadState('load');

      const manualBookingBtn = page.getByRole('button', { name: 'Manual Booking' });
      await expect(manualBookingBtn).toBeVisible({ timeout: 15000 });
      await manualBookingBtn.click({ force: true });

      const manualYesBtn = page.locator('button').filter({ hasText: /^Yes$/i });
      await expect(manualYesBtn).toBeVisible({ timeout: 15000 });
      await manualYesBtn.click({ force: true });

      const approveModalTitle = page.getByText(/Approve for Viewing/i);
      if (await approveModalTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
        const confirmBtn = page.getByRole('button', { name: /Confirm|Yes/i }).first();
        await confirmBtn.click().catch(() => {});
      }

      await page.waitForTimeout(5000);
      await page.mouse.click(10, 10).catch(() => {});
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(5000);
    });

    // ── Send Rental Application ────────────────────────────────────────────────
    await step('Send Rental Application', async () => {
      async function handleRentalApplicationModal() {
        const modal = page.locator('div').filter({
          has: page.locator('h2, h3, h4, .modal-title').filter({ hasText: /Send Rental Application/i }),
        }).filter({ has: page.locator('textarea') }).last();
        await expect(modal).toBeVisible({ timeout: 20000 });

        const termsTextArea = modal.locator('textarea').first();
        await termsTextArea.fill('Please find my rental application. Ready to proceed with the tenancy.');

        const dateInput = modal.locator(
          'input[placeholder*="yyyy-mm-dd" i], input[placeholder*="yyyy" i], input[type="date"]'
        ).first();
        await expect(dateInput).toBeVisible({ timeout: 10000 });
        await openCalendarAndSelectToday(page, dateInput);
        await page.keyboard.press('Escape');

        const suiteDropdown = modal.locator('div')
          .filter({ hasText: /Assign Suite No/i })
          .locator('.css-1hwfws3, [class*="-ValueContainer"]')
          .first();
        if (await suiteDropdown.isVisible()) {
          const suiteText = await suiteDropdown.innerText();
          if (suiteText.includes('Select') || suiteText.trim() === '') {
            await suiteDropdown.click({ force: true });
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
          }
        }

        const fillMoney = async (label, val) => {
          const container = modal.locator('div').filter({
            has: page.locator('label').filter({ hasText: new RegExp(`^${label}`, 'i') }),
          }).first();
          const input = container.locator('input').first();
          if (await input.isVisible()) await input.fill(val);
        };
        await fillMoney('Monthly Rent', '1200');
        await fillMoney('Security Deposit', '600');
        await fillMoney('Pet Damage Deposit', '0');

        const parkingNo = modal.locator('label').filter({ hasText: /^No$/i }).first();
        if (await parkingNo.isVisible()) await parkingNo.click({ force: true });

        const water = modal.locator('label').filter({ hasText: /Water/i }).locator('input[type="checkbox"]');
        if (await water.isVisible() && !await water.isChecked()) await water.check({ force: true });

        const finalConfirmBtn = modal.getByRole('button', { name: /Confirm.*Send Rental Application/i });
        await expect(finalConfirmBtn).toBeEnabled({ timeout: 15000 });
        await finalConfirmBtn.click({ force: true });

        await expect(
          page.getByText(/Rental Application Sent/i).or(page.getByText(/Success/i))
        ).toBeVisible({ timeout: 30000 });
      }

      const sendBtn = page.locator('button').filter({ hasText: /^Send Rental Application$/i }).first();
      if (await sendBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await sendBtn.click({ force: true });
        try {
          await page.waitForSelector('div[role="dialog"], .modal-content, .modal-dialog', { timeout: 5000 });
        } catch (_) {
          await sendBtn.evaluate(b => b.click());
        }
        await handleRentalApplicationModal();
      } else {
        await page.getByRole('link', { name: 'Applicants' }).click();
        await page.waitForLoadState('networkidle');
        const tabsToTry = [/Rental applications/i, /Viewing appointments/i];
        let found = false;
        for (const tabName of tabsToTry) {
          const tab = page.getByRole('tab', { name: tabName });
          if (await tab.isVisible()) {
            await tab.click({ force: true });
            await page.waitForTimeout(2000);
            const searchInput = page.locator('input[placeholder*="Search" i]').filter({ visible: true }).first();
            await searchInput.clear();
            await searchInput.fill(uniqueEmail);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(3000);
            const row = page.locator('tr').filter({ hasText: new RegExp(uniqueEmail, 'i') }).first();
            if (await row.isVisible().catch(() => false)) {
              await row.locator('button, a').filter({ hasText: /View Application/i }).first().click({ force: true });
              await expect(sendBtn).toBeVisible({ timeout: 20000 });
              await sendBtn.click({ force: true });
              await handleRentalApplicationModal();
              found = true;
              break;
            }
          }
        }
        if (!found) throw new Error(`Could not find application for ${uniqueEmail} in any expected tab`);
      }
      await page.waitForTimeout(2000);
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
