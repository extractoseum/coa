/**
 * Centralized Phone Normalization Logic
 * Handles Mexico-specific logic (521 prefix) and provider nuances.
 */

/**
 * Simple cleanup for DB matching and deduplication.
 * Returns last 10 digits only.
 */
export const cleanupPhone = (phone: string): string => {
    return phone.replace(/\D/g, '').slice(-10);
};

export const normalizePhone = (phone: string, provider: 'whapi' | 'twilio' | 'vapi' | 'general' = 'general'): string => {
    // 1. Remove non-digits
    let clean = phone.replace(/\D/g, '');

    // 2. Handle Mexico 10-digit logic
    // If it's valid 10 digits, assume Mexico mobile -> Add 521
    if (clean.length === 10) {
        clean = '521' + clean;
    }
    // If it's 12 digits starting with 52 but NOT 521 (e.g. 5255...), inject the 1 for mobile
    // Note: This is a safe heuristic for mobile, but landlines don't use 1. 
    // Given the project context (WhatsApp/SMS), we prioritize Mobile format.
    else if (clean.length === 12 && clean.startsWith('52') && !clean.startsWith('521')) {
        clean = '521' + clean.substring(2);
    }
    // If it's already 13 digits (521...), keep it.

    // 3. Format based on Provider
    switch (provider) {
        case 'whapi':
            // Whapi expects NO plus sign (e.g., 52155...)
            return clean;

        case 'twilio':
        case 'vapi':
            // E.164 Standard (Requires +)
            return '+' + clean;

        case 'general':
        default:
            // return Clean format (no plus) or E.164? 
            // Let's stick to E.164 as general internal standard, but Whapi is the exception
            return '+' + clean;
    }
};
