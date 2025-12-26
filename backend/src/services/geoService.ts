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

// Geo-location service using local geoip-lite database
// Rate limit: UNLIMITED (Local lookup)
import geoip from 'geoip-lite';

interface GeoData {
    country_code: string | null;
    country_name: string | null;
    region: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
}

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

    // Skip local IPs or invalid strings
    if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return defaultGeo;
    }

    try {
        // Local lookup (instantly fast, no rate limits)
        const geo = geoip.lookup(ip);

        if (!geo) {
            console.log(`[GeoService] No data found for ${ip}`);
            return defaultGeo;
        }

        return {
            country_code: geo.country || null,
            country_name: geo.country || null, // geoip-lite often returns code in country field, used as proxy
            region: geo.region || null,
            city: geo.city || null,
            latitude: geo.ll ? geo.ll[0] : null,
            longitude: geo.ll ? geo.ll[1] : null
        };

    } catch (error) {
        console.error('[GeoService] Error fetching geo data:', error);
        return defaultGeo;
    }
};

// No cache needed for local lookup



