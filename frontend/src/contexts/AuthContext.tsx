import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
    initOneSignal,
    requestPermission,
    setExternalUserId,
    setUserTags,
    logoutOneSignal,
    registerDeviceWithBackend,
    unregisterDeviceFromBackend,
    getPlayerId,
    handlePWAInstall,
    setupPWAInstallListener,
    isPWAInstalled
} from '../services/onesignalService';
import { telemetry } from '../services/telemetryService';

interface Client {
    id: string;
    email: string;
    name: string;
    role: 'super_admin' | 'client';
    tags?: string[];
    company?: string;
    phone?: string;
    shopify_customer_id?: string;
    auth_level?: 'registered' | 'verified';
}

interface AuthContextType {
    client: Client | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isSuperAdmin: boolean;
    authLevel: 'guest' | 'registered' | 'verified';
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    loginWithTotp: (email: string, token: string) => Promise<{ success: boolean; error?: string }>;
    sendOTP: (identifier: string) => Promise<{ success: boolean; error?: string; channel?: string }>;
    verifyOTP: (identifier: string, code: string) => Promise<{ success: boolean; error?: string }>;
    quickRegister: (identifier: string) => Promise<{ success: boolean; error?: string; isNewUser?: boolean }>;
    handleOAuthCallback: (code: string, state: string) => Promise<{ success: boolean; error?: string; redirectTo?: string }>;
    logout: () => Promise<void>;
    refreshAuth: () => Promise<void>;
    requestPushPermission: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api/v1';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [client, setClient] = useState<Client | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Check for existing session on mount and initialize OneSignal
    useEffect(() => {
        checkAuth();
        // Initialize OneSignal
        initOneSignal().then(() => {
            // Setup PWA install listener
            setupPWAInstallListener();
            // Auto-subscribe if already running as PWA
            handlePWAInstall();
        }).catch(console.error);
    }, []);

    // Register device for push notifications when client changes
    useEffect(() => {
        if (client) {
            setupPushNotifications(client);
        }
    }, [client?.id]);

    const setupPushNotifications = async (currentClient: Client) => {
        try {
            // Set external user ID in OneSignal
            await setExternalUserId(currentClient.id);

            // Set user tags for segmentation
            const tags: Record<string, string> = {
                role: currentClient.role || 'client',
            };
            if (currentClient.tags && currentClient.tags.length > 0) {
                tags.shopify_tags = currentClient.tags.join(',');
                // Also set individual common tags
                if (currentClient.tags.includes('Club_partner')) {
                    tags.membership_tier = 'partner';
                }
            }
            // Add PWA tag if running as installed app
            if (isPWAInstalled()) {
                tags.pwa_installed = 'true';
            }
            await setUserTags(tags);

            // Get player ID and register with backend
            const playerId = await getPlayerId();
            if (playerId) {
                await registerDeviceWithBackend(playerId, authFetch);
            }
        } catch (error) {
            console.error('Push notification setup error:', error);
        }
    };

    const checkAuth = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success && data.client) {
                    setClient(data.client);
                }
            } else if (res.status === 401) {
                // Try to refresh token
                await refreshToken();
            }
        } catch (error) {
            console.error('Auth check error:', error);
            clearTokens();
        } finally {
            setIsLoading(false);
        }
    };

    const refreshToken = async () => {
        const refreshTokenValue = localStorage.getItem('refreshToken');
        if (!refreshTokenValue) {
            clearTokens();
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: refreshTokenValue })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('accessToken', data.accessToken);
                    localStorage.setItem('refreshToken', data.refreshToken);
                    await checkAuth();
                    return;
                }
            }
            clearTokens();
        } catch (error) {
            console.error('Refresh token error:', error);
            clearTokens();
        }
    };

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                setClient(data.client);
                // Identify user in telemetry & Clarity
                telemetry.identifyUser(data.client.email, { name: data.client.name });
                return { success: true };
            }

            return { success: false, error: data.error || 'Error de autenticacion' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Error de conexion' };
        }
    };

    const sendOTP = async (identifier: string): Promise<{ success: boolean; error?: string; channel?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier })
            });
            const data = await res.json();
            return data;
        } catch (error) {
            console.error('Send OTP error:', error);
            return { success: false, error: 'Error de conexión' };
        }
    };

    const loginWithTotp = async (email: string, token: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/auth/login-totp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, token })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                setClient(data.client);
                telemetry.identifyUser(data.client.email, { name: data.client.name });
                return { success: true };
            }
            return { success: false, error: data.error || 'Código incorrecto' };
        } catch (error) {
            console.error('Login TOTP error:', error);
            return { success: false, error: 'Error de conexión' };
        }
    };

    const verifyOTP = async (identifier: string, code: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, code })
            });

            const data = await res.json();

            if (data.success) {
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                setClient(data.client);
                telemetry.identifyUser(data.client.email, { name: data.client.name });
                return { success: true };
            }

            return { success: false, error: data.error || 'Código incorrecto' };
        } catch (error) {
            console.error('Verify OTP error:', error);
            return { success: false, error: 'Error de conexión' };
        }
    };

    const quickRegister = async (identifier: string): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> => {
        try {
            const res = await fetch(`${API_BASE}/auth/quick-register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identifier })
            });

            const data = await res.json();

            if (data.success) {
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                setClient(data.client);
                telemetry.identifyUser(data.client.email, { name: data.client.name });
                return { success: true, isNewUser: data.isNewUser };
            }

            return { success: false, error: data.error || 'Error de registro' };
        } catch (error) {
            console.error('Quick register error:', error);
            return { success: false, error: 'Error de conexion' };
        }
    };

    const handleOAuthCallback = async (code: string, state: string): Promise<{ success: boolean; error?: string; redirectTo?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/auth/shopify/callback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code, state })
            });

            const data = await res.json();

            if (data.success) {
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                setClient(data.client);
                telemetry.identifyUser(data.client.email, { name: data.client.name });
                return { success: true, redirectTo: data.redirectTo };
            }

            return { success: false, error: data.error || 'Error en OAuth callback' };
        } catch (error) {
            console.error('OAuth callback error:', error);
            return { success: false, error: 'Error de conexion' };
        }
    };

    const logout = async () => {
        const refreshTokenValue = localStorage.getItem('refreshToken');

        // Unregister push notifications (fire and forget)
        try {
            const playerId = await getPlayerId();
            if (playerId) {
                unregisterDeviceFromBackend(playerId).catch(console.error);
            }
            logoutOneSignal().catch(console.error);
        } catch (error) {
            console.error('Push unregister error:', error);
        }

        try {
            // Attempt backend logout but don't block UI for too long
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: refreshTokenValue }),
                signal: controller.signal
            }).catch(e => console.warn('Logout fetch failed or timed out', e));

            clearTimeout(timeoutId);
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Always clear local state
            clearTokens();
            setClient(null);
        }
    };

    const clearTokens = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
    };

    const refreshAuth = async () => {
        await checkAuth();
    };

    // Request push notification permission
    const requestPushPermission = async (): Promise<boolean> => {
        try {
            const result = await requestPermission();
            if (result.granted && result.playerId && client) {
                await registerDeviceWithBackend(result.playerId, authFetch);
            }
            return result.granted;
        } catch (error) {
            console.error('Request push permission error:', error);
            return false;
        }
    };

    // Check if user is super_admin based on role or tags
    const isSuperAdmin = client?.role === 'super_admin' ||
        (Array.isArray(client?.tags) && client.tags.includes('super_admin'));

    // Determine auth level
    const authLevel: 'guest' | 'registered' | 'verified' = client
        ? (client.auth_level || 'registered')
        : 'guest';

    const value: AuthContextType = {
        client,
        isLoading,
        isAuthenticated: !!client,
        isSuperAdmin: !!isSuperAdmin,
        authLevel,
        login,
        loginWithTotp,
        sendOTP,
        verifyOTP,
        quickRegister,
        handleOAuthCallback,
        logout,
        refreshAuth,
        requestPushPermission
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Helper hook to get auth headers for API calls
export function useAuthHeaders() {
    const accessToken = localStorage.getItem('accessToken');
    return {
        'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        'Content-Type': 'application/json'
    };
}

// Helper function for authenticated fetch with auto-refresh
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = localStorage.getItem('accessToken');

    const headers: HeadersInit = {
        ...options.headers,
    };

    if (accessToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
    }

    // Only add Content-Type if not FormData
    if (!(options.body instanceof FormData)) {
        (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    let response = await fetch(url, {
        ...options,
        headers
    });

    // If 401, try to refresh token and retry
    if (response.status === 401) {
        const refreshTokenValue = localStorage.getItem('refreshToken');
        if (refreshTokenValue) {
            try {
                const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: refreshTokenValue })
                });

                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    if (data.success) {
                        localStorage.setItem('accessToken', data.accessToken);
                        localStorage.setItem('refreshToken', data.refreshToken);

                        // Retry original request with new token
                        (headers as Record<string, string>)['Authorization'] = `Bearer ${data.accessToken}`;
                        response = await fetch(url, { ...options, headers });
                    }
                }
            } catch (error) {
                console.error('Auto-refresh failed:', error);
            }
        }
    }

    return response;
}
