const { test, expect } = require('@playwright/test');
require('dotenv').config();

test.setTimeout(180000);

test('Delete Deactivated Buildings Flow', async ({ page }) => {

    const superAdminUrl = process.env.SUPER_ADMIN_URL || 'https://sadmin.mondofi.co/';
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'super_admin@yopmail.com';
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Zzex_KKNzW1Kyzmkmx47';

    // Step 1: Login
    await page.goto(superAdminUrl, { waitUntil: 'domcontentloaded' });
    await page.fill('xpath=//input[@placeholder="Email ID"]', superAdminEmail);
    await page.fill('xpath=//input[@placeholder="Password"]', superAdminPassword);
    await page.click('xpath=//button[@type="Submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    for (let i = 0; i < 3; i++) {

        // Step 2: Go to Buildings tab and wait for table to fully render
        const buildingsTab = page.locator('a, span, button').filter({ hasText: /^Buildings$/ }).first();
        await buildingsTab.waitFor({ state: 'visible', timeout: 10000 });
        await buildingsTab.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Step 3: Hover over View button then click deliberately
        const viewBtn = page.getByRole('row')
            .filter({ has: page.getByRole('button', { name: /^View$/ }) })
            .first()
            .getByRole('button', { name: /^View$/ });
        await viewBtn.waitFor({ state: 'visible', timeout: 20000 });
        await viewBtn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);
        await viewBtn.hover();
        await page.waitForTimeout(1000);
        await viewBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Step 4: Guard — if detail page shows "No data found", go back and retry next iteration
        const noDataVisible = await page
            .locator('h5, h6, p').filter({ hasText: /No data found/i }).first()
            .isVisible({ timeout: 3000 }).catch(() => false);
        if (noDataVisible) {
            await page.goBack();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000);
            continue;
        }

        // Step 4 continued: Click De-Activate
        const deactivateBtn = page.locator('button').filter({ hasText: /De.?Activate/i }).first();
        await deactivateBtn.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForTimeout(1000);
        await deactivateBtn.click();

        // Step 5: Confirm deactivation dialog
        const confirmYesBtn = page.locator('button').filter({ hasText: /^Yes$/i }).first();
        await confirmYesBtn.waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(500);
        await confirmYesBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Step 6: Go to Deactivated Buildings tab and wait for table
        const deactivatedTab = page.locator('a, span, button').filter({ hasText: /^Deactivated Buildings$/ }).first();
        await deactivatedTab.waitFor({ state: 'visible', timeout: 10000 });
        await deactivatedTab.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Step 7: Hover over View button in deactivated list then click
        const deactivatedViewBtn = page.getByRole('row')
            .filter({ has: page.getByRole('button', { name: /^View$/ }) })
            .first()
            .getByRole('button', { name: /^View$/ });
        if (!await deactivatedViewBtn.isVisible({ timeout: 8000 }).catch(() => false)) continue;
        await deactivatedViewBtn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);
        await deactivatedViewBtn.hover();
        await page.waitForTimeout(1000);
        await deactivatedViewBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Step 8: Click Delete
        const deleteBtn = page.locator('button').filter({ hasText: /^Delete$/i }).first();
        await deleteBtn.waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(1000);
        await deleteBtn.click();

        // Step 9: Confirm deletion
        const deleteYesBtn = page.locator('button').filter({ hasText: /^Yes$/i }).first();
        await deleteYesBtn.waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(500);
        await deleteYesBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        break;
    }
});
