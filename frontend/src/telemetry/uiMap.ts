import { ROUTES } from '../routes';

/**
 * UI Map (The Catalog)
 * Central registry of all critical testable elements.
 * Maps logical names to data-testid attributes and their expected routes.
 */

export const UI = {
    // Navigation - User
    "nav.user.dashboard": { testid: "nav.user.mi_dashboard", route: ROUTES.dashboard },
    "nav.user.orders": { testid: "nav.user.mis_pedidos", route: ROUTES.myOrders },
    "nav.user.collection": { testid: "nav.user.mi_coleccion", route: ROUTES.myCollection },
    "nav.user.demo": { testid: "nav.user.ver_demo_coa", route: "/coa/demo" }, // Dynamic route approximation

    // Navigation - Admin
    "nav.admin.coas": { testid: "nav.admin.administrar_coas", route: ROUTES.adminCoas },
    "nav.admin.upload": { testid: "nav.admin.subir_coa", route: ROUTES.upload },
    "nav.admin.inventory": { testid: "nav.admin.hologramas", route: ROUTES.inventory },
    "nav.admin.badges": { testid: "nav.admin.badges", route: ROUTES.badges },
    "nav.admin.banners": { testid: "nav.admin.banners", route: ROUTES.banners },
    "nav.admin.templates": { testid: "nav.admin.templates", route: ROUTES.templates },
    "nav.admin.chemists": { testid: "nav.admin.quimicos", route: ROUTES.chemists },
    "nav.admin.push": { testid: "nav.admin.push_notif.", route: ROUTES.adminPush },
    "nav.admin.navigation": { testid: "nav.admin.navegación", route: ROUTES.adminNavigation },
    "nav.admin.knowledge": { testid: "nav.admin.cerebro_ai", route: ROUTES.adminKnowledge },
    "nav.admin.crm": { testid: "nav.admin.omni_crm", route: ROUTES.adminCrm },
    "nav.admin.settings": { testid: "nav.admin.configuracion", route: ROUTES.settings },

    // Home Actions
    "home.login": { testid: "home.login", route: ROUTES.home },

    // Core System
    "build.stamp": { testid: "build.stamp" }
} as const;
