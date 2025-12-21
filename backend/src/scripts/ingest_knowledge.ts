
import { createClient } from '@supabase/supabase-js';
import { AIService } from '../services/aiService';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// Initialize Services
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const aiService = AIService.getInstance();

const SOURCE_FILE = path.join(__dirname, '../../data/ai_knowledge_base/agents/ara_optimized/reviews_usuarios_full.md');

async function ingestReviews() {
    console.log('🚀 Starting Knowledge Ingestion...');

    if (!fs.existsSync(SOURCE_FILE)) {
        console.error('❌ Source file not found:', SOURCE_FILE);
        process.exit(1);
    }

    const content = fs.readFileSync(SOURCE_FILE, 'utf-8');

    // Parse Markdown Table
    // Skipping header lines and looking for rows starting with |
    const lines = content.split('\n');
    const reviews = [];

    let isTable = false;

    for (const line of lines) {
        if (line.includes('| Stars: ⭐')) isTable = true;
        if (!isTable || !line.trim().startsWith('|') || line.includes('---')) continue;

        // Extract columns: | Stars | Comment | ProductId | ProductURL |
        const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');

        if (cols.length >= 2) {
            const stars = cols[0];
            const comment = cols[1];
            const productId = cols[2] || '';
            const productUrl = cols[3] || '';

            // Skip "Stars: ⭐⭐⭐⭐⭐" headers repeating
            if (stars.includes('Stars:')) continue;
            if (comment === 'null' || comment === '') continue;

            reviews.push({
                stars,
                comment,
                productId,
                productUrl
            });
        }
    }

    console.log(`📦 Found ${reviews.length} reviews to ingest.`);

    let processed = 0;

    for (const review of reviews) {
        try {
            // Context text for embedding (what we search against)
            // "5 stars review for gummies: The flavor is amazing"
            const textToEmbed = `Review (${review.stars}): ${review.comment}`;

            // Full content to return to AI
            const contentBlock = `User Review:\nStars: ${review.stars}\nComment: "${review.comment}"\nProduct: ${review.productUrl}`;

            const embedding = await aiService.generateEmbedding(textToEmbed);

            const { error } = await supabase.from('knowledge_base').insert({
                content: contentBlock,
                embedding: embedding,
                metadata: {
                    type: 'review',
                    source: 'reviews_usuarios.md',
                    stars: review.stars,
                    product_id: review.productId
                }
            });

            if (error) throw error;

            processed++;
            if (processed % 10 === 0) process.stdout.write('.');

        } catch (err: any) {
            console.error(`\n❌ Failed to ingest review: ${review.comment.substring(0, 20)}...`, err.message);
        }
    }

    console.log(`\n✅ Ingestion Complete! Processed ${processed}/${reviews.length} items.`);
}

ingestReviews();
