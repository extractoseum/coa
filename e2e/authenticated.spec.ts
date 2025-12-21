import { test, expect } from '@playwright/test';
import { ROUTES } from '../frontend/src/routes';

test.describe('Authenticated Routes', () => {
    test.beforeEach(async ({ page }) => {
        // 1. Inject Token State
        await page.addInitScript(() => {
            window.localStorage.setItem('accessToken', 'mock_access_token');
            window.localStorage.setItem('refreshToken', 'mock_refresh_token');
        });

        // 2. Mock Auth Check
        await page.route('**/api/v1/auth/me', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    client: {
                        id: 'e2e-user-123',
                        email: 'test@example.com',
                        name: 'Test Super Admin',
                        role: 'super_admin',
                        auth_level: 'verified',
                        tags: ['super_admin']
                    }
                })
            });
        });

        // 3. Mock Navigation
        await page.route('**/api/v1/navigation*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    items: [
                        { id: '1', label: 'Demo COA', icon: 'FileText', href: '/coa/demo', type: 'main', order_index: 10, is_external: false },
                        { id: 'u1', label: 'Dashboard', icon: 'LayoutDashboard', href: ROUTES.dashboard, type: 'user', order_index: 1, is_auth_only: true },
                        { id: 'u2', label: 'Mis Pedidos', icon: 'ShoppingBag', href: ROUTES.myOrders, type: 'user', order_index: 2, is_auth_only: true },
                        { id: 'u3', label: 'Mis Coleccion', icon: 'FolderOpen', href: ROUTES.folders, type: 'user', order_index: 3, is_auth_only: true },
                    ]
                })
            });
        });

        // 4. Mock My Orders
        await page.route('**/api/v1/orders/my-orders', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    orders: [
                        { id: 'ORD-123', status: 'pending', total: 100, created_at: new Date().toISOString() }
                    ]
                })
            });
        });

        // 5. Mock Demo COA
        await page.route('**/api/v1/coas/demo', async route => {
            await route.fulfill({ success: true, coa: { id: 'demo', title: 'Demo' } } as any);
        });

        // 6. Generic Mock (Improved)
        await page.route('**/api/v1/**', async route => {
            const url = route.request().url();
            if (!url.match(/(auth\/me|navigation|orders\/|coas\/)/)) {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        success: true,
                        data: [],
                        items: [], // Crucial for Navbar fallback
                        templates: [] // Crucial for App.tsx
                    })
                });
            }
        });
    });

    test('Dashboard loads for authenticated user', async ({ page }) => {
        await page.goto('/dashboard');

        try {
            await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
            await expect(page.locator('text=Mis Pedidos').first()).toBeVisible();
        } catch (e) {
            // console.log('FAILURE HTML DUMP:', await page.content());
            throw e;
        }
    });

    test('My Orders shows order list', async ({ page }) => {
        await page.goto('/my-orders');
        await expect(page).toHaveURL(/\/my-orders/);
        await expect(page.locator('h1')).toContainText(/Mis Pedidos|Ordenes|My Orders/i);
    });

    test('Redirect to dashboard if accessing login while authenticated', async ({ page }) => {
        await page.goto('/login');
        await expect(page).toHaveURL(/\/dashboard/);
    });
});

test.describe('Unauthenticated Access Protection', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/v1/**', async route => {
            if (route.request().url().includes('/auth/me')) {
                await route.fulfill({ status: 401, body: JSON.stringify({ success: false }) });
            } else {
                await route.continue();
            }
        });
    });

    test('Dashboard redirects to login when guest', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/);
    });

    test('Admin CRM is protected', async ({ page }) => {
        await page.goto('/admin/crm');
        await expect(page).not.toHaveURL(/\/admin\/crm/);
    });
});
