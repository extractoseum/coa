/**
 * OneSignal Push Notification Service
 * Handles web push notifications via OneSignal
 */

const ONESIGNAL_APP_ID = '4f020005-36de-48da-b820-bdccb311ff74';
const SAFARI_WEB_ID = 'web.onesignal.auto.57017041-c410-4b69-86f6-455278402f0c';

// Track if OneSignal is initialized
let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize OneSignal SDK
 */
export const initOneSignal = async (): Promise<void> => {
    // Return existing promise if already initializing
    if (initPromise) return initPromise;

    // Return immediately if already initialized
    if (isInitialized) return;

    initPromise = new Promise((resolve) => {
        // Check if OneSignal is already loaded
        if (typeof window !== 'undefined' && (window as any).OneSignalDeferred) {
            (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
                try {
                    await OneSignal.init({
                        appId: ONESIGNAL_APP_ID,
                        safari_web_id: SAFARI_WEB_ID,
                        allowLocalhostAsSecureOrigin: true, // For development
                        notifyButton: {
                            enable: false, // Hide native bell (we use FloatingDock)
                        },
                        welcomeNotification: {
                            title: "¡Notificaciones activadas!",
                            message: "Recibirás alertas de tus COAs y promociones.",
                        }
                    });
                    isInitialized = true;
                    console.log('[OneSignal] Initialized successfully');
                    resolve();
                } catch (error) {
                    console.error('[OneSignal] Init error:', error);
                    resolve(); // Resolve anyway to not block the app
                }
            });
        } else {
            console.warn('[OneSignal] SDK not loaded');
            resolve();
        }
    });

    return initPromise;
};

/**
 * Request notification permission and get player ID
 */
export const requestPermission = async (): Promise<{ granted: boolean; playerId?: string }> => {
    if (!isInitialized) {
        await initOneSignal();
    }

    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !(window as any).OneSignalDeferred) {
            resolve({ granted: false });
            return;
        }

        (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
            try {
                // Check current permission state
                const permission = await OneSignal.Notifications.permission;

                if (permission) {
                    // Already granted, get player ID
                    const playerId = await OneSignal.User.PushSubscription.id;
                    resolve({ granted: true, playerId });
                    return;
                }

                // Request permission
                await OneSignal.Notifications.requestPermission();

                // Check if granted after request
                const newPermission = await OneSignal.Notifications.permission;
                if (newPermission) {
                    const playerId = await OneSignal.User.PushSubscription.id;
                    resolve({ granted: true, playerId });
                } else {
                    resolve({ granted: false });
                }
            } catch (error) {
                console.error('[OneSignal] Permission request error:', error);
                resolve({ granted: false });
            }
        });
    });
};

/**
 * Get current player ID
 */
export const getPlayerId = async (): Promise<string | null> => {
    if (!isInitialized) {
        await initOneSignal();
    }

    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !(window as any).OneSignalDeferred) {
            resolve(null);
            return;
        }

        (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
            try {
                const playerId = await OneSignal.User.PushSubscription.id;
                resolve(playerId || null);
            } catch (error) {
                console.error('[OneSignal] Get player ID error:', error);
                resolve(null);
            }
        });
    });
};

/**
 * Check if notifications are enabled
 */
export const isNotificationsEnabled = async (): Promise<boolean> => {
    if (!isInitialized) {
        await initOneSignal();
    }

    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !(window as any).OneSignalDeferred) {
            resolve(false);
            return;
        }

        (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
            try {
                const permission = await OneSignal.Notifications.permission;
                resolve(!!permission);
            } catch (error) {
                resolve(false);
            }
        });
    });
};

/**
 * Set external user ID (links OneSignal to our client ID)
 */
export const setExternalUserId = async (clientId: string): Promise<void> => {
    if (!isInitialized) {
        await initOneSignal();
    }

    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !(window as any).OneSignalDeferred) {
            resolve();
            return;
        }

        (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
            try {
                await OneSignal.login(clientId);
                console.log('[OneSignal] External user ID set:', clientId);
            } catch (error) {
                console.error('[OneSignal] Set external user ID error:', error);
            }
            resolve();
        });
    });
};

/**
 * Set tags for user segmentation
 */
export const setUserTags = async (tags: Record<string, string>): Promise<void> => {
    if (!isInitialized) {
        await initOneSignal();
    }

    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !(window as any).OneSignalDeferred) {
            resolve();
            return;
        }

        (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
            try {
                await OneSignal.User.addTags(tags);
                console.log('[OneSignal] Tags set:', tags);
            } catch (error) {
                console.error('[OneSignal] Set tags error:', error);
            }
            resolve();
        });
    });
};

/**
 * Logout from OneSignal (on app logout)
 */
export const logoutOneSignal = async (): Promise<void> => {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !(window as any).OneSignalDeferred) {
            resolve();
            return;
        }

        (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
            try {
                await OneSignal.logout();
                console.log('[OneSignal] Logged out');
            } catch (error) {
                console.error('[OneSignal] Logout error:', error);
            }
            resolve();
        });
    });
};

/**
 * Register device with backend
 */
export const registerDeviceWithBackend = async (
    playerId: string,
    authFetch: (url: string, options?: RequestInit) => Promise<Response>
): Promise<boolean> => {
    try {
        const response = await authFetch('/api/v1/push/register', {
            method: 'POST',
            body: JSON.stringify({
                playerId,
                platform: 'web',
                deviceInfo: {
                    browser: navigator.userAgent,
                    model: navigator.platform
                }
            })
        });

        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('[OneSignal] Register device with backend error:', error);
        return false;
    }
};

/**
 * Unregister device from backend (on logout)
 */
export const unregisterDeviceFromBackend = async (playerId: string): Promise<boolean> => {
    try {
        const response = await fetch('/api/v1/push/unregister', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId })
        });

        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('[OneSignal] Unregister device error:', error);
        return false;
    }
};

/**
 * Check if app is running as installed PWA
 */
export const isPWAInstalled = (): boolean => {
    // Check display-mode media query (works on most browsers)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // Check iOS Safari standalone mode
    const isIOSStandalone = (window.navigator as any).standalone === true;

    // Check if running in TWA (Trusted Web Activity) on Android
    const isTWA = document.referrer.includes('android-app://');

    return isStandalone || isIOSStandalone || isTWA;
};

/**
 * Auto-subscribe to push when PWA is installed
 * Should be called on app init
 */
export const handlePWAInstall = async (): Promise<void> => {
    if (!isPWAInstalled()) {
        console.log('[OneSignal] Not running as PWA, skipping auto-subscribe');
        return;
    }

    console.log('[OneSignal] PWA detected, auto-subscribing to push...');

    // Request permission automatically for PWA users
    const result = await requestPermission();

    if (result.granted) {
        console.log('[OneSignal] PWA auto-subscribe successful');

        // Add pwa_installed tag
        await setUserTags({
            pwa_installed: 'true',
            pwa_installed_at: new Date().toISOString().split('T')[0] // YYYY-MM-DD
        });
    } else {
        console.log('[OneSignal] PWA auto-subscribe: permission denied');
    }
};

/**
 * Listen for PWA install event (beforeinstallprompt)
 * This fires when the browser shows the "Add to Home Screen" prompt
 */
export const setupPWAInstallListener = (): void => {
    if (typeof window === 'undefined') return;

    // Store the install prompt for later use
    let deferredPrompt: any = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('[PWA] Install prompt available');
        e.preventDefault();
        deferredPrompt = e;

        // You could show a custom install button here
        window.dispatchEvent(new CustomEvent('pwa-install-available', { detail: deferredPrompt }));
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', async () => {
        console.log('[PWA] App was installed');
        deferredPrompt = null;

        // Auto-subscribe after installation
        setTimeout(async () => {
            await handlePWAInstall();
        }, 1000); // Small delay to ensure app is fully loaded
    });
};
