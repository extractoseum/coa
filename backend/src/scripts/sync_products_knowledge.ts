/**
 * Script para sincronizar productos de Shopify al Knowledge Base de Ara
 *
 * Este script:
 * 1. Lee productos de la tabla `products` (ya sincronizada desde Shopify)
 * 2. Genera archivos MD con información estructurada
 * 3. Los guarda en sales_ara/products/ para acceso del agente
 * 4. Opcionalmente genera embeddings para búsqueda semántica
 *
 * Ejecutar: npx ts-node src/scripts/sync_products_knowledge.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Output paths
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '../../data/ai_knowledge_base/agents_public/sales_ara');
const PRODUCTS_PATH = path.join(KNOWLEDGE_BASE_PATH, 'products');

interface Product {
    id: number;
    title: string;
    handle: string;
    product_type: string | null;
    vendor: string | null;
    tags: string[];
    description: string | null;
    description_plain: string | null;
    variants: Array<{
        id: number;
        title: string;
        price: string;
        sku: string | null;
        inventory_quantity: number;
    }>;
    images: Array<{
        id: number;
        src: string;
        alt: string | null;
    }>;
    status: string;
}

/**
 * Genera contenido MD para un producto
 */
function generateProductMD(product: Product): string {
    const totalStock = product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
    const stockStatus = totalStock > 0 ? '✅ En Stock' : '❌ Agotado';
    const minPrice = Math.min(...product.variants.map(v => parseFloat(v.price) || 0));
    const maxPrice = Math.max(...product.variants.map(v => parseFloat(v.price) || 0));
    const priceRange = minPrice === maxPrice ? `$${minPrice} MXN` : `$${minPrice} - $${maxPrice} MXN`;

    let md = `# ${product.title}\n\n`;
    md += `**SKU Base:** ${product.variants[0]?.sku || 'N/A'}\n`;
    md += `**Tipo:** ${product.product_type || 'General'}\n`;
    md += `**Estado:** ${stockStatus} (${totalStock} unidades)\n`;
    md += `**Precio:** ${priceRange}\n`;
    md += `**Link:** https://extractoseum.com/products/${product.handle}\n\n`;

    // Tags como keywords
    if (product.tags && product.tags.length > 0) {
        md += `**Tags:** ${product.tags.join(', ')}\n\n`;
    }

    md += `---\n\n`;

    // Descripción
    if (product.description_plain) {
        md += `## Descripción\n\n${product.description_plain}\n\n`;
    }

    // Variantes con precios
    if (product.variants.length > 1 || (product.variants.length === 1 && product.variants[0].title !== 'Default Title')) {
        md += `## Presentaciones Disponibles\n\n`;
        md += `| Variante | Precio | Stock | SKU |\n`;
        md += `|----------|--------|-------|-----|\n`;
        for (const variant of product.variants) {
            const variantStock = variant.inventory_quantity > 0 ? `${variant.inventory_quantity}` : 'Agotado';
            const variantTitle = variant.title === 'Default Title' ? product.title : variant.title;
            md += `| ${variantTitle} | $${variant.price} MXN | ${variantStock} | ${variant.sku || 'N/A'} |\n`;
        }
        md += `\n`;
    }

    // Imágenes (solo la primera para referencia)
    if (product.images && product.images.length > 0) {
        md += `## Imagen\n\n`;
        md += `![${product.title}](${product.images[0].src})\n\n`;
    }

    // Información para crear carrito
    md += `## Datos para Checkout\n\n`;
    md += `Para crear un carrito de este producto, usa:\n`;
    md += `\`\`\`\n`;
    md += `create_checkout_link con:\n`;
    md += `- product_id: ${product.id}\n`;
    md += `- variant_id: ${product.variants[0]?.id || 'N/A'}\n`;
    md += `\`\`\`\n\n`;

    return md;
}

/**
 * Genera el archivo índice de productos
 */
function generateProductsIndex(products: Product[]): string {
    let md = `# CATÁLOGO DE PRODUCTOS - EXTRACTOS EUM\n\n`;
    md += `**Última actualización:** ${new Date().toLocaleString('es-MX')}\n`;
    md += `**Total productos activos:** ${products.length}\n\n`;
    md += `---\n\n`;

    md += `## Cómo Usar Este Catálogo\n\n`;
    md += `1. **Buscar producto:** \`search_products_db("nombre o keyword")\`\n`;
    md += `2. **Ver detalles:** Consulta el archivo individual en \`products/[handle].md\`\n`;
    md += `3. **Crear carrito:** \`create_checkout_link\` con el variant_id del producto\n\n`;

    md += `---\n\n`;

    // Agrupar por tipo de producto
    const byType: Record<string, Product[]> = {};
    for (const product of products) {
        const type = product.product_type || 'Otros';
        if (!byType[type]) byType[type] = [];
        byType[type].push(product);
    }

    for (const [type, typeProducts] of Object.entries(byType).sort()) {
        md += `## ${type}\n\n`;
        md += `| Producto | Precio | Stock | Link |\n`;
        md += `|----------|--------|-------|------|\n`;

        for (const p of typeProducts) {
            const totalStock = p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
            const stockEmoji = totalStock > 0 ? '✅' : '❌';
            const price = p.variants[0]?.price || 'N/A';
            md += `| [${p.title}](products/${p.handle}.md) | $${price} | ${stockEmoji} ${totalStock} | [Ver](https://extractoseum.com/products/${p.handle}) |\n`;
        }
        md += `\n`;
    }

    return md;
}

/**
 * Proceso principal de sincronización
 */
async function syncProductsKnowledge() {
    console.log('🛍️  Iniciando sincronización de productos al Knowledge Base...\n');

    // 1. Crear directorio de productos si no existe
    if (!fs.existsSync(PRODUCTS_PATH)) {
        fs.mkdirSync(PRODUCTS_PATH, { recursive: true });
        console.log(`📁 Creado directorio: ${PRODUCTS_PATH}`);
    }

    // 2. Obtener productos activos de la base de datos
    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('title');

    if (error) {
        console.error('❌ Error obteniendo productos:', error.message);
        process.exit(1);
    }

    if (!products || products.length === 0) {
        console.log('⚠️  No hay productos activos en la base de datos.');
        console.log('   Ejecuta primero: syncProductsToLocalDB() desde shopifyService');
        process.exit(0);
    }

    console.log(`📦 Encontrados ${products.length} productos activos\n`);

    // 3. Generar archivo MD por cada producto
    let generated = 0;
    for (const product of products as Product[]) {
        try {
            const md = generateProductMD(product);
            const filePath = path.join(PRODUCTS_PATH, `${product.handle}.md`);
            fs.writeFileSync(filePath, md, 'utf-8');
            generated++;

            if (generated % 10 === 0) {
                process.stdout.write(`\r   Generados: ${generated}/${products.length}`);
            }
        } catch (err: any) {
            console.error(`\n❌ Error en producto ${product.title}:`, err.message);
        }
    }

    console.log(`\n\n✅ Generados ${generated} archivos de producto`);

    // 4. Generar índice principal
    const indexMD = generateProductsIndex(products as Product[]);
    const indexPath = path.join(KNOWLEDGE_BASE_PATH, 'catalogo_productos.md');
    fs.writeFileSync(indexPath, indexMD, 'utf-8');
    console.log(`📋 Generado índice: catalogo_productos.md`);

    // 5. Actualizar instructivo de Ara para incluir productos
    const instructivoPath = path.join(KNOWLEDGE_BASE_PATH, 'instructivo.md');
    if (fs.existsSync(instructivoPath)) {
        let instructivo = fs.readFileSync(instructivoPath, 'utf-8');

        // Agregar sección de productos si no existe
        if (!instructivo.includes('catalogo_productos.md')) {
            const productSection = `\n\n## 🛍️ PRODUCTOS\n\n| Archivo | Consultar cuando... |\n|---------|---------------------|\n| \`catalogo_productos.md\` | Lista completa de productos, precios, stock |\n| \`products/*.md\` | Detalles específicos de un producto |\n`;
            instructivo += productSection;
            fs.writeFileSync(instructivoPath, instructivo, 'utf-8');
            console.log(`📝 Actualizado instructivo.md con sección de productos`);
        }
    }

    console.log('\n🎉 Sincronización completada!');
    console.log(`\n📊 Resumen:`);
    console.log(`   - Productos generados: ${generated}`);
    console.log(`   - Índice: catalogo_productos.md`);
    console.log(`   - Directorio: sales_ara/products/`);
}

// Ejecutar
syncProductsKnowledge().catch(console.error);
