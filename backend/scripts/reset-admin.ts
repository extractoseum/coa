import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resetAdmin() {
    const email = 'badlt@extractoseum.com';
    const newPassword = 'EUM2024Admin!'; // Cambia esto por tu contraseña deseada

    console.log(`Resetting password for: ${email}`);

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Check if admin exists
    const { data: existing, error: findError } = await supabase
        .from('clients')
        .select('id, email, role')
        .eq('email', email.toLowerCase())
        .single();

    if (existing) {
        // Update existing admin
        const { error } = await supabase
            .from('clients')
            .update({
                password_hash: passwordHash,
                role: 'super_admin',
                is_active: true
            })
            .eq('id', existing.id);

        if (error) {
            console.error('Error updating admin:', error);
            return;
        }
        console.log('Admin password updated successfully!');
    } else {
        // Create new admin
        const { error } = await supabase
            .from('clients')
            .insert({
                email: email.toLowerCase(),
                password_hash: passwordHash,
                name: 'Super Admin',
                role: 'super_admin',
                is_active: true
            });

        if (error) {
            console.error('Error creating admin:', error);
            return;
        }
        console.log('Admin created successfully!');
    }

    console.log('\n=== CREDENCIALES ===');
    console.log(`Email: ${email}`);
    console.log(`Password: ${newPassword}`);
    console.log('====================\n');
}

resetAdmin().then(() => process.exit(0));
