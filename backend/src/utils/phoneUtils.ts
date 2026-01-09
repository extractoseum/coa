/**
 * Centralized Phone Normalization Logic
 * Handles Mexico-specific logic (521 prefix) and provider nuances.
 */

/**
 * Simple cleanup for DB matching and deduplication.
 * Returns last 10 digits for Mexico, or 11 digits for USA/Canada (starting with 1).
 */
export const cleanupPhone = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');

    // Heuristic: If it's 11 digits and starts with 1, it's USA/Canada canonical
    if (clean.length === 11 && clean.startsWith('1')) {
        return clean;
    }

    // Default to last 10 digits (Standard for Mexico anchoring)
    return clean.slice(-10);
};

export const normalizePhone = (phone: string, provider: 'whapi' | 'twilio' | 'vapi' | 'general' = 'general'): string => {
    // 1. Remove non-digits
    let clean = phone.replace(/\D/g, '');

    // 2. Handle International logic based on provider
    // WhatsApp (whapi) requires the mobile prefix '1' for Mexico (521)
    // Voice calls (vapi/twilio) use standard E.164 without mobile prefix (52)

    // CASE A: USA/Canada (11 digits starting with 1)
    if (clean.length === 11 && clean.startsWith('1')) {
        // Already normalized for US/Canada
    }
    // CASE B: Mexico 10-digit logic
    else if (clean.length === 10) {
        if (provider === 'whapi') {
            // WhatsApp requires 521 prefix for Mexican mobile numbers
            clean = '521' + clean;
        } else {
            // Voice calls (VAPI/Twilio) use standard 52 prefix
            clean = '52' + clean;
        }
    }
    // CASE C: Already has 52 prefix (12 digits)
    else if (clean.length === 12 && clean.startsWith('52')) {
        if (provider === 'whapi' && !clean.startsWith('521')) {
            // WhatsApp needs 521
            clean = '521' + clean.substring(2);
        } else if (provider !== 'whapi' && clean.startsWith('521')) {
            // Voice calls don't need the mobile '1'
            clean = '52' + clean.substring(3);
        }
    }
    // CASE D: Already 13 digits (521...)
    else if (clean.length === 13 && clean.startsWith('521')) {
        if (provider !== 'whapi') {
            // Voice calls: remove the mobile '1'
            clean = '52' + clean.substring(3);
        }
    }

    // 3. Format based on Provider
    switch (provider) {
        case 'whapi':
            // Whapi expects NO plus sign (e.g., 52155..., 1303...)
            return clean;

        case 'twilio':
        case 'vapi':
            // E.164 Standard (Requires +)
            return '+' + clean;

        case 'general':
        default:
            return '+' + clean;
    }
};
