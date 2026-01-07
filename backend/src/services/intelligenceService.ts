import fs from 'fs';
import path from 'path';
import { AIService } from './aiService';

export interface KnowledgeSnap {
    fileName: string;
    path: string;
    summary: string;
    usage: string;
    adminNotes: string;
    lastUpdated: string;
    contentHash: string;
    isGlobal: boolean;

    // Enhanced Snap Properties (Phase 2)
    triggers: string[];              // Keywords that activate this knowledge
    priority: number;                // 1-10 scale for conflict resolution
    category: 'product' | 'policy' | 'faq' | 'procedure' | 'reference' | 'pricing' | 'general';
    usageCount: number;              // Times this snap has been included in context
    effectivenessScore: number;      // 0-100 based on conversation outcomes
    lastUsed: string | null;         // Timestamp of last usage
}

export interface FileMetadata {
    instructivePath?: string;
    knowledgeSnaps: KnowledgeSnap[];
    files: Record<string, {
        summary: string;
        lastAnalyzed: string;
        type?: string;
        tokens?: number;
    }>;
}

export class IntelligenceService {
    private static instance: IntelligenceService;
    private aiService: AIService;

    private constructor() {
        this.aiService = AIService.getInstance();
    }

    public static getInstance(): IntelligenceService {
        if (!IntelligenceService.instance) {
            IntelligenceService.instance = new IntelligenceService();
        }
        return IntelligenceService.instance;
    }

    /**
     * Analyze a file content and update its metadata with a summary
     */
    public async analyzeFile(agentDir: string, fileName: string, content: string): Promise<void> {
        try {
            console.log(`[IntelligenceService] 🧠 Analyzing file: ${fileName} in ${agentDir}`);

            // 1. Generate Summary using a fast model
            const prompt = `Analiza el siguiente contenido de un archivo de conocimiento para un Agente de IA.
Proporciona un resumen de MÁXIMO 2 líneas que explique qué información contiene este archivo y cómo debería usarla el agente.
Si es un CSV o lista, identifica las columnas o datos principales.
Responde ÚNICAMENTE con el resumen, sin introducciones.

CONTENIDO:
${content.substring(0, 10000)} // Truncate for analysis if too large`;

            const response = await this.aiService.generateText(
                "Eres un experto en estructurar conocimiento para Agentes de IA.",
                prompt,
                "gpt-4o-mini" // Use mini for cost and speed
            );

            const summary = response.content?.trim() || "Sin resumen disponible.";

            // 2. Load existing metadata
            const metadataPath = path.join(agentDir, 'metadata.json');
            let metadata: FileMetadata = { files: {}, knowledgeSnaps: [] };

            if (fs.existsSync(metadataPath)) {
                try {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    if (!metadata.files) metadata.files = {};
                } catch (e) {
                    console.error(`[IntelligenceService] Error reading existing metadata`, e);
                }
            }

            // 3. Update file entry
            metadata.files[fileName] = {
                summary,
                lastAnalyzed: new Date().toISOString(),
                tokens: Math.ceil(content.length / 4) // Rough estimate
            };

            // 4. Save metadata
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            console.log(`[IntelligenceService] ✅ Updated summary for ${fileName}`);

        } catch (error: any) {
            console.error(`[IntelligenceService] ❌ Analysis failed for ${fileName}:`, error.message);
        }
    }

    /**
     * Get or create metadata for an agent directory
     */
    public getMetadata(agentDir: string): FileMetadata {
        const metadataPath = path.join(agentDir, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            try {
                return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } catch (e) { }
        }
        return { files: {}, knowledgeSnaps: [] };
    }

    /**
     * Validate category is one of the allowed values
     */
    private validateCategory(category: string): KnowledgeSnap['category'] {
        const validCategories: KnowledgeSnap['category'][] = ['product', 'policy', 'faq', 'procedure', 'reference', 'pricing', 'general'];
        if (validCategories.includes(category as KnowledgeSnap['category'])) {
            return category as KnowledgeSnap['category'];
        }
        return 'general';
    }

    /**
     * Generate a content hash for change detection
     */
    private generateContentHash(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Create or update a knowledge snap for a file
     * This generates AI-powered usage instructions that get embedded in the instructivo
     */
    public async createKnowledgeSnap(
        agentDir: string,
        fileName: string,
        content: string,
        isGlobal: boolean = false
    ): Promise<KnowledgeSnap | null> {
        try {
            console.log(`[IntelligenceService] 📸 Creating knowledge snap for: ${fileName}`);

            const contentHash = this.generateContentHash(content);

            // Check if snap already exists with same content
            const metadata = this.getMetadata(agentDir);
            const existingSnap = metadata.knowledgeSnaps?.find(s => s.fileName === fileName);

            if (existingSnap && existingSnap.contentHash === contentHash) {
                console.log(`[IntelligenceService] ⏭️ Content unchanged, skipping snap update`);
                return existingSnap;
            }

            // Generate snap using AI with enhanced fields
            const prompt = `Analiza este archivo de conocimiento y genera instrucciones para un Agente de IA.

ARCHIVO: ${fileName}
CONTENIDO:
${content.substring(0, 8000)}

Responde en JSON con este formato exacto:
{
  "summary": "Descripción breve de qué contiene (max 100 caracteres)",
  "usage": "Instrucciones específicas de cuándo y cómo usar este conocimiento (max 200 caracteres)",
  "triggers": ["palabra1", "palabra2", "palabra3"],
  "category": "product|policy|faq|procedure|reference|pricing|general",
  "priority": 5
}

INSTRUCCIONES:
- triggers: 3-8 palabras clave en español que un cliente usaría al preguntar sobre este tema
- category: Elige UNA de las opciones exactas (product, policy, faq, procedure, reference, pricing, general)
- priority: 1-10 donde 10 es máxima prioridad (info crítica de ventas/precios=8-10, políticas=6-7, FAQ=4-5, referencia=1-3)

Ejemplos de triggers:
- Para precios: ["precio", "costo", "cuánto", "vale", "promoción", "descuento"]
- Para envíos: ["envío", "entrega", "shipping", "llegada", "tiempo"]
- Para ingredientes: ["ingrediente", "contiene", "compuesto", "natural", "orgánico"]`;

            const response = await this.aiService.generateText(
                "Eres un experto en estructurar conocimiento para Agentes de IA. Responde SOLO en JSON válido.",
                prompt,
                "gpt-4o-mini"
            );

            let snapData: {
                summary: string;
                usage: string;
                triggers: string[];
                category: KnowledgeSnap['category'];
                priority: number;
            } = {
                summary: "Sin resumen",
                usage: "Consultar según contexto",
                triggers: [],
                category: "general",
                priority: 5
            };

            try {
                const jsonMatch = response.content?.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    snapData = {
                        summary: parsed.summary || snapData.summary,
                        usage: parsed.usage || snapData.usage,
                        triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
                        category: this.validateCategory(parsed.category),
                        priority: Math.min(10, Math.max(1, parseInt(parsed.priority) || 5))
                    };
                }
            } catch (e) {
                console.error(`[IntelligenceService] Error parsing snap JSON:`, e);
            }

            const snap: KnowledgeSnap = {
                fileName,
                path: isGlobal ? `global/${fileName}` : fileName,
                summary: snapData.summary,
                usage: snapData.usage,
                adminNotes: existingSnap?.adminNotes || "", // Preserve admin notes
                lastUpdated: new Date().toISOString(),
                contentHash,
                isGlobal,
                // Enhanced fields
                triggers: existingSnap?.triggers?.length ? existingSnap.triggers : snapData.triggers, // Preserve manual triggers
                priority: existingSnap?.priority ?? snapData.priority, // Preserve manual priority
                category: snapData.category,
                usageCount: existingSnap?.usageCount || 0,
                effectivenessScore: existingSnap?.effectivenessScore ?? 50, // Start at neutral
                lastUsed: existingSnap?.lastUsed || null
            };

            // Update metadata with new snap
            await this.updateKnowledgeSnap(agentDir, snap);

            console.log(`[IntelligenceService] ✅ Knowledge snap created for ${fileName}`);
            return snap;

        } catch (error: any) {
            console.error(`[IntelligenceService] ❌ Snap creation failed:`, error.message);
            return null;
        }
    }

    /**
     * Update or add a knowledge snap to agent metadata
     */
    private async updateKnowledgeSnap(agentDir: string, snap: KnowledgeSnap): Promise<void> {
        const metadataPath = path.join(agentDir, 'metadata.json');
        let metadata: FileMetadata = { files: {}, knowledgeSnaps: [] };

        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                if (!metadata.knowledgeSnaps) metadata.knowledgeSnaps = [];
            } catch (e) { }
        }

        // Update or add snap
        const existingIndex = metadata.knowledgeSnaps.findIndex(s => s.fileName === snap.fileName);
        if (existingIndex >= 0) {
            metadata.knowledgeSnaps[existingIndex] = snap;
        } else {
            metadata.knowledgeSnaps.push(snap);
        }

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Remove a knowledge snap from agent metadata
     */
    public async removeKnowledgeSnap(agentDir: string, fileName: string): Promise<boolean> {
        try {
            const metadataPath = path.join(agentDir, 'metadata.json');
            if (!fs.existsSync(metadataPath)) return false;

            const metadata: FileMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            if (!metadata.knowledgeSnaps) return false;

            const initialLength = metadata.knowledgeSnaps.length;
            metadata.knowledgeSnaps = metadata.knowledgeSnaps.filter(s => s.fileName !== fileName);

            if (metadata.knowledgeSnaps.length < initialLength) {
                // Also remove from legacy files if present
                if (metadata.files && metadata.files[fileName]) {
                    delete metadata.files[fileName];
                }
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log(`[IntelligenceService] 🗑️ Removed knowledge snap for ${fileName}`);
                return true;
            }
            return false;
        } catch (error: any) {
            console.error(`[IntelligenceService] Error removing snap:`, error.message);
            return false;
        }
    }

    /**
     * Update admin notes for a specific snap
     */
    public async updateSnapAdminNotes(agentDir: string, fileName: string, notes: string): Promise<boolean> {
        try {
            const metadataPath = path.join(agentDir, 'metadata.json');
            if (!fs.existsSync(metadataPath)) return false;

            const metadata: FileMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const snap = metadata.knowledgeSnaps?.find(s => s.fileName === fileName);

            if (snap) {
                snap.adminNotes = notes;
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log(`[IntelligenceService] 📝 Updated admin notes for ${fileName}`);
                return true;
            }
            return false;
        } catch (error: any) {
            console.error(`[IntelligenceService] Error updating snap notes:`, error.message);
            return false;
        }
    }

    /**
     * Generate confidence scoring instructions for AI responses
     */
    public generateConfidenceInstructions(): string {
        return `
## 🎯 INDICADOR DE CONFIANZA (OBLIGATORIO)

Al final de CADA respuesta, DEBES incluir un indicador de confianza en este formato exacto:

[[CONFIDENCE:HIGH]] - Usalo cuando:
- La información viene directamente de tu conocimiento base verificado
- Estás citando precios, políticas o procedimientos exactos
- La respuesta está basada en datos específicos del cliente

[[CONFIDENCE:MEDIUM]] - Usalo cuando:
- Estás dando una recomendación general basada en patrones
- La información es aproximada o típica pero no específica
- Combinas conocimiento con inferencias razonables

[[CONFIDENCE:LOW]] - Usalo cuando:
- No tienes información específica sobre lo que preguntan
- Estás haciendo suposiciones o estimaciones
- Necesitarías verificar con un humano o sistema externo

IMPORTANTE: Este indicador SIEMPRE va al final de tu mensaje, en una línea separada.
`;
    }

    /**
     * Generate the dynamic instructivo section from knowledge snaps
     */
    public generateInstructivoSnapsSection(agentDir: string): string {
        const metadata = this.getMetadata(agentDir);
        const snaps = metadata.knowledgeSnaps || [];

        // Always include confidence instructions
        let section = this.generateConfidenceInstructions();

        if (snaps.length === 0) {
            return section + "\n## 📚 CONOCIMIENTO DISPONIBLE\n_No hay archivos de conocimiento registrados._\n";
        }

        section += "\n## 📚 CONOCIMIENTO DISPONIBLE (Auto-actualizado)\n\n";

        // Separate global and agent-specific
        const globalSnaps = snaps.filter(s => s.isGlobal);
        const agentSnaps = snaps.filter(s => !s.isGlobal);

        if (globalSnaps.length > 0) {
            section += "### 🌐 Conocimiento Global\n";
            for (const snap of globalSnaps) {
                section += this.formatSnapEntry(snap);
            }
            section += "\n";
        }

        if (agentSnaps.length > 0) {
            section += "### 🤖 Conocimiento del Agente\n";
            for (const snap of agentSnaps) {
                section += this.formatSnapEntry(snap);
            }
        }

        return section;
    }

    private formatSnapEntry(snap: KnowledgeSnap): string {
        const date = new Date(snap.lastUpdated).toLocaleDateString('es-MX');
        const priorityEmoji = snap.priority >= 8 ? '🔴' : snap.priority >= 5 ? '🟡' : '🟢';
        const categoryLabels: Record<string, string> = {
            product: '📦 Producto',
            policy: '📋 Política',
            faq: '❓ FAQ',
            procedure: '📝 Procedimiento',
            reference: '📚 Referencia',
            pricing: '💰 Precios',
            general: '📄 General'
        };

        let entry = `\n**[${snap.fileName}]** ${priorityEmoji} _(${categoryLabels[snap.category] || 'General'} - ${date})_\n`;
        entry += `> ${snap.summary}\n`;
        entry += `> **USO:** ${snap.usage}\n`;
        if (snap.triggers && snap.triggers.length > 0) {
            entry += `> **TRIGGERS:** ${snap.triggers.join(', ')}\n`;
        }
        if (snap.adminNotes) {
            entry += `> **📌 NOTAS:** ${snap.adminNotes}\n`;
        }
        return entry;
    }

    /**
     * Update snap enhanced fields (triggers, priority, category)
     */
    public async updateSnapEnhancedFields(
        agentDir: string,
        fileName: string,
        updates: { triggers?: string[]; priority?: number; category?: KnowledgeSnap['category'] }
    ): Promise<boolean> {
        try {
            const metadataPath = path.join(agentDir, 'metadata.json');
            if (!fs.existsSync(metadataPath)) return false;

            const metadata: FileMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const snap = metadata.knowledgeSnaps?.find(s => s.fileName === fileName);

            if (snap) {
                if (updates.triggers !== undefined) snap.triggers = updates.triggers;
                if (updates.priority !== undefined) snap.priority = Math.min(10, Math.max(1, updates.priority));
                if (updates.category !== undefined) snap.category = this.validateCategory(updates.category);

                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log(`[IntelligenceService] 🔧 Updated enhanced fields for ${fileName}`);
                return true;
            }
            return false;
        } catch (error: any) {
            console.error(`[IntelligenceService] Error updating enhanced fields:`, error.message);
            return false;
        }
    }

    /**
     * Increment usage count and update lastUsed timestamp for snaps
     */
    public async recordSnapUsage(agentDir: string, fileNames: string[]): Promise<void> {
        try {
            const metadataPath = path.join(agentDir, 'metadata.json');
            if (!fs.existsSync(metadataPath)) return;

            const metadata: FileMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const now = new Date().toISOString();

            for (const fileName of fileNames) {
                const snap = metadata.knowledgeSnaps?.find(s => s.fileName === fileName);
                if (snap) {
                    snap.usageCount = (snap.usageCount || 0) + 1;
                    snap.lastUsed = now;
                }
            }

            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        } catch (error: any) {
            console.error(`[IntelligenceService] Error recording snap usage:`, error.message);
        }
    }

    /**
     * Update effectiveness score based on conversation outcome
     * positive: +5 (max 100), negative: -10 (min 0)
     */
    public async updateSnapEffectiveness(agentDir: string, fileName: string, isPositive: boolean): Promise<void> {
        try {
            const metadataPath = path.join(agentDir, 'metadata.json');
            if (!fs.existsSync(metadataPath)) return;

            const metadata: FileMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const snap = metadata.knowledgeSnaps?.find(s => s.fileName === fileName);

            if (snap) {
                const currentScore = snap.effectivenessScore ?? 50;
                const delta = isPositive ? 5 : -10;
                snap.effectivenessScore = Math.min(100, Math.max(0, currentScore + delta));

                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log(`[IntelligenceService] 📊 Updated effectiveness for ${fileName}: ${snap.effectivenessScore}`);
            }
        } catch (error: any) {
            console.error(`[IntelligenceService] Error updating effectiveness:`, error.message);
        }
    }

    /**
     * Find relevant snaps based on message content matching triggers
     */
    public findRelevantSnaps(agentDir: string, message: string): KnowledgeSnap[] {
        const metadata = this.getMetadata(agentDir);
        const snaps = metadata.knowledgeSnaps || [];
        const messageLower = message.toLowerCase();

        // Score each snap based on trigger matches
        const scoredSnaps = snaps.map(snap => {
            let score = 0;
            const triggers = snap.triggers || [];

            for (const trigger of triggers) {
                if (messageLower.includes(trigger.toLowerCase())) {
                    score += 10; // Base score for trigger match
                }
            }

            // Boost by priority and effectiveness
            score += (snap.priority || 5) * 0.5;
            score += (snap.effectivenessScore || 50) * 0.02;

            return { snap, score };
        });

        // Filter snaps with score > 0 and sort by score descending
        return scoredSnaps
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(s => s.snap);
    }

    /**
     * Sync global knowledge snaps to all agents in a category
     */
    public async syncGlobalKnowledgeToAgents(globalDir: string, agentCategory: string): Promise<void> {
        const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../data/ai_knowledge_base');
        const categoryPath = path.join(KNOWLEDGE_BASE_DIR, agentCategory);

        if (!fs.existsSync(categoryPath)) return;

        // Get all MD files from global directory
        const globalFiles = fs.readdirSync(globalDir)
            .filter(f => f.endsWith('.md'));

        // Get all agents in category
        const agents = fs.readdirSync(categoryPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

        for (const agentName of agents) {
            const agentDir = path.join(categoryPath, agentName);

            for (const fileName of globalFiles) {
                const filePath = path.join(globalDir, fileName);
                const content = fs.readFileSync(filePath, 'utf8');

                // Create snap marked as global
                await this.createKnowledgeSnap(agentDir, fileName, content, true);
            }
        }

        console.log(`[IntelligenceService] 🔄 Synced ${globalFiles.length} global files to ${agents.length} agents`);
    }
}
