/**
 * Trace ID Generator
 * Creates a unique session ID for telemetry tracing.
 * Persists in sessionStorage to maintain identity across reloads in the same tab.
 */

export const traceId = (() => {
    const STORAGE_KEY = 'eum_trace_id';

    try {
        let tid = sessionStorage.getItem(STORAGE_KEY);
        if (!tid) {
            tid = crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2) + Date.now().toString(16);
            sessionStorage.setItem(STORAGE_KEY, tid);
        }
        return tid;
    } catch (e) {
        // Fallback if sessionStorage is blocked
        return Math.random().toString(16).slice(2);
    }
})();
