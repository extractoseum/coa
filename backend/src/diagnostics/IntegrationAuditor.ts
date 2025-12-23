import { supabase } from '../config/supabase';
import axios from 'axios';

interface IntegrationCheck {
    name: string;
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNCONFIGURED';
    latency?: number;
    details?: any;
    error?: string;
}

export class IntegrationAuditor {
    async auditAll(): Promise<IntegrationCheck[]> {
        return await Promise.all([
            this.checkSupabase(),
            this.checkWhapi(),
            this.checkOpenAI(),
            this.checkShopify()
        ]);
    }

    async checkSupabase(): Promise<IntegrationCheck> {
        const start = Date.now();
        try {
            const { error } = await supabase
                .from('conversations')
                .select('id')
                .limit(1);

            return {
                name: 'Supabase',
                status: error ? 'DEGRADED' : 'HEALTHY',
                latency: Date.now() - start,
                error: error?.message
            };
        } catch (e: any) {
            return {
                name: 'Supabase',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }

    async checkWhapi(): Promise<IntegrationCheck> {
        const start = Date.now();
        const token = process.env.WHAPI_TOKEN;

        if (!token) {
            return {
                name: 'Whapi (WhatsApp)',
                status: 'UNCONFIGURED',
                details: { reason: 'WHAPI_TOKEN not set' }
            };
        }

        try {
            const response = await axios.get('https://gate.whapi.cloud/health', {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 5000
            });

            return {
                name: 'Whapi (WhatsApp)',
                status: response.status === 200 ? 'HEALTHY' : 'DEGRADED',
                latency: Date.now() - start,
                details: response.data
            };
        } catch (e: any) {
            return {
                name: 'Whapi (WhatsApp)',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }

    async checkOpenAI(): Promise<IntegrationCheck> {
        const start = Date.now();
        const token = process.env.OPENAI_API_KEY;

        if (!token) {
            return {
                name: 'OpenAI',
                status: 'UNCONFIGURED',
                details: { reason: 'OPENAI_API_KEY not set' }
            };
        }

        try {
            const response = await axios.get('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 5000
            });

            return {
                name: 'OpenAI',
                status: response.status === 200 ? 'HEALTHY' : 'DEGRADED',
                latency: Date.now() - start
            };
        } catch (e: any) {
            return {
                name: 'OpenAI',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }

    async checkShopify(): Promise<IntegrationCheck> {
        const start = Date.now();
        const store = process.env.SHOPIFY_STORE_DOMAIN;
        const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

        if (!store || !token) {
            return {
                name: 'Shopify',
                status: 'UNCONFIGURED',
                details: { reason: 'SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_ACCESS_TOKEN not set' }
            };
        }

        try {
            const response = await axios.get(`https://${store}/admin/api/2024-01/shop.json`, {
                headers: { 'X-Shopify-Access-Token': token },
                timeout: 5000
            });

            return {
                name: 'Shopify',
                status: response.status === 200 ? 'HEALTHY' : 'DEGRADED',
                latency: Date.now() - start,
                error: response.status === 200 ? undefined : `Status ${response.status}`
            };
        } catch (e: any) {
            return {
                name: 'Shopify',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }
}
