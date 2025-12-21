import { test, expect } from '@playwright/test';

// Simple smoke test to verify app renders and basic contracts
test('Smoke Test: App Renders and Telemetry Active', async ({ page }) => {
    // 1. Visit Home
    await page.goto('/');

    // 2. Check title or critical element
    await expect(page).toHaveTitle(/EUM|Extractos/);

    // 3. Check for BuildStamp (Contract)
    // Wait for it to be visible
    const buildStamp = page.locator('[data-testid="build.stamp"]');
    // It might be hidden or small, but should be in DOM. 
    // If it's visible, use toBeVisible. If just in DOM, toHaveCount(1).
    // Assuming it's visible in footer or somewhere.
    await expect(buildStamp).toHaveCount(1);

    // 4. Verify Telemetry Trace ID in Session Storage
    // We need to wait a bit for logs/telemetry to init
    await page.waitForTimeout(1000);

    const traceId = await page.evaluate(() => {
        return sessionStorage.getItem('eum_trace_id');
    });

    console.log('Trace ID:', traceId);
    expect(traceId).toBeTruthy();
    // Allow any non-empty string since implementation might vary (UUID or custom)
    expect(traceId?.length).toBeGreaterThan(0);
});
