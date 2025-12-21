// Geo-location service using free ip-api.com
// Rate limit: 45 requests per minute (free tier)

interface GeoData {
    country_code: string | null;
    country_name: string | null;
    region: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
}

// Cache to reduce API calls
const geoCache = new Map<string, { data: GeoData; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const getGeoFromIP = async (ip: string): Promise<GeoData> => {
    // Default response for invalid IPs
    const defaultGeo: GeoData = {
        country_code: null,
        country_name: null,
        region: null,
        city: null,
        latitude: null,
        longitude: null
    };

    // Skip local IPs
    if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return defaultGeo;
    }

    // Check cache first
    const cached = geoCache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    try {
        // Use ip-api.com (free, no API key needed, 45 req/min)
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,country,regionName,city,lat,lon`);

        if (!response.ok) {
            console.error(`[GeoService] HTTP error: ${response.status}`);
            return defaultGeo;
        }

        const data = await response.json();

        if (data.status !== 'success') {
            console.log(`[GeoService] IP lookup failed for ${ip}:`, data.message);
            return defaultGeo;
        }

        const geoData: GeoData = {
            country_code: data.countryCode || null,
            country_name: data.country || null,
            region: data.regionName || null,
            city: data.city || null,
            latitude: data.lat || null,
            longitude: data.lon || null
        };

        // Cache the result
        geoCache.set(ip, { data: geoData, timestamp: Date.now() });

        return geoData;

    } catch (error) {
        console.error('[GeoService] Error fetching geo data:', error);
        return defaultGeo;
    }
};

// Clean up old cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of geoCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
            geoCache.delete(ip);
        }
    }
}, 60 * 60 * 1000); // Run every hour
