import { test, expect } from '@playwright/test';

// Simple smoke test to verify app renders and basic contracts
test('Smoke Test: App Renders and Telemetry Active', async ({ page }) => {
    // 1. Visit Home
    await page.goto('/');

    // 2. Check title or critical element
    await expect(page).toHaveTitle(/EUM|Extractos/);

    // 3. Check for BuildStamp (Contract) - only in non-production builds
    // In production, BuildStamp returns null, so we skip this check in CI
    if (!process.env.CI) {
        const buildStamp = page.locator('[data-testid="build.stamp"]');
        await expect(buildStamp).toHaveCount(1);
    }

    // 4. Verify the app has rendered by checking for root element
    const appRoot = page.locator('#root');
    await expect(appRoot).toBeAttached();

    // 5. Verify Telemetry Trace ID in Session Storage
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
