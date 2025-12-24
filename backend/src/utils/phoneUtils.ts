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

    // 2. Handle International logic

    // CASE A: USA/Canada (11 digits starting with 1)
    if (clean.length === 11 && clean.startsWith('1')) {
        // Already normalized, just proceed to provider formatting
    }
    // CASE B: Mexico 10-digit logic (Ambiguity check)
    else if (clean.length === 10) {
        // If it starts with 1, it's likely a US number missing the + (e.g. 1 303...)
        // But 1 is not a valid start for a 10-digit MX mobile number (normally starts with 5, 3, 2, etc.)
        // However, some MX area codes might eventually overlap. 
        // For now, if length is exactly 10, we treat as MX per user requirement unless it explicitly had a '1' prefix.
        clean = '521' + clean;
    }
    // CASE C: Already has 52 prefix
    else if (clean.length === 12 && clean.startsWith('52') && !clean.startsWith('521')) {
        clean = '521' + clean.substring(2);
    }
    // If it's already 13 digits (521...), keep it.

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
