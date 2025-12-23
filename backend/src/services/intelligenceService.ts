import fs from 'fs';
import path from 'path';
import { AIService } from './aiService';

export interface FileMetadata {
    instructivePath?: string;
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
            let metadata: FileMetadata = { files: {} };

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
        return { files: {} };
    }
}
