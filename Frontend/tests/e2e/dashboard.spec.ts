
import { test, expect } from '@playwright/test';

test('has title &renders dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ChainWard|Orbit/);
    await expect(page.locator('h1')).toContainText('Incident Comm&Center');
});

test('can toggle theme with shortcut', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    const initialClass = await body.getAttribute('class');

    await page.keyboard.press('Alt+t');

    const updatedClass = await body.getAttribute('class');
    expect(updatedClass).not.toBe(initialClass);
});
