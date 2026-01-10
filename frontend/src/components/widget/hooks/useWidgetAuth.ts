/**
 * useWidgetAuth - Widget authentication hook
 *
 * Manages widget session state and OTP authentication flow.
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/v1/widget';
const SESSION_KEY = 'ara_widget_session';

interface WidgetClient {
    id: string;
    name: string;
    email?: string;
    phone?: string;
}

interface WidgetSession {
    sessionToken: string;
    isAuthenticated: boolean;
    client: WidgetClient | null;
    conversationId: string | null;
    expiresAt: string;
}

interface UseWidgetAuthReturn {
    session: WidgetSession | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    client: WidgetClient | null;
    conversationId: string | null;
    error: string | null;
    sendOTP: (identifier: string) => Promise<{ success: boolean; channel?: string; error?: string }>;
    verifyOTP: (identifier: string, code: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

export function useWidgetAuth(): UseWidgetAuthReturn {
    const [session, setSession] = useState<WidgetSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initialize or restore session
    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Check for existing session token
                const storedToken = localStorage.getItem(SESSION_KEY);

                if (storedToken) {
                    // Validate existing session
                    const res = await fetch(`${API_BASE}/session`, {
                        headers: { 'X-Widget-Session': storedToken }
                    });
                    const data = await res.json();

                    if (data.success) {
                        setSession({
                            sessionToken: storedToken,
                            isAuthenticated: data.isAuthenticated,
                            client: data.client,
                            conversationId: data.conversationId,
                            expiresAt: data.expiresAt
                        });
                        setIsLoading(false);
                        return;
                    }
                    // Session invalid, remove it
                    localStorage.removeItem(SESSION_KEY);
                }

                // Create new session
                const createRes = await fetch(`${API_BASE}/session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        origin: window.location.origin,
                        fingerprint: await getFingerprint()
                    })
                });
                const createData = await createRes.json();

                if (createData.success) {
                    localStorage.setItem(SESSION_KEY, createData.sessionToken);
                    setSession({
                        sessionToken: createData.sessionToken,
                        isAuthenticated: false,
                        client: null,
                        conversationId: null,
                        expiresAt: createData.expiresAt
                    });
                } else {
                    setError(createData.error || 'Error creating session');
                }
            } catch (err: any) {
                console.error('[Widget] Auth init error:', err);
                setError('Error connecting to server');
            } finally {
                setIsLoading(false);
            }
        };

        init();
    }, []);

    // Send OTP
    const sendOTP = useCallback(async (identifier: string) => {
        if (!session?.sessionToken) {
            return { success: false, error: 'No active session' };
        }

        try {
            const res = await fetch(`${API_BASE}/auth/send-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Widget-Session': session.sessionToken
                },
                body: JSON.stringify({ identifier })
            });
            const data = await res.json();
            return data;
        } catch (err: any) {
            console.error('[Widget] Send OTP error:', err);
            return { success: false, error: 'Error de conexión' };
        }
    }, [session?.sessionToken]);

    // Verify OTP
    const verifyOTP = useCallback(async (identifier: string, code: string) => {
        if (!session?.sessionToken) {
            return { success: false, error: 'No active session' };
        }

        try {
            const res = await fetch(`${API_BASE}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Widget-Session': session.sessionToken
                },
                body: JSON.stringify({ identifier, code })
            });
            const data = await res.json();

            if (data.success) {
                setSession(prev => prev ? {
                    ...prev,
                    isAuthenticated: true,
                    client: data.client,
                    conversationId: data.conversationId
                } : null);
            }

            return data;
        } catch (err: any) {
            console.error('[Widget] Verify OTP error:', err);
            return { success: false, error: 'Error de conexión' };
        }
    }, [session?.sessionToken]);

    // Logout
    const logout = useCallback(() => {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        // Reinitialize with new session
        window.location.reload();
    }, []);

    return {
        session,
        isLoading,
        isAuthenticated: session?.isAuthenticated || false,
        client: session?.client || null,
        conversationId: session?.conversationId || null,
        error,
        sendOTP,
        verifyOTP,
        logout
    };
}

// Simple fingerprint for rate limiting (not for tracking)
async function getFingerprint(): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('widget', 2, 2);
    }

    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        canvas.toDataURL()
    ];

    const str = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default useWidgetAuth;
