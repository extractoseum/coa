import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, telemetry } from '../services/telemetryService';

export function TelemetryTracker() {
    const location = useLocation();

    useEffect(() => {
        // Track page view on route change (logs to system_logs)
        trackPageView(location.pathname);

        // Also track to behavior endpoint for identity graph
        const pageName = getPageName(location.pathname);
        telemetry.trackBehavior('page_view', {
            page: pageName,
            path: location.pathname,
            search: location.search,
            template: 'coa_viewer'
        });
    }, [location.pathname]);

    return null;
}

// Helper to get friendly page name from path
function getPageName(path: string): string {
    if (path === '/' || path === '') return 'home';
    if (path.startsWith('/coa/')) return 'coa_details';
    if (path.startsWith('/app/')) return 'coa_app';
    if (path === '/login') return 'login';
    if (path === '/dashboard') return 'dashboard';
    if (path === '/my-collection') return 'my_collection';
    if (path === '/my-orders') return 'my_orders';
    if (path.startsWith('/admin')) return 'admin';
    if (path === '/verify') return 'verify_cvv';
    if (path === '/download') return 'download_app';
    return path.replace(/\//g, '_').replace(/^_/, '');
}
