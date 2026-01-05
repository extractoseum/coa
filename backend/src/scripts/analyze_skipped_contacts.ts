/**
 * Analyze skipped Vambe contacts - identify platforms (Meta, Instagram, TikTok, etc.)
 */

import fs from 'fs';
import path from 'path';

// Simple CSV parser
function parseCSV(content: string): any[] {
    const lines = content.split('\n');
    const headers = parseCSVLine(lines[0]);
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row: any = {};
        headers.forEach((h: string, idx: number) => {
            row[h] = values[idx] || '';
        });
        rows.push(row);
    }
    return rows;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function normalizePhone(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
        digits = digits.slice(-10);
    }
    return digits;
}

async function analyzeSkippedContacts() {
    console.log('\n========================================');
    console.log('🔍 ANÁLISIS DE CONTACTOS SIN TELÉFONO/EMAIL');
    console.log('========================================\n');

    // Load CSV
    const csvPath = path.join(__dirname, '../../../ASSETS_BRAND/d4ac021e-7b7d-406e-808a-4ec13494087d-export-contacts-eum-1766164251380.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const vambeContacts = parseCSV(csvContent);

    // Filter skipped (no valid phone or email)
    const skipped = vambeContacts.filter(c => {
        const normalizedPhone = normalizePhone(c.phone);
        const email = (c.email || '').toLowerCase().trim();
        return normalizedPhone.length !== 10 && !email;
    });

    console.log(`📊 Total skipped contacts: ${skipped.length}\n`);

    // Analyze by platform
    const byPlatform: Record<string, any[]> = {};
    const byChannel: Record<string, any[]> = {};
    const byAdPlatform: Record<string, any[]> = {};

    for (const contact of skipped) {
        // Platform
        const platform = contact.platform || 'unknown';
        if (!byPlatform[platform]) byPlatform[platform] = [];
        byPlatform[platform].push(contact);

        // Channel
        const channel = contact.channel || 'unknown';
        if (!byChannel[channel]) byChannel[channel] = [];
        byChannel[channel].push(contact);

        // Ad Platform
        const adPlatform = contact.adPlatform || 'unknown';
        if (!byAdPlatform[adPlatform]) byAdPlatform[adPlatform] = [];
        byAdPlatform[adPlatform].push(contact);
    }

    // Print platform breakdown
    console.log('========================================');
    console.log('📱 BY PLATFORM (source)');
    console.log('========================================\n');

    Object.entries(byPlatform)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([platform, contacts]) => {
            const pct = ((contacts.length / skipped.length) * 100).toFixed(1);
            console.log(`  ${platform.padEnd(20)} ${contacts.length.toString().padStart(5)} (${pct}%)`);
        });

    console.log('\n========================================');
    console.log('📡 BY CHANNEL');
    console.log('========================================\n');

    Object.entries(byChannel)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([channel, contacts]) => {
            const pct = ((contacts.length / skipped.length) * 100).toFixed(1);
            console.log(`  ${channel.padEnd(20)} ${contacts.length.toString().padStart(5)} (${pct}%)`);
        });

    console.log('\n========================================');
    console.log('📢 BY AD PLATFORM');
    console.log('========================================\n');

    Object.entries(byAdPlatform)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([adPlatform, contacts]) => {
            const pct = ((contacts.length / skipped.length) * 100).toFixed(1);
            console.log(`  ${adPlatform.padEnd(20)} ${contacts.length.toString().padStart(5)} (${pct}%)`);
        });

    // Sample some skipped contacts
    console.log('\n========================================');
    console.log('🔍 SAMPLE SKIPPED CONTACTS');
    console.log('========================================\n');

    // Get samples from different platforms
    const platforms = ['instagram', 'facebook', 'tiktok', 'web-whatsapp'];

    for (const platform of platforms) {
        const samples = byPlatform[platform]?.slice(0, 3) || [];
        if (samples.length > 0) {
            console.log(`\n📱 ${platform.toUpperCase()}:`);
            for (const c of samples) {
                console.log(`  - Name: ${c.contactName || 'N/A'}`);
                console.log(`    Phone field: "${c.phone}"`);
                console.log(`    Contact ID: ${c.contactId}`);
                console.log(`    Instagram: ${c.instagram_username || 'N/A'}`);
                console.log(`    Tags: ${c.contactTags || 'N/A'}`);
                console.log(`    Last message: ${(c.lastMessageContent || '').substring(0, 50)}...`);
                console.log('');
            }
        }
    }

    // Analyze what data we DO have for these contacts
    console.log('\n========================================');
    console.log('💡 DATOS DISPONIBLES EN CONTACTOS SIN PHONE');
    console.log('========================================\n');

    const dataAvailable = {
        withContactId: skipped.filter(c => c.contactId).length,
        withName: skipped.filter(c => c.contactName && c.contactName !== '.').length,
        withInstagram: skipped.filter(c => c.instagram_username).length,
        withTags: skipped.filter(c => c.contactTags).length,
        withProductInterest: skipped.filter(c => c['producto de interés']).length,
        withLastMessage: skipped.filter(c => c.lastMessageContent).length,
        withUtm: skipped.filter(c => c.utmCampaignId).length
    };

    console.log(`  📌 Con Contact ID: ${dataAvailable.withContactId}`);
    console.log(`  👤 Con Nombre: ${dataAvailable.withName}`);
    console.log(`  📸 Con Instagram username: ${dataAvailable.withInstagram}`);
    console.log(`  🏷️  Con Tags: ${dataAvailable.withTags}`);
    console.log(`  🛒 Con Producto de interés: ${dataAvailable.withProductInterest}`);
    console.log(`  💬 Con Último mensaje: ${dataAvailable.withLastMessage}`);
    console.log(`  📊 Con UTM: ${dataAvailable.withUtm}`);

    // Check phone field for patterns (might contain social media IDs)
    console.log('\n========================================');
    console.log('🔍 ANÁLISIS DEL CAMPO "PHONE"');
    console.log('========================================\n');

    const phonePatterns: Record<string, number> = {
        'empty': 0,
        'has_letters': 0,
        'short_number': 0,
        'looks_like_id': 0,
        'other': 0
    };

    for (const c of skipped) {
        const phone = c.phone || '';
        if (!phone) {
            phonePatterns['empty']++;
        } else if (/[a-zA-Z]/.test(phone)) {
            phonePatterns['has_letters']++;
        } else if (phone.replace(/\D/g, '').length < 10) {
            phonePatterns['short_number']++;
        } else if (phone.length > 20) {
            phonePatterns['looks_like_id']++;
        } else {
            phonePatterns['other']++;
        }
    }

    Object.entries(phonePatterns).forEach(([pattern, count]) => {
        console.log(`  ${pattern.padEnd(20)} ${count}`);
    });

    // Sample phone fields that have letters (likely social media handles)
    console.log('\n📋 Samples of phone fields with letters:');
    const withLetters = skipped.filter(c => c.phone && /[a-zA-Z]/.test(c.phone)).slice(0, 10);
    for (const c of withLetters) {
        console.log(`  "${c.phone.substring(0, 80)}${c.phone.length > 80 ? '...' : ''}"`);
    }

    return {
        total: skipped.length,
        byPlatform,
        byChannel,
        byAdPlatform,
        dataAvailable
    };
}

analyzeSkippedContacts().catch(console.error);
