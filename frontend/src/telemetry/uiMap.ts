import { ROUTES } from '../routes';

/**
 * UI Map (The Catalog)
 * Central registry of all critical testable elements.
 * Maps logical names to data-testid attributes and their expected routes.
 */

export const UI = {
    // Navigation - User
    "nav.user.dashboard": { testid: "nav.user.mi_dashboard", route: ROUTES.dashboard, authRequired: true, open: { testid: "nav.user.menu_button", action: "click" } },
    "nav.user.orders": { testid: "nav.user.mis_pedidos", route: ROUTES.myOrders, authRequired: true, open: { testid: "nav.user.menu_button", action: "click" } },
    "nav.user.collection": { testid: "nav.user.mi_coleccion", route: ROUTES.folders, authRequired: true, open: { testid: "nav.user.menu_button", action: "click" } },
    "nav.user.demo": { testid: "nav.user.ver_demo_coa", route: "/coa/demo", authRequired: false },

    // Navigation - Admin
    "nav.admin.coas": { testid: "nav.admin.administrar_coas", route: ROUTES.adminCoas, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.upload": { testid: "nav.admin.subir_coa", route: ROUTES.upload, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.inventory": { testid: "nav.admin.hologramas", route: ROUTES.inventory, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.badges": { testid: "nav.admin.badges", route: ROUTES.badges, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, mockOnly: true, dynamic: true },
    "nav.admin.banners": { testid: "nav.admin.banners", route: ROUTES.banners, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, mockOnly: true, dynamic: true },
    "nav.admin.templates": { testid: "nav.admin.templates", route: ROUTES.templates, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, mockOnly: true, dynamic: true },
    "nav.admin.chemists": { testid: "nav.admin.quimicos", route: ROUTES.chemists, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, mockOnly: true, dynamic: true },
    "nav.admin.push": { testid: "nav.admin.push_notif", route: ROUTES.adminPush, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.navigation": { testid: "nav.admin.navegación", route: ROUTES.adminNavigation, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.knowledge": { testid: "nav.admin.cerebro_ai", route: ROUTES.adminKnowledge, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.crm": { testid: "nav.admin.omni_crm", route: ROUTES.adminCrm, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },
    "nav.admin.settings": { testid: "nav.admin.configuracion", route: ROUTES.settings, authRequired: true, open: { testid: "nav.admin.menu_button", action: "click" }, dynamic: true },

    // Home Actions
    "home.login": { testid: "home.login", route: ROUTES.home, authRequired: false, authStatus: 'unauthenticated' },

    // Core System
    "build.stamp": { testid: "build.stamp", authRequired: false }
} as const;
