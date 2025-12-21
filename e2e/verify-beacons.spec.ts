import { test, expect } from '@playwright/test';
import { UI } from '../frontend/src/telemetry/uiMap';
import { ROUTES } from '../frontend/src/routes';

test.describe('SWIS WATCH: UI Beacons Verification', () => {

    test('Pilar 1: All uiMap testids exist on their assigned routes', async ({ page }) => {
        // Authenticate if needed (mock or reuse state)
        // For now assuming public routes or dev mode with no auth for simple check,
        // or that the environment provides auth.
        // Ideally, we'd use a setup step or global login.

        for (const [key, config] of Object.entries(UI)) {
            // Type guard to ensure config has a route property
            if (!('route' in config)) continue;

            const route = config.route;
            if (!route) continue;

            // Skip dynamic routes that need parameters
            if (route.includes(':')) {
                console.log(`Skipping dynamic route for ${key}: ${route}`);
                continue;
            }

            console.log(`Verifying ${key} -> [data-testid="${config.testid}"] on ${route}`);
            await page.goto(route);

            const el = page.locator(`[data-testid="${config.testid}"]`);
            // We verify existence. Visibility might depend on state/loading.
            // Using .first() in case multiple elements share the testid (though strictly shouldn't)
            await expect(el.first()).toBeAttached({ timeout: 10000 });
        }
    });

    test('Pilar 3: All verified routes have a [data-screen-id]', async ({ page }) => {
        const routes = Object.values(ROUTES);

        for (const route of routes) {
            // Skip dynamic routes
            if (route.includes(':')) {
                console.log(`Skipping dynamic route: ${route}`);
                continue;
            }

            // Skip auth callbacks or special technical routes
            if (route.includes('callback')) continue;

            console.log(`Verifying [data-screen-id] on ${route}`);
            await page.goto(route);

            const screen = page.locator('[data-screen-id]');
            await expect(screen.first()).toBeAttached({ timeout: 10000 });

            const id = await screen.first().getAttribute('data-screen-id');
            console.log(`  ✅ Screen ID: ${id}`);
        }
    });

});
