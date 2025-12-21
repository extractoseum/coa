
import { supabase } from '../config/supabase';

async function testStorage() {
    console.log("Testing Supabase Storage...");

    // 1. List Buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
        console.error("Error listing buckets:", listError);
    } else {
        console.log("Buckets found:", buckets.map(b => b.name));

        // AUTO-FIX: Create bucket if missing
        if (!buckets.find(b => b.name === 'coas')) {
            console.log("Bucket 'coas' missing. Attempting creation...");
            const { data: bucket, error: createError } = await supabase.storage.createBucket('coas', {
                public: true
            });
            if (createError) console.error("Error creating bucket:", createError);
            else console.log("Bucket 'coas' created successfully.");
        }
    }

    // 2. Try Upload
    const fileName = `test_${Date.now()}.txt`;
    console.log(`Attempting to upload ${fileName} to 'coas' bucket...`);

    const { data, error } = await supabase
        .storage
        .from('coas')
        .upload(fileName, 'Hello World', {
            contentType: 'text/plain',
            upsert: false
        });

    if (error) {
        console.error("CRITICAL: Upload failed!", error);
    } else {
        console.log("SUCCESS: Upload verified.", data);

        // Cleanup
        /*
        const { error: delError } = await supabase.storage.from('coas').remove([fileName]);
        if (delError) console.error("Error deleting test file:", delError);
        else console.log("Cleanup successful");
        */
    }
}

testStorage();
