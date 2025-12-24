/**
 * Avatar Backfill Script
 *
 * Este script re-sincroniza los avatares de todos los contactos de WhatsApp
 * que actualmente no tienen avatar en la base de datos.
 *
 * IMPORTANTE: Ejecutar DESPUÉS de reconectar WhatsApp en Whapi dashboard
 *
 * Uso: npx ts-node scripts/backfill_avatars.ts
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

// Rate limiting - Whapi allows ~100 requests/minute
const DELAY_BETWEEN_REQUESTS = 700; // 700ms between requests
const BATCH_SIZE = 50;

interface ContactSnapshot {
    id: string;
    handle: string;
    name: string;
    channel: string;
    avatar_url: string | null;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAvatarFromWhapi(phone: string): Promise<string | null> {
    try {
        // Normalizar a formato Whapi (521 + 10 dígitos para México)
        let normalizedPhone = phone.replace(/\D/g, '');

        // Si es 10 dígitos, agregar 521 (México)
        if (normalizedPhone.length === 10) {
            normalizedPhone = '521' + normalizedPhone;
        }
        // Si es 12 dígitos (52 + 10), agregar el 1
        else if (normalizedPhone.length === 12 && normalizedPhone.startsWith('52') && !normalizedPhone.startsWith('521')) {
            normalizedPhone = '521' + normalizedPhone.substring(2);
        }
        // Si es 11 dígitos y empieza con 1 (USA/Canada), dejarlo así
        else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
            // Ya está bien
        }

        const response = await axios.get(
            `${WHAPI_BASE_URL}/contacts/${normalizedPhone}/profile`,
            {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const data = response.data;
        const avatarUrl = data?.icon_full || data?.icon || null;

        // Solo retornar si es una URL válida (no string vacío)
        if (avatarUrl && avatarUrl.length > 10 && avatarUrl.startsWith('http')) {
            return avatarUrl;
        }

        return null;
    } catch (error: any) {
        // 404 = usuario no encontrado en WhatsApp
        if (error.response?.status === 404) {
            return null;
        }
        console.error(`Error fetching avatar for ${phone}:`, error.message);
        return null;
    }
}

async function updateSnapshotAvatar(handle: string, avatarUrl: string) {
    const { error } = await supabase
        .from('crm_contact_snapshots')
        .update({
            avatar_url: avatarUrl,
            last_updated_at: new Date().toISOString()
        })
        .eq('handle', handle);

    if (error) {
        console.error(`Error updating ${handle}:`, error.message);
        return false;
    }
    return true;
}

async function getContactsWithoutAvatar(): Promise<ContactSnapshot[]> {
    const { data, error } = await supabase
        .from('crm_contact_snapshots')
        .select('id, handle, name, channel, avatar_url')
        .eq('channel', 'WA')
        .is('avatar_url', null)
        .order('last_updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching contacts:', error.message);
        return [];
    }

    return data || [];
}

async function main() {
    console.log('===========================================');
    console.log('  AVATAR BACKFILL SCRIPT');
    console.log('===========================================\n');

    // Verificar configuración
    if (!WHAPI_TOKEN) {
        console.error('ERROR: WHAPI_TOKEN no configurado');
        process.exit(1);
    }

    // Obtener contactos sin avatar
    console.log('Obteniendo contactos sin avatar...');
    const contacts = await getContactsWithoutAvatar();
    console.log(`Encontrados: ${contacts.length} contactos sin avatar\n`);

    if (contacts.length === 0) {
        console.log('¡Todos los contactos ya tienen avatar!');
        return;
    }

    // Estadísticas
    let processed = 0;
    let updated = 0;
    let noAvatar = 0;
    let errors = 0;

    console.log('Iniciando backfill...\n');
    console.log('Progreso:');

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE);

        for (const contact of batch) {
            processed++;

            // Obtener avatar de Whapi
            const avatarUrl = await getAvatarFromWhapi(contact.handle);

            if (avatarUrl) {
                const success = await updateSnapshotAvatar(contact.handle, avatarUrl);
                if (success) {
                    updated++;
                    console.log(`  ✅ ${contact.handle} (${contact.name || 'sin nombre'})`);
                } else {
                    errors++;
                }
            } else {
                noAvatar++;
                // Solo mostrar cada 10 para no saturar la consola
                if (noAvatar % 10 === 0) {
                    console.log(`  ⚪ ${noAvatar} contactos sin avatar disponible...`);
                }
            }

            // Rate limiting
            await sleep(DELAY_BETWEEN_REQUESTS);

            // Mostrar progreso cada 20 contactos
            if (processed % 20 === 0) {
                const percent = ((processed / contacts.length) * 100).toFixed(1);
                console.log(`\n[${percent}%] Procesados: ${processed}/${contacts.length} | Actualizados: ${updated} | Sin avatar: ${noAvatar}\n`);
            }
        }
    }

    // Resumen final
    console.log('\n===========================================');
    console.log('  RESUMEN FINAL');
    console.log('===========================================');
    console.log(`Total procesados: ${processed}`);
    console.log(`Avatares actualizados: ${updated}`);
    console.log(`Sin avatar disponible: ${noAvatar}`);
    console.log(`Errores: ${errors}`);
    console.log(`Tasa de éxito: ${((updated / processed) * 100).toFixed(1)}%`);
    console.log('===========================================\n');
}

main().catch(console.error);
