
import { supabase } from '../config/supabase';

async function diagnoseBadgesMime() {
    console.log("=== DIAGNOSING BADGES MIME TYPES ===");

    // Minimal 1x1 Transparent PNG
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

    // Minimal 1x1 JPEG
    const jpgBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

    // Test PNG
    console.log("\n[1] Testing PNG Upload...");
    try {
        const fileName = `diag_png_${Date.now()}.png`;
        const { data, error } = await supabase.storage
            .from('badges')
            .upload(fileName, pngBuffer, { contentType: 'image/png' });

        if (error) console.error("❌ PNG Upload failed:", error);
        else {
            console.log("✅ PNG Upload successful.");
            await supabase.storage.from('badges').remove([fileName]);
        }
    } catch (e) { console.error(e); }

    // Test JPEG
    console.log("\n[2] Testing JPEG Upload...");
    try {
        const fileName = `diag_jpg_${Date.now()}.jpg`;
        const { data, error } = await supabase.storage
            .from('badges')
            .upload(fileName, jpgBuffer, { contentType: 'image/jpeg' });

        if (error) console.error("❌ JPEG Upload failed:", error);
        else {
            console.log("✅ JPEG Upload successful.");
            await supabase.storage.from('badges').remove([fileName]);
        }
    } catch (e) { console.error(e); }
}

diagnoseBadgesMime();
