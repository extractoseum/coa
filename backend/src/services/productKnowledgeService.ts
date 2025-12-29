/**
 * Product Knowledge Service
 * Generates MD files from products table for AI agent knowledge base
 */

import { supabase } from '../config/supabase';
import fs from 'fs';
import path from 'path';

// Output paths
const KNOWLEDGE_BASE_PATH = path.resolve(__dirname, '../../data/ai_knowledge_base/agents_public/sales_ara');
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
 * Generate MD content for a single product
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

    if (product.tags && product.tags.length > 0) {
        md += `**Tags:** ${product.tags.join(', ')}\n\n`;
    }

    md += `---\n\n`;

    if (product.description_plain) {
        md += `## Descripción\n\n${product.description_plain}\n\n`;
    }

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

    if (product.images && product.images.length > 0) {
        md += `## Imagen\n\n`;
        md += `![${product.title}](${product.images[0].src})\n\n`;
    }

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
 * Generate catalog index file
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

    // Group by product type
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
 * Main sync function - generates all product MD files
 */
export async function syncProductsToKnowledge(): Promise<{ success: boolean; count: number }> {
    console.log('[ProductKnowledge] Starting knowledge base generation...');

    // Ensure products directory exists
    if (!fs.existsSync(PRODUCTS_PATH)) {
        fs.mkdirSync(PRODUCTS_PATH, { recursive: true });
    }

    // Fetch active products
    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('title');

    if (error) {
        console.error('[ProductKnowledge] Error fetching products:', error.message);
        throw error;
    }

    if (!products || products.length === 0) {
        console.log('[ProductKnowledge] No active products found');
        return { success: true, count: 0 };
    }

    // Generate individual product files
    let generated = 0;
    for (const product of products as Product[]) {
        try {
            const md = generateProductMD(product);
            const filePath = path.join(PRODUCTS_PATH, `${product.handle}.md`);
            fs.writeFileSync(filePath, md, 'utf-8');
            generated++;
        } catch (err: any) {
            console.error(`[ProductKnowledge] Error generating ${product.title}:`, err.message);
        }
    }

    // Generate index
    const indexMD = generateProductsIndex(products as Product[]);
    const indexPath = path.join(KNOWLEDGE_BASE_PATH, 'catalogo_productos.md');
    fs.writeFileSync(indexPath, indexMD, 'utf-8');

    console.log(`[ProductKnowledge] Generated ${generated} product files + index`);

    return { success: true, count: generated };
}
