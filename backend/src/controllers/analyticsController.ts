import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import crypto from 'crypto';
import { getGeoFromIP } from '../services/geoService';

// ============================================
// Helper Functions
// ============================================

// Hash IP for privacy-compliant unique visitor tracking
const hashIP = (ip: string): string => {
    return crypto.createHash('sha256').update(ip).digest('hex');
};

// Parse user agent to get device type, browser, and OS
const parseUserAgent = (userAgent: string): { deviceType: string; browser: string; os: string } => {
    const ua = userAgent.toLowerCase();

    // Device type detection
    let deviceType = 'unknown';
    if (/bot|crawler|spider|scraper/i.test(ua)) {
        deviceType = 'bot';
    } else if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) {
        if (/ipad|tablet/i.test(ua)) {
            deviceType = 'tablet';
        } else {
            deviceType = 'mobile';
        }
    } else {
        deviceType = 'desktop';
    }

    // Browser detection
    let browser = 'unknown';
    if (/chrome/i.test(ua) && !/edge|edg/i.test(ua)) {
        browser = 'Chrome';
    } else if (/firefox/i.test(ua)) {
        browser = 'Firefox';
    } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
        browser = 'Safari';
    } else if (/edge|edg/i.test(ua)) {
        browser = 'Edge';
    } else if (/opera|opr/i.test(ua)) {
        browser = 'Opera';
    }

    // OS detection
    let os = 'unknown';
    if (/windows/i.test(ua)) {
        os = 'Windows';
    } else if (/mac os|macos/i.test(ua)) {
        os = 'macOS';
    } else if (/linux/i.test(ua)) {
        os = 'Linux';
    } else if (/android/i.test(ua)) {
        os = 'Android';
    } else if (/ios|iphone|ipad/i.test(ua)) {
        os = 'iOS';
    }

    return { deviceType, browser, os };
};

// Get or generate session ID from cookie/header
const getSessionId = (req: Request): string => {
    // Check for existing session ID in cookie or header
    const existingSession = req.cookies?.coa_session || req.headers['x-coa-session'];
    if (existingSession) {
        return existingSession as string;
    }
    // Generate new session ID
    return crypto.randomBytes(16).toString('hex');
};

// Check if this is a unique visit (first time from this IP hash today)
const checkUniqueVisit = async (coaId: string, ipHash: string): Promise<boolean> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
        .from('coa_scans')
        .select('id')
        .eq('coa_id', coaId)
        .eq('ip_hash', ipHash)
        .gte('scanned_at', today.toISOString())
        .limit(1);

    return !data || data.length === 0;
};

// ============================================
// Track COA Access - Main tracking endpoint
// ============================================
export const trackAccess = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const {
            access_type,      // 'direct_link', 'qr_global', 'cvv_verification', 'pdf_link', 'internal_nav'
            link_source,      // For pdf_link: 'batch_id', 'token', 'product_image', 'coa_number', 'qr_code', 'purchase_link'
            cvv_code,         // For cvv_verification
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term
        } = req.body;

        // Validate access_type
        const validAccessTypes = ['direct_link', 'qr_global', 'cvv_verification', 'pdf_link', 'internal_nav'];
        if (!access_type || !validAccessTypes.includes(access_type)) {
            return res.status(400).json({ success: false, error: 'Tipo de acceso inválido' });
        }

        // Get COA by token
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, client_id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // Extract visitor info - prioritize X-Real-IP from nginx, then X-Forwarded-For
        const ip = req.headers['x-real-ip']?.toString() ||
                   req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
                   req.ip?.replace('::ffff:', '') ||
                   'unknown';
        const ipHash = hashIP(ip);
        const userAgent = req.headers['user-agent'] || '';
        const referrer = req.headers['referer'] || req.headers['referrer'] || '';
        const sessionId = getSessionId(req);

        // Parse user agent
        const { deviceType, browser, os } = parseUserAgent(userAgent);

        // Check if unique visit
        const isUniqueVisit = await checkUniqueVisit(coa.id, ipHash);

        // Get geo location from IP
        const geoData = await getGeoFromIP(ip);

        // Get verification code ID if CVV access
        let verificationCodeId = null;
        if (access_type === 'cvv_verification' && cvv_code) {
            const { data: vcData } = await supabase
                .from('verification_codes')
                .select('id')
                .eq('cvv_code', cvv_code)
                .single();

            if (vcData) {
                verificationCodeId = vcData.id;
            }
        }

        // Insert scan record
        const { data: scanData, error: scanError } = await supabase
            .from('coa_scans')
            .insert({
                coa_id: coa.id,
                access_type,
                link_source: link_source || null,
                verification_code_id: verificationCodeId,
                cvv_code_used: cvv_code || null,
                session_id: sessionId,
                is_unique_visit: isUniqueVisit,
                ip_address: ip,
                ip_hash: ipHash,
                user_agent: userAgent,
                referrer,
                device_type: deviceType,
                browser,
                os,
                country_code: geoData.country_code,
                country: geoData.country_name,
                region: geoData.region,
                city: geoData.city,
                utm_source: utm_source || null,
                utm_medium: utm_medium || null,
                utm_campaign: utm_campaign || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null
            })
            .select('id')
            .single();

        if (scanError) {
            console.error('[Analytics] Error tracking access:', scanError);
            return res.status(500).json({ success: false, error: 'Error al registrar acceso' });
        }

        // Return session ID for client to store
        res.json({
            success: true,
            scan_id: scanData?.id,
            session_id: sessionId,
            is_unique: isUniqueVisit
        });

    } catch (error) {
        console.error('[Analytics] Track access error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Track PDF Download
// ============================================
export const trackPDFDownload = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { pdf_type } = req.body; // 'original', 'branded', 'custom'

        // Get COA
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        const ip = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';
        const ipHash = hashIP(ip);
        const userAgent = req.headers['user-agent'] || '';
        const { deviceType } = parseUserAgent(userAgent);

        const { error: insertError } = await supabase
            .from('pdf_downloads')
            .insert({
                coa_id: coa.id,
                pdf_type: pdf_type || 'branded',
                ip_address: ip,
                ip_hash: ipHash,
                user_agent: userAgent,
                device_type: deviceType
            });

        if (insertError) {
            console.error('[Analytics] Error tracking PDF download:', insertError);
            return res.status(500).json({ success: false, error: 'Error al registrar descarga' });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('[Analytics] Track PDF download error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Track Link Click (purchase links, etc.)
// ============================================
export const trackLinkClick = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { link_type, link_url, link_label } = req.body;

        if (!link_type || !link_url) {
            return res.status(400).json({ success: false, error: 'Tipo y URL de link requeridos' });
        }

        // Get COA
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        const ip = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';
        const ipHash = hashIP(ip);
        const userAgent = req.headers['user-agent'] || '';
        const { deviceType } = parseUserAgent(userAgent);

        const { error: insertError } = await supabase
            .from('link_clicks')
            .insert({
                coa_id: coa.id,
                link_type,
                link_url,
                link_label: link_label || null,
                ip_hash: ipHash,
                user_agent: userAgent,
                device_type: deviceType
            });

        if (insertError) {
            console.error('[Analytics] Error tracking link click:', insertError);
            return res.status(500).json({ success: false, error: 'Error al registrar click' });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('[Analytics] Track link click error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Get Analytics for a specific COA (owner or admin)
// ============================================
export const getCOAAnalytics = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { period = '30' } = req.query; // days
        const client = (req as any).client;

        // Get COA with ownership check
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, client_id, public_token, coa_number, batch_id, custom_name')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // Check permissions - must be owner or super_admin
        // Use req.userRole which contains the effective role (considering tags)
        const isOwner = coa.client_id === client.id;
        const isSuperAdmin = (req as any).userRole === 'super_admin';

        if (!isOwner && !isSuperAdmin) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para ver estas analytics' });
        }

        const periodDays = parseInt(period as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get scan stats
        const { data: scans, error: scansError } = await supabase
            .from('coa_scans')
            .select('*')
            .eq('coa_id', coa.id)
            .gte('scanned_at', startDate.toISOString())
            .order('scanned_at', { ascending: false });

        if (scansError) {
            throw scansError;
        }

        // Calculate stats
        const totalViews = scans?.length || 0;
        const uniqueVisitors = new Set(scans?.map(s => s.ip_hash)).size;

        // By access type
        const byAccessType = {
            direct_link: scans?.filter(s => s.access_type === 'direct_link').length || 0,
            qr_global: scans?.filter(s => s.access_type === 'qr_global').length || 0,
            cvv_verification: scans?.filter(s => s.access_type === 'cvv_verification').length || 0,
            pdf_link: scans?.filter(s => s.access_type === 'pdf_link').length || 0,
            internal_nav: scans?.filter(s => s.access_type === 'internal_nav').length || 0
        };

        // By PDF link source
        const byLinkSource = {
            batch_id: scans?.filter(s => s.link_source === 'batch_id').length || 0,
            token: scans?.filter(s => s.link_source === 'token').length || 0,
            product_image: scans?.filter(s => s.link_source === 'product_image').length || 0,
            coa_number: scans?.filter(s => s.link_source === 'coa_number').length || 0,
            qr_code: scans?.filter(s => s.link_source === 'qr_code').length || 0,
            purchase_link: scans?.filter(s => s.link_source === 'purchase_link').length || 0
        };

        // By device type
        const byDevice = {
            desktop: scans?.filter(s => s.device_type === 'desktop').length || 0,
            mobile: scans?.filter(s => s.device_type === 'mobile').length || 0,
            tablet: scans?.filter(s => s.device_type === 'tablet').length || 0,
            bot: scans?.filter(s => s.device_type === 'bot').length || 0
        };

        // Daily breakdown (last 30 days)
        const dailyStats: { [key: string]: { views: number; unique: Set<string> } } = {};
        scans?.forEach(scan => {
            const date = new Date(scan.scanned_at).toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = { views: 0, unique: new Set() };
            }
            dailyStats[date].views++;
            dailyStats[date].unique.add(scan.ip_hash);
        });

        const dailyBreakdown = Object.entries(dailyStats).map(([date, data]) => ({
            date,
            views: data.views,
            unique_visitors: data.unique.size
        })).sort((a, b) => a.date.localeCompare(b.date));

        // Top countries (if geo data available)
        const countryCounts: { [key: string]: { count: number; name: string } } = {};
        scans?.forEach(scan => {
            if (scan.country_code) {
                if (!countryCounts[scan.country_code]) {
                    countryCounts[scan.country_code] = { count: 0, name: scan.country || scan.country_code };
                }
                countryCounts[scan.country_code].count++;
            }
        });
        const topCountries = Object.entries(countryCounts)
            .map(([code, data]) => ({ country_code: code, country_name: data.name, count: data.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Top cities (if geo data available)
        const cityCounts: { [key: string]: { count: number; country: string } } = {};
        scans?.forEach(scan => {
            if (scan.city) {
                const cityKey = `${scan.city}, ${scan.region || ''}`.replace(/, $/, '');
                if (!cityCounts[cityKey]) {
                    cityCounts[cityKey] = { count: 0, country: scan.country || scan.country_code || '' };
                }
                cityCounts[cityKey].count++;
            }
        });
        const topCities = Object.entries(cityCounts)
            .map(([city, data]) => ({ city, country: data.country, count: data.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Recent scans (last 20)
        const recentScans = (scans || []).slice(0, 20).map(scan => ({
            id: scan.id,
            access_type: scan.access_type,
            link_source: scan.link_source,
            device_type: scan.device_type,
            browser: scan.browser,
            os: scan.os,
            country: scan.country_code,
            city: scan.city,
            scanned_at: scan.scanned_at,
            is_unique: scan.is_unique_visit
        }));

        // Get PDF downloads count
        const { count: pdfDownloads } = await supabase
            .from('pdf_downloads')
            .select('*', { count: 'exact', head: true })
            .eq('coa_id', coa.id)
            .gte('downloaded_at', startDate.toISOString());

        // Get link clicks
        const { data: linkClicks } = await supabase
            .from('link_clicks')
            .select('link_type, link_url, link_label, clicked_at')
            .eq('coa_id', coa.id)
            .gte('clicked_at', startDate.toISOString());

        const linkClickStats = {
            total: linkClicks?.length || 0,
            by_type: {
                purchase: linkClicks?.filter(l => l.link_type === 'purchase').length || 0,
                website: linkClicks?.filter(l => l.link_type === 'website').length || 0,
                social: linkClicks?.filter(l => l.link_type === 'social').length || 0
            }
        };

        res.json({
            success: true,
            coa: {
                token: coa.public_token,
                coa_number: coa.coa_number,
                batch_id: coa.batch_id,
                name: coa.custom_name
            },
            period: {
                days: periodDays,
                start: startDate.toISOString(),
                end: new Date().toISOString()
            },
            summary: {
                total_views: totalViews,
                unique_visitors: uniqueVisitors,
                pdf_downloads: pdfDownloads || 0,
                link_clicks: linkClickStats.total
            },
            by_access_type: byAccessType,
            by_pdf_link_source: byLinkSource,
            by_device: byDevice,
            top_countries: topCountries,
            top_cities: topCities,
            daily_breakdown: dailyBreakdown,
            recent_scans: recentScans,
            link_clicks: linkClickStats
        });

    } catch (error) {
        console.error('[Analytics] Get COA analytics error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Get Analytics Dashboard for Client (owner)
// ============================================
export const getClientDashboard = async (req: Request, res: Response) => {
    try {
        const client = (req as any).client;
        const { period = '30' } = req.query;

        const periodDays = parseInt(period as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get all COAs for this client
        const { data: coas, error: coasError } = await supabase
            .from('coas')
            .select('id, public_token, coa_number, batch_id, custom_name, custom_title, product_image_url')
            .eq('client_id', client.id);

        if (coasError) {
            throw coasError;
        }

        if (!coas || coas.length === 0) {
            return res.json({
                success: true,
                summary: {
                    total_coas: 0,
                    total_views: 0,
                    unique_visitors: 0,
                    pdf_downloads: 0
                },
                coas: []
            });
        }

        const coaIds = coas.map(c => c.id);

        // Get all scans for client's COAs
        const { data: allScans } = await supabase
            .from('coa_scans')
            .select('coa_id, ip_hash, access_type, device_type, scanned_at')
            .in('coa_id', coaIds)
            .gte('scanned_at', startDate.toISOString());

        // Calculate totals
        const totalViews = allScans?.length || 0;
        const uniqueVisitors = new Set(allScans?.map(s => s.ip_hash)).size;

        // By access type totals
        const totalByAccessType = {
            direct_link: allScans?.filter(s => s.access_type === 'direct_link').length || 0,
            qr_global: allScans?.filter(s => s.access_type === 'qr_global').length || 0,
            cvv_verification: allScans?.filter(s => s.access_type === 'cvv_verification').length || 0,
            pdf_link: allScans?.filter(s => s.access_type === 'pdf_link').length || 0
        };

        // Get PDF downloads
        const { count: pdfDownloads } = await supabase
            .from('pdf_downloads')
            .select('*', { count: 'exact', head: true })
            .in('coa_id', coaIds)
            .gte('downloaded_at', startDate.toISOString());

        // Per-COA stats
        const coaStats = coas.map(coa => {
            const coaScans = allScans?.filter(s => s.coa_id === coa.id) || [];
            return {
                token: coa.public_token,
                coa_number: coa.coa_number,
                batch_id: coa.batch_id,
                name: coa.custom_name || coa.custom_title,
                image: coa.product_image_url,
                views: coaScans.length,
                unique_visitors: new Set(coaScans.map(s => s.ip_hash)).size,
                by_access_type: {
                    direct_link: coaScans.filter(s => s.access_type === 'direct_link').length,
                    qr_global: coaScans.filter(s => s.access_type === 'qr_global').length,
                    cvv_verification: coaScans.filter(s => s.access_type === 'cvv_verification').length,
                    pdf_link: coaScans.filter(s => s.access_type === 'pdf_link').length
                }
            };
        }).sort((a, b) => b.views - a.views);

        // Daily trend
        const dailyStats: { [key: string]: number } = {};
        allScans?.forEach(scan => {
            const date = new Date(scan.scanned_at).toISOString().split('T')[0];
            dailyStats[date] = (dailyStats[date] || 0) + 1;
        });

        const dailyTrend = Object.entries(dailyStats)
            .map(([date, views]) => ({ date, views }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            success: true,
            period: {
                days: periodDays,
                start: startDate.toISOString(),
                end: new Date().toISOString()
            },
            summary: {
                total_coas: coas.length,
                total_views: totalViews,
                unique_visitors: uniqueVisitors,
                pdf_downloads: pdfDownloads || 0
            },
            by_access_type: totalByAccessType,
            daily_trend: dailyTrend,
            coas: coaStats,
            top_coas: coaStats.slice(0, 5)
        });

    } catch (error) {
        console.error('[Analytics] Get client dashboard error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Get Super Admin Analytics Dashboard
// ============================================
export const getSuperAdminDashboard = async (req: Request, res: Response) => {
    try {
        const client = (req as any).client;

        if (client.role !== 'super_admin') {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        const { period = '30' } = req.query;
        const periodDays = parseInt(period as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get total COAs
        const { count: totalCOAs } = await supabase
            .from('coas')
            .select('*', { count: 'exact', head: true });

        // Get total clients
        const { count: totalClients } = await supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'client');

        // Get all scans in period
        const { data: allScans } = await supabase
            .from('coa_scans')
            .select('coa_id, ip_hash, access_type, device_type, country_code, scanned_at')
            .gte('scanned_at', startDate.toISOString());

        const totalViews = allScans?.length || 0;
        const uniqueVisitors = new Set(allScans?.map(s => s.ip_hash)).size;

        // By access type
        const byAccessType = {
            direct_link: allScans?.filter(s => s.access_type === 'direct_link').length || 0,
            qr_global: allScans?.filter(s => s.access_type === 'qr_global').length || 0,
            cvv_verification: allScans?.filter(s => s.access_type === 'cvv_verification').length || 0,
            pdf_link: allScans?.filter(s => s.access_type === 'pdf_link').length || 0
        };

        // By device
        const byDevice = {
            desktop: allScans?.filter(s => s.device_type === 'desktop').length || 0,
            mobile: allScans?.filter(s => s.device_type === 'mobile').length || 0,
            tablet: allScans?.filter(s => s.device_type === 'tablet').length || 0,
            bot: allScans?.filter(s => s.device_type === 'bot').length || 0
        };

        // Top countries
        const countryCounts: { [key: string]: number } = {};
        allScans?.forEach(scan => {
            if (scan.country_code) {
                countryCounts[scan.country_code] = (countryCounts[scan.country_code] || 0) + 1;
            }
        });
        const topCountries = Object.entries(countryCounts)
            .map(([code, count]) => ({ country_code: code, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Top COAs by views
        const coaViewCounts: { [key: string]: number } = {};
        allScans?.forEach(scan => {
            coaViewCounts[scan.coa_id] = (coaViewCounts[scan.coa_id] || 0) + 1;
        });

        const topCoaIds = Object.entries(coaViewCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([id]) => id);

        let topCOAs: any[] = [];
        if (topCoaIds.length > 0) {
            const { data: coaData } = await supabase
                .from('coas')
                .select('id, public_token, coa_number, custom_name, client:clients(name, email)')
                .in('id', topCoaIds);

            topCOAs = (coaData || []).map(coa => ({
                token: coa.public_token,
                coa_number: coa.coa_number,
                name: coa.custom_name,
                client_name: (coa.client as any)?.name || 'Sin asignar',
                views: coaViewCounts[coa.id] || 0
            })).sort((a, b) => b.views - a.views);
        }

        // Daily trend
        const dailyStats: { [key: string]: number } = {};
        allScans?.forEach(scan => {
            const date = new Date(scan.scanned_at).toISOString().split('T')[0];
            dailyStats[date] = (dailyStats[date] || 0) + 1;
        });

        const dailyTrend = Object.entries(dailyStats)
            .map(([date, views]) => ({ date, views }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Get PDF downloads
        const { count: pdfDownloads } = await supabase
            .from('pdf_downloads')
            .select('*', { count: 'exact', head: true })
            .gte('downloaded_at', startDate.toISOString());

        // Get suspicious activity count
        const { count: suspiciousCount } = await supabase
            .from('suspicious_activity')
            .select('*', { count: 'exact', head: true })
            .eq('is_resolved', false);

        // Top clients by COA views
        const { data: clientCOAs } = await supabase
            .from('coas')
            .select('client_id, client:clients(name, email)')
            .not('client_id', 'is', null);

        const clientViewCounts: { [key: string]: { name: string; email: string; views: number } } = {};
        clientCOAs?.forEach(coa => {
            if (coa.client_id && coaViewCounts[coa.client_id]) {
                const clientInfo = coa.client as any;
                if (!clientViewCounts[coa.client_id]) {
                    clientViewCounts[coa.client_id] = {
                        name: clientInfo?.name || 'Unknown',
                        email: clientInfo?.email || '',
                        views: 0
                    };
                }
                // This logic needs adjustment - we should aggregate COA views by client
            }
        });

        res.json({
            success: true,
            period: {
                days: periodDays,
                start: startDate.toISOString(),
                end: new Date().toISOString()
            },
            summary: {
                total_coas: totalCOAs || 0,
                total_clients: totalClients || 0,
                total_views: totalViews,
                unique_visitors: uniqueVisitors,
                pdf_downloads: pdfDownloads || 0,
                unresolved_suspicious: suspiciousCount || 0
            },
            by_access_type: byAccessType,
            by_device: byDevice,
            top_countries: topCountries,
            top_coas: topCOAs,
            daily_trend: dailyTrend
        });

    } catch (error) {
        console.error('[Analytics] Get super admin dashboard error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Log Suspicious Activity
// ============================================
export const logSuspiciousActivity = async (
    coaId: string | null,
    verificationCodeId: string | null,
    activityType: string,
    severity: string,
    details: any,
    req: Request
) => {
    try {
        const ip = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';
        const ipHash = hashIP(ip);
        const userAgent = req.headers['user-agent'] || '';

        await supabase
            .from('suspicious_activity')
            .insert({
                coa_id: coaId,
                verification_code_id: verificationCodeId,
                activity_type: activityType,
                severity,
                details,
                ip_address: ip,
                ip_hash: ipHash,
                user_agent: userAgent
            });

        console.log(`[Security] Suspicious activity logged: ${activityType} (${severity})`);
    } catch (error) {
        console.error('[Security] Error logging suspicious activity:', error);
    }
};

// ============================================
// Get Suspicious Activity (Super Admin)
// ============================================
export const getSuspiciousActivity = async (req: Request, res: Response) => {
    try {
        const client = (req as any).client;

        if (client.role !== 'super_admin') {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        const { resolved = 'false', severity, limit = '50' } = req.query;

        let query = supabase
            .from('suspicious_activity')
            .select(`
                *,
                coa:coas(public_token, coa_number, custom_name),
                resolver:clients!resolved_by(name, email)
            `)
            .order('detected_at', { ascending: false })
            .limit(parseInt(limit as string));

        if (resolved === 'false') {
            query = query.eq('is_resolved', false);
        } else if (resolved === 'true') {
            query = query.eq('is_resolved', true);
        }

        if (severity) {
            query = query.eq('severity', severity);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            activities: data || []
        });

    } catch (error) {
        console.error('[Analytics] Get suspicious activity error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// Resolve Suspicious Activity (Super Admin)
// ============================================
export const resolveSuspiciousActivity = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const client = (req as any).client;

        if (client.role !== 'super_admin') {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        const { error } = await supabase
            .from('suspicious_activity')
            .update({
                is_resolved: true,
                resolved_by: client.id,
                resolved_at: new Date().toISOString(),
                resolution_notes: notes || null
            })
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Actividad marcada como resuelta'
        });

    } catch (error) {
        console.error('[Analytics] Resolve suspicious activity error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
