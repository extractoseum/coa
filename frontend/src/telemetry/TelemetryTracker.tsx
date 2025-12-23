import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../services/telemetryService';

export function TelemetryTracker() {
    const location = useLocation();

    useEffect(() => {
        // Track page view on route change
        trackPageView(location.pathname);
    }, [location.pathname]);

    return null;
}
