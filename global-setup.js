const { chromium } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const AUTH_FILE = path.resolve(__dirname, 'auth.json');
const AUTH_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour — re-login only when stale

/**
 * Global setup for Playwright tests.
 * Logs into the application once and saves the authentication state to `auth.json`.
 * Skips login if auth.json is fresh (< 1 hour old) to speed up repeated runs.
 */
module.exports = async function globalSetup() {
  // Skip re-login if auth.json exists and was written recently
  if (fs.existsSync(AUTH_FILE)) {
    const ageMs = Date.now() - fs.statSync(AUTH_FILE).mtimeMs;
    if (ageMs < AUTH_MAX_AGE_MS) {
      console.log(`[global-setup] auth.json is ${Math.round(ageMs / 1000)}s old — skipping login`);
      return;
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-default-browser-check',
      '--disable-component-extensions-with-background-pages',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const credentials = {
    userName: process.env.USER_NAME,
    userPassword: process.env.PASSWORD,
    daaEmail: process.env.DAA_EMAIL,
    daaPassword: process.env.DAA_PASSWORD,
  };

  const safeClick = async (selector) => {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ timeout: 5000 });
    } catch (e) {
      // ignore errors
    }
  };

  const isElementVisible = async (selector, timeout = 5000) => {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout });
      return true;
    } catch (e) {
      return false;
    }
  };

  // initial login
  await page.goto('https://app.mondofi.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('load').catch(() => {});
  await page.fill("//input[@placeholder='User Name']", credentials.userName, { timeout: 5000 });
  await page.fill("//input[@type='password']", credentials.userPassword, { timeout: 5000 });
  await safeClick('#Icon_ionic-md-eye-off');
  await safeClick("//button[@class='customButton  btn btn-primary']");

  // DAA login
  const isLoginLinkVisible = await isElementVisible("//a[@href='/login']", 5000);
  if (isLoginLinkVisible) {
    await safeClick("//a[@href='/login']");
  }

  const isEmailInputVisible = await isElementVisible("//input[@placeholder='Email ID']", 5000);
  if (isEmailInputVisible) {
    await page.fill("//input[@placeholder='Email ID']", credentials.daaEmail, { timeout: 5000 });
    await page.fill("//input[@placeholder='Password']", credentials.daaPassword, { timeout: 5000 });
    await safeClick("//button[@type='submit']");
    await page.waitForLoadState('load').catch(() => {});
  }

  // Wait for any loading spinner to clear before building selection
  await page.locator('.spinnerMainDiv').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

  // Select building - handle native <select> modal
  const isNativeSelectVisible = await isElementVisible("//select", 5000);
  if (isNativeSelectVisible) {
    await page.locator('select').first().selectOption({ index: 1 });
    await safeClick("//button[normalize-space()='Continue']");
  } else {
    // Fall back to React Select component (legacy UI)
    const isDropdownVisible = await isElementVisible("//div[contains(@class,'Select RemoveLine__value-container')]", 5000);
    if (isDropdownVisible) {
      await page.locator("//div[contains(@class,'Select RemoveLine__value-container')]").first().click({ timeout: 5000 });
      await safeClick("//div[@id='react-select-2-option-0']");
      await safeClick("//div[@class='common_L_Red_Btn']/button");
    }
  }

  // Save storage state
  await context.storageState({ path: 'auth.json' });
  await browser.close();
};
