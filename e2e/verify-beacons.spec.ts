import { test, expect } from '@playwright/test';
import { UI } from '../frontend/src/telemetry/uiMap';
import { ROUTES } from '../frontend/src/routes';

test.describe('SWIS WATCH: UI Beacons Verification', () => {

    test('Pilar 1: All uiMap testids exist on their assigned routes', async ({ page }) => {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        // Mock Auth State
        await page.addInitScript(() => {
            window.localStorage.setItem('accessToken', 'mock_token');
            window.localStorage.setItem('refreshToken', 'mock_refresh_token');
        });

        // Set Viewport to Desktop
        await page.setViewportSize({ width: 1280, height: 720 });

        // 1. Generic Fallback Mock (Registered FIRST, so it has LOWER priority than subsequent mocks)
        await page.route('**/api/v1/**', async route => {
            // If it's explicitly auth or navigation, we shouldn't be here if ordered correctly,
            // but just in case, we can continue() if we wanted strictness.
            // Here we just return success to prevent crashes.
            console.log('  ⚠️ Generic Mock intercepted:', route.request().url());
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: [], items: [] })
            });
        });

        // Specific Mock for Demo COA to prevent crash
        await page.route('**/api/v1/coas/demo', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    coa: {
                        id: 'demo',
                        title: 'Demo Product',
                        product_name: 'Demo Product',
                        batch_id: 'B001',
                        created_at: new Date().toISOString()
                    }
                })
            });
        });

        // 2. Intercept Auth Check (Registered SECOND, so it overrides Generic for this path)
        await page.route('**/api/v1/auth/me', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    client: {
                        id: '123',
                        email: 'test@example.com',
                        name: 'Test User',
                        role: 'super_admin', // Use super_admin to access all routes
                        auth_level: 'verified',
                        tags: ['super_admin']
                    }
                })

            });
        });

        // Mock Navigation Items
        await page.route('**/api/v1/navigation*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    items: [
                        // Public / Main
                        { id: '1', label: 'Demo COA', icon: 'FileText', href: '/coa/demo', type: 'main', order_index: 10, is_external: false },

                        // User
                        { id: 'u1', label: 'Dashboard', icon: 'LayoutDashboard', href: ROUTES.dashboard, type: 'user', order_index: 1, is_auth_only: true },
                        { id: 'u2', label: 'Mis Pedidos', icon: 'ShoppingBag', href: ROUTES.myOrders, type: 'user', order_index: 2, is_auth_only: true },
                        { id: 'u3', label: 'Mis Coleccion', icon: 'FolderOpen', href: ROUTES.folders, type: 'user', order_index: 3, is_auth_only: true },

                        // Admin
                        { id: 'a1', label: 'Administrar COAs', icon: 'FileText', href: ROUTES.adminCoas, type: 'admin', order_index: 1, is_admin_only: true },
                        { id: 'a2', label: 'Subir COA', icon: 'Upload', href: ROUTES.upload, type: 'admin', order_index: 2, is_admin_only: true },
                        { id: 'a3', label: 'Inventario', icon: 'Database', href: ROUTES.inventory, type: 'admin', order_index: 3, is_admin_only: true },
                        { id: 'a4', label: 'Badges', icon: 'Award', href: ROUTES.badges, type: 'admin', order_index: 4, is_admin_only: true },
                        { id: 'a5', label: 'Banners', icon: 'Image', href: ROUTES.banners, type: 'admin', order_index: 5, is_admin_only: true },
                        { id: 'a6', label: 'Plantillas', icon: 'FileText', href: ROUTES.templates, type: 'admin', order_index: 6, is_admin_only: true },
                        { id: 'a7', label: 'Quimicos', icon: 'User', href: ROUTES.chemists, type: 'admin', order_index: 7, is_admin_only: true },
                        { id: 'a8', label: 'Push', icon: 'MessageCircle', href: ROUTES.adminPush, type: 'admin', order_index: 8, is_admin_only: true },
                        { id: 'a9', label: 'Navegación', icon: 'Menu', href: ROUTES.adminNavigation, type: 'admin', order_index: 9, is_admin_only: true },
                        { id: 'a10', label: 'Cerebro AI', icon: 'Brain', href: ROUTES.adminKnowledge, type: 'admin', order_index: 10, is_admin_only: true },
                        { id: 'a11', label: 'CRM', icon: 'Briefcase', href: ROUTES.adminCrm, type: 'admin', order_index: 11, is_admin_only: true },
                        { id: 'a12', label: 'Configuracion', icon: 'Settings', href: ROUTES.settings, type: 'admin', order_index: 12, is_admin_only: true },
                    ]
                })
            });


        });

        // Loop through all UI map entries
        for (const [key, config] of Object.entries(UI)) {
            // Type guard to ensure config has a route property
            if (!('route' in config)) continue;

            // @ts-ignore
            const route = config.route;
            if (!route) continue;

            // Skip dynamic routes that need parameters
            if (route.includes(':')) {
                console.log(`Skipping dynamic route for ${key}: ${route}`);
                continue;
            }

            // Context-Aware Check
            // @ts-ignore
            if (config.authRequired) {
                console.log(`  🔐 Authenticated context required for ${key}`);
            }

            // Skip items that are strictly for unauthenticated status if we are authenticated
            // @ts-ignore
            if (config.authStatus === 'unauthenticated') {
                console.log(`  ⏩ Skipping ${key} (unauthenticated-only)`);
                continue;
            }

            // @ts-ignore
            if (config.mockOnly) {
                console.log(`  ⏩ Skipping ${key} (mock-only / complex page dependency)`);
                continue;
            }

            console.log(`Verifying ${key} -> [data-testid="${config.testid}"] on ${route}`);
            await page.goto(route);

            // Handle "open" action (for dropdowns)
            // @ts-ignore
            if (config.open) {
                // @ts-ignore
                const openConfig = config.open;
                console.log(`    🖱️ Opening menu: [data-testid="${openConfig.testid}"]`);
                const menuButton = page.locator(`[data-testid="${openConfig.testid}"]`).first();
                try {
                    await menuButton.waitFor({ state: 'visible', timeout: 5000 });
                    await menuButton.click();
                } catch (e) {
                    console.log('    ❌ Failed to find/click menu button. Current HTML of Nav:', await page.locator('nav').innerHTML().catch(() => 'Nav not found'));
                    throw e;
                }
                // Short wait to ensure menu mount/animation interaction
                await page.waitForTimeout(300);
            }

            const el = page.locator(`[data-testid="${config.testid}"]`);
            // We verify existence. Visibility might depend on state/loading.
            // Using .first() in case multiple elements share the testid (though strictly shouldn't)
            await expect(el.first()).toBeAttached({ timeout: 30000 });
        }
    });

    test('Pilar 3: All verified routes have a [data-screen-id]', async ({ page }) => {
        // Mock Auth State here too just in case
        await page.addInitScript(() => {
            window.localStorage.setItem('accessToken', 'mock_token');
            window.localStorage.setItem('refreshToken', 'mock_refresh_token');
        });

        await page.route('**/api/v1/auth/me', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    client: {
                        id: '123',
                        email: 'test@example.com',
                        name: 'Test User',
                        role: 'super_admin',
                        auth_level: 'verified',
                        tags: ['super_admin']
                    }
                })
            });
        });

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
            await expect(screen.first()).toBeAttached({ timeout: 30000 });

            const id = await screen.first().getAttribute('data-screen-id');
            console.log(`  ✅ Screen ID: ${id}`);
        }
    });

});
