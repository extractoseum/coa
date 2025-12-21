import { traceId } from './trace';

/**
 * Structured Logger
 * Sends telemetry events with consistent context (traceId, route, screen, build).
 */

declare const __BUILD_ID__: string;
declare const __ENV__: string;

type LogContext = Record<string, any>;

export function logEvent(event: string, ctx: LogContext = {}) {
    const payload = {
        event,
        timestamp: new Date().toISOString(),
        trace_id: traceId,
        build_id: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'unknown',
        env: typeof __ENV__ !== 'undefined' ? __ENV__ : 'unknown',
        url: window.location.href,
        path: window.location.pathname,
        ...ctx
    };

    // 1. Dev console visibility
    if (__ENV__ !== 'production') {
        console.groupCollapsed(`[Telemetry] ${event}`);
        console.log(payload);
        console.groupEnd();
    }

    // 2. Send to backend (fire and forget)
    // Using verifyCVV endpoint structure as reference, but to /api/v1/logs
    try {
        fetch('/api/v1/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true // Ensure sends even if navigating away
        }).catch(() => { /* Silent fail */ });
    } catch (e) {
        // Silent fail
    }
}
