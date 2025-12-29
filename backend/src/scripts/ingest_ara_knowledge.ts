/**
 * Script para ingestar el conocimiento de Ara a la base de datos vectorial
 *
 * Este script procesa todos los archivos MD en:
 * - sales_ara/knowledge/*.md
 * - sales_ara/data/*.md
 * - sales_ara/reviews_usuarios_full.md
 *
 * Y los convierte en embeddings para búsqueda semántica
 */

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

const BASE_PATH = path.join(__dirname, '../../data/ai_knowledge_base/agents_public/sales_ara');

interface KnowledgeChunk {
    content: string;
    source: string;
    type: string;
    section?: string;
}

/**
 * Divide un archivo MD en chunks semánticos basados en headers
 */
function chunkMarkdownFile(filePath: string): KnowledgeChunk[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath, '.md');
    const chunks: KnowledgeChunk[] = [];

    // Split by ## headers (level 2)
    const sections = content.split(/(?=^## )/m);

    for (const section of sections) {
        if (section.trim().length < 50) continue; // Skip very short sections

        // Extract header from section
        const headerMatch = section.match(/^##\s+(.+?)(?:\n|$)/);
        const sectionTitle = headerMatch ? headerMatch[1].trim() : 'General';

        // Clean up the content
        const cleanContent = section
            .replace(/^##\s+.+?\n/, '') // Remove header line
            .replace(/---+/g, '') // Remove horizontal rules
            .trim();

        if (cleanContent.length < 30) continue;

        // For large sections, split by ### subsections
        if (cleanContent.length > 2000) {
            const subsections = cleanContent.split(/(?=^### )/m);
            for (const subsection of subsections) {
                if (subsection.trim().length < 50) continue;

                const subHeaderMatch = subsection.match(/^###\s+(.+?)(?:\n|$)/);
                const subTitle = subHeaderMatch ? subHeaderMatch[1].trim() : '';

                chunks.push({
                    content: subsection.trim(),
                    source: fileName,
                    type: getDocumentType(fileName),
                    section: subTitle ? `${sectionTitle} > ${subTitle}` : sectionTitle
                });
            }
        } else {
            chunks.push({
                content: cleanContent,
                source: fileName,
                type: getDocumentType(fileName),
                section: sectionTitle
            });
        }
    }

    // If no sections found, treat entire file as one chunk
    if (chunks.length === 0 && content.trim().length > 50) {
        chunks.push({
            content: content.trim(),
            source: fileName,
            type: getDocumentType(fileName),
            section: 'Full Document'
        });
    }

    return chunks;
}

/**
 * Determina el tipo de documento basado en el nombre del archivo
 */
function getDocumentType(fileName: string): string {
    const typeMap: Record<string, string> = {
        'sales_techniques': 'ventas',
        'product_rules': 'productos',
        'shipping_logistics': 'envios',
        'transfer_protocols': 'transferencia',
        'special_policies': 'politicas',
        'candy_kush_guide': 'productos_candy',
        'effects_research': 'efectos',
        'post_sale_retention': 'postventa',
        'postal_codes': 'codigos_postales',
        'reviews_usuarios_full': 'reviews',
        'instructivo': 'guia'
    };

    return typeMap[fileName] || 'general';
}

/**
 * Proceso principal de ingestión
 */
async function ingestAraKnowledge() {
    console.log('🧠 Starting Ara Knowledge Base Ingestion...\n');

    const allChunks: KnowledgeChunk[] = [];

    // 1. Process knowledge folder
    const knowledgePath = path.join(BASE_PATH, 'knowledge');
    if (fs.existsSync(knowledgePath)) {
        const knowledgeFiles = fs.readdirSync(knowledgePath).filter(f => f.endsWith('.md'));
        console.log(`📚 Found ${knowledgeFiles.length} knowledge files`);

        for (const file of knowledgeFiles) {
            const filePath = path.join(knowledgePath, file);
            const chunks = chunkMarkdownFile(filePath);
            allChunks.push(...chunks);
            console.log(`   ✓ ${file}: ${chunks.length} chunks`);
        }
    }

    // 2. Process data folder
    const dataPath = path.join(BASE_PATH, 'data');
    if (fs.existsSync(dataPath)) {
        const dataFiles = fs.readdirSync(dataPath).filter(f => f.endsWith('.md'));
        console.log(`📊 Found ${dataFiles.length} data files`);

        for (const file of dataFiles) {
            const filePath = path.join(dataPath, file);
            const chunks = chunkMarkdownFile(filePath);
            allChunks.push(...chunks);
            console.log(`   ✓ ${file}: ${chunks.length} chunks`);
        }
    }

    // 3. Process reviews file
    const reviewsPath = path.join(BASE_PATH, 'reviews_usuarios_full.md');
    if (fs.existsSync(reviewsPath)) {
        const chunks = chunkMarkdownFile(reviewsPath);
        allChunks.push(...chunks);
        console.log(`📝 Reviews: ${chunks.length} chunks`);
    }

    // 4. Process instructivo file
    const instructivoPath = path.join(BASE_PATH, 'instructivo.md');
    if (fs.existsSync(instructivoPath)) {
        const chunks = chunkMarkdownFile(instructivoPath);
        allChunks.push(...chunks);
        console.log(`📖 Instructivo: ${chunks.length} chunks`);
    }

    console.log(`\n📦 Total chunks to ingest: ${allChunks.length}\n`);

    // Clear existing Ara knowledge (optional - comment out to append)
    console.log('🗑️  Clearing existing Ara knowledge...');
    const { error: deleteError } = await supabase
        .from('knowledge_base')
        .delete()
        .like('metadata->>source', '%');

    if (deleteError) {
        console.warn('⚠️  Could not clear existing knowledge:', deleteError.message);
    }

    // 5. Ingest all chunks
    let processed = 0;
    let errors = 0;

    console.log('🚀 Starting ingestion...\n');

    for (const chunk of allChunks) {
        try {
            // Generate text for embedding (include context)
            const textToEmbed = `[${chunk.type}] ${chunk.section || ''}: ${chunk.content}`;

            const embedding = await aiService.generateEmbedding(textToEmbed);

            const { error } = await supabase.from('knowledge_base').insert({
                content: chunk.content,
                embedding: embedding,
                metadata: {
                    type: chunk.type,
                    source: chunk.source,
                    section: chunk.section || null,
                    agent: 'ara'
                }
            });

            if (error) throw error;

            processed++;

            // Progress indicator
            if (processed % 5 === 0) {
                process.stdout.write(`\r   Progress: ${processed}/${allChunks.length} (${Math.round(processed/allChunks.length*100)}%)`);
            }

            // Rate limiting to avoid API limits
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (err: any) {
            errors++;
            console.error(`\n❌ Failed chunk from ${chunk.source}: ${err.message}`);
        }
    }

    console.log(`\n\n✅ Ingestion Complete!`);
    console.log(`   Processed: ${processed}/${allChunks.length}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\n💡 Ara now has access to all knowledge modules via search_knowledge_base`);
}

// Run
ingestAraKnowledge().catch(console.error);
