/**
 * Shopify Admin API Service
 *
 * Provides functions to search and create customers in Shopify
 * using the Admin API.
 */

import { cleanupPhone } from '../utils/phoneUtils';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || '';

/**
 * Find Shopify customer by email using Admin API
 */
export async function findShopifyCustomerByEmail(email: string): Promise<any> {
    try {
        const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
        if (!adminToken || !SHOPIFY_STORE_DOMAIN) return null;

        const response = await fetch(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
            {
                headers: {
                    'X-Shopify-Access-Token': adminToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            console.error('Shopify search error:', await response.text());
            return null;
        }

        const data = await response.json();
        const customer = data.customers?.[0] || null;

        // Parse Shopify tags into array
        if (customer && customer.tags) {
            customer.tagsArray = customer.tags.split(',').map((t: string) => t.trim());
        } else if (customer) {
            customer.tagsArray = [];
        }

        return customer;
    } catch (err) {
        console.error('Error searching Shopify customer:', err);
        return null;
    }
}

/**
 * Find Shopify customer by phone using Admin API
 */
export async function findShopifyCustomerByPhone(phone: string): Promise<any> {
    try {
        const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
        if (!adminToken || !SHOPIFY_STORE_DOMAIN) return null;

        const cleanPhone = cleanupPhone(phone);

        console.log(`[Shopify] Searching for phone containing: ${cleanPhone}`);

        const response = await fetch(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/search.json?query=phone:${cleanPhone}`,
            {
                headers: {
                    'X-Shopify-Access-Token': adminToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            console.error('Shopify search error:', await response.text());
            return null;
        }

        const data = await response.json();
        let customer = null;

        // Smart Filtering: Find the best match
        if (data.customers && data.customers.length > 0) {
            // Priority 1: Exact match on last 10 digits
            customer = data.customers.find((c: any) => {
                if (!c.phone) return false;
                const p = c.phone.replace(/\D/g, '');
                return p.includes(cleanPhone);
            });

            // Priority 2: Fallback to first if strict match fails
            if (!customer) customer = data.customers[0];
        }

        // Fallback: Try exact match if they provided country code
        if (!customer && phone.length > 10) {
            console.log(`[Shopify] Retrying with exact string: ${phone}`);
            const responseExact = await fetch(
                `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/search.json?query=phone:${phone}`,
                {
                    headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' }
                }
            );
            if (responseExact.ok) {
                const dataExact = await responseExact.json();
                customer = dataExact.customers?.[0] || null;
            }
        }

        // Parse Shopify tags into array
        if (customer && customer.tags) {
            customer.tagsArray = customer.tags.split(',').map((t: string) => t.trim());
        } else if (customer) {
            customer.tagsArray = [];
        }

        return customer;
    } catch (err) {
        console.error('Error searching Shopify customer by phone:', err);
        return null;
    }
}

/**
 * Create customer in Shopify
 */
export async function createShopifyCustomer(identifier: string, isEmail: boolean): Promise<any> {
    try {
        const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
        const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;

        if (!adminToken || !storeDomain) {
            console.log('Shopify Admin API not configured, skipping Shopify customer creation');
            return null;
        }

        const customerData: any = {
            customer: {
                verified_email: false,
                send_email_welcome: false,
                tags: 'coa-viewer-user'
            }
        };

        if (isEmail) {
            customerData.customer.email = identifier;
        } else {
            customerData.customer.phone = identifier;
        }

        const response = await fetch(
            `https://${storeDomain}/admin/api/2024-01/customers.json`,
            {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': adminToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(customerData)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Shopify customer creation error:', errorText);
            return null;
        }

        const data = await response.json();
        return data.customer;
    } catch (err) {
        console.error('Error creating Shopify customer:', err);
        return null;
    }
}
