export const TEST_USERS = {
    regular: {
        email: process.env.E2E_TEST_EMAIL || 'test@e2e.local',
        password: process.env.E2E_TEST_PASSWORD || 'TestPass123!',
        role: 'client'
    },
    admin: {
        email: process.env.E2E_ADMIN_EMAIL || 'admin@extractoseum.com',
        password: process.env.E2E_ADMIN_PASSWORD || 'AdminPass123!',
        role: 'super_admin'
    }
};
