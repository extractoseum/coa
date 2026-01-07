/**
 * Platform Detection Utility
 * Detects if app is running as native Capacitor app, PWA, or web browser
 */

export type AppPlatform = 'android_app' | 'ios_app' | 'web_pwa' | 'web_browser';

export interface PlatformInfo {
    platform: AppPlatform;
    isNativeApp: boolean;
    isPWA: boolean;
    os: 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown';
    deviceType: 'mobile' | 'tablet' | 'desktop';
    appVersion?: string;
}

/**
 * Check if running inside Capacitor native app
 * Capacitor injects a global object when running natively
 */
export const isCapacitorNative = (): boolean => {
    // Capacitor exposes this when running as native app
    const win = window as any;

    // Check for Capacitor.isNativePlatform() - most reliable method
    if (win.Capacitor?.isNativePlatform?.()) {
        return true;
    }

    // Fallback: Check if Capacitor object exists with native platform
    if (win.Capacitor?.getPlatform && win.Capacitor.getPlatform() !== 'web') {
        return true;
    }

    // Check for Capacitor plugins that only exist on native
    if (win.Capacitor?.Plugins?.App) {
        return true;
    }

    return false;
};

/**
 * Get Capacitor platform (android, ios, web)
 */
export const getCapacitorPlatform = (): 'android' | 'ios' | 'web' => {
    const win = window as any;

    if (win.Capacitor?.getPlatform) {
        return win.Capacitor.getPlatform();
    }

    // Fallback to user agent detection
    const ua = navigator.userAgent.toLowerCase();
    if (/android/.test(ua)) return 'android';
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';

    return 'web';
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
 * Detect operating system from user agent
 */
export const detectOS = (): 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown' => {
    const ua = navigator.userAgent.toLowerCase();

    if (/android/.test(ua)) return 'android';
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/windows/.test(ua)) return 'windows';
    if (/macintosh|mac os x/.test(ua)) return 'macos';
    if (/linux/.test(ua)) return 'linux';

    return 'unknown';
};

/**
 * Detect device type from user agent
 */
export const detectDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
    const ua = navigator.userAgent.toLowerCase();

    // Check for tablets first (before mobile check)
    if (/ipad/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
        return 'tablet';
    }

    // Check for mobile devices
    if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) {
        return 'mobile';
    }

    return 'desktop';
};

/**
 * Get comprehensive platform information
 */
export const getPlatformInfo = (): PlatformInfo => {
    const isNative = isCapacitorNative();
    const isPWA = !isNative && isPWAInstalled();
    const capacitorPlatform = getCapacitorPlatform();
    const os = detectOS();
    const deviceType = detectDeviceType();

    let platform: AppPlatform;

    if (isNative) {
        platform = capacitorPlatform === 'android' ? 'android_app' : 'ios_app';
    } else if (isPWA) {
        platform = 'web_pwa';
    } else {
        platform = 'web_browser';
    }

    // Try to get app version from Capacitor
    let appVersion: string | undefined;
    const win = window as any;
    if (win.Capacitor?.Plugins?.App?.getInfo) {
        // This is async but we provide sync detection, version can be fetched separately
        appVersion = win.__APP_VERSION__; // Set during app init if available
    }

    return {
        platform,
        isNativeApp: isNative,
        isPWA,
        os,
        deviceType,
        appVersion
    };
};

/**
 * Get platform string for backend registration
 * Returns: 'android', 'ios', 'web_pwa', or 'web'
 */
export const getPlatformForBackend = (): string => {
    const info = getPlatformInfo();

    if (info.isNativeApp) {
        return info.os; // 'android' or 'ios'
    }

    if (info.isPWA) {
        return 'web_pwa';
    }

    return 'web';
};

/**
 * Get headers to include with API requests to identify the app
 */
export const getAppIdentificationHeaders = (): Record<string, string> => {
    const info = getPlatformInfo();

    return {
        'X-App-Platform': info.platform,
        'X-App-Native': info.isNativeApp ? 'true' : 'false',
        'X-App-PWA': info.isPWA ? 'true' : 'false',
        'X-Device-Type': info.deviceType,
        ...(info.appVersion ? { 'X-App-Version': info.appVersion } : {})
    };
};

/**
 * Initialize platform detection and store globally
 * Call this early in app initialization
 */
export const initPlatformDetection = (): PlatformInfo => {
    const info = getPlatformInfo();

    // Store globally for easy access
    (window as any).__PLATFORM_INFO__ = info;

    console.log('[Platform] Detected:', info);

    return info;
};

/**
 * Get cached platform info (must call initPlatformDetection first)
 */
export const getCachedPlatformInfo = (): PlatformInfo | null => {
    return (window as any).__PLATFORM_INFO__ || null;
};
