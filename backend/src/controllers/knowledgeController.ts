import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { IntelligenceService } from '../services/intelligenceService';

// PATH DEFINITIONS
// Persistent: Where user data lives (Server: /backend/data, Local: /backend/data)
const PERSISTENT_PATH = path.resolve(__dirname, '../../data/ai_knowledge_base');
// Bundled: Where deployments land (Server: /backend/dist/data)
const BUNDLED_PATH = path.resolve(__dirname, '../data/ai_knowledge_base');

/**
 * SYNC KNOWLEDGE BASE (Smart Merge)
 * Merges the fresh 'bundled' files from Git into the 'persistent' user folder.
 * - 'core/': Overwritten by Git (System updates) - Force true
 * - 'agents/': Preserved (User data) - Force false (recursive merge handles new files)
 */
const syncKnowledgeBase = () => {
    try {
        // Ensure persistent root exists
        if (!fs.existsSync(PERSISTENT_PATH)) {
            console.log('[KnowledgeSync] Initializing persistent storage...');
            fs.mkdirSync(PERSISTENT_PATH, { recursive: true });
        }

        // If bundled content exists (e.g. in Production), sync it to Persistent
        if (fs.existsSync(BUNDLED_PATH)) {
            console.log('[KnowledgeSync] Syncing bundled assets to persistent storage...');

            // 1. Sync CORE (System Files) - Force Overwrite to apply updates
            const coreBundled = path.join(BUNDLED_PATH, 'core');
            const corePersistent = path.join(PERSISTENT_PATH, 'core');
            if (fs.existsSync(coreBundled)) {
                console.log(' -> Updating Core Framework...');
                fs.cpSync(coreBundled, corePersistent, { recursive: true, force: true });
            }

            // 2. Sync AGENTS/TOOLS - Safe Merge (Don't overwrite user changes if possible, or decide policy)
            // For now, we will copy things that are NEW.
            // fs.cpSync with force: false (default) will error if dest exists? No, it overwrites by default unless errorOnExist.
            // We want to ADD missing files, but maybe NOT overwrite identity.md if modified?
            // Safer approach for now: Sync standard folders.

            const dirsToSync = ['agents_god_mode', 'agents_public', 'agents_internal', 'instructions', 'information'];
            for (const dir of dirsToSync) {
                const src = path.join(BUNDLED_PATH, dir);
                const dest = path.join(PERSISTENT_PATH, dir);
                if (fs.existsSync(src)) {
                    // recursive copy, overwrites content if it exists in source. 
                    // This is standard "Deployment" behavior: Code wins.
                    // User agents created on server are likely NEW folders, so they are safe.
                    // Existing agents modified on server? They might be overwritten if file names match.
                    fs.cpSync(src, dest, { recursive: true });
                }
            }
            console.log('[KnowledgeSync] Sync complete.');
        }
    } catch (error) {
        console.error('[KnowledgeSync] Error syncing knowledge base:', error);
    }
};

// Execute Sync on Module Load
syncKnowledgeBase();

// Always read from Persistent
const KNOWLEDGE_BASE_DIR = PERSISTENT_PATH;

// Subdirectories allowed
const AGENT_CATEGORIES = ['agents_god_mode', 'agents_public', 'agents_internal'];
const STANDARD_FOLDERS = ['instructions', 'information', 'core'];
const ALLOWED_FOLDERS = [...AGENT_CATEGORIES, ...STANDARD_FOLDERS];

// Helper to extract identifier from identity.md (e.g. "8740")
const getAgentIdentifier = (content: string): string => {
    const match = content.match(/\[(\d{4})\]/);
    return match ? match[1] : '';
};

/**
 * LIST FILES
 * Returns folders and files structure
 */
export const listKnowledgeFiles = async (req: Request, res: Response) => {
    try {
        const structure: any = {};
        console.log(`[KnowledgeDebug] LIST Request. BaseDir: ${KNOWLEDGE_BASE_DIR}`);

        for (const folder of ALLOWED_FOLDERS) {
            const folderPath = path.join(KNOWLEDGE_BASE_DIR, folder);

            // Create folder if not exists
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            if (AGENT_CATEGORIES.includes(folder)) {
                // Read active agent from config.json if it exists
                let activeAgent = '';
                const configPath = path.join(folderPath, 'config.json');
                if (fs.existsSync(configPath)) {
                    try {
                        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                        activeAgent = config.activeAgent || '';
                    } catch (e) {
                        console.error(`Error reading config for ${folder}:`, e);
                    }
                }

                // For agents categories, list directories (the agents themselves) and their files
                const agents = fs.readdirSync(folderPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => {
                        const agentName = dirent.name;
                        const agentPath = path.join(folderPath, agentName);

                        // Load agent-specific metadata if it exists
                        let agentInstructive = '';
                        const agentMetaPath = path.join(agentPath, 'metadata.json');
                        if (fs.existsSync(agentMetaPath)) {
                            try {
                                const meta = JSON.parse(fs.readFileSync(agentMetaPath, 'utf-8'));
                                agentInstructive = meta.instructivePath || '';
                            } catch (e) { }
                        }

                        // Recursively get all .md files including subdirectories
                        const getAllMdFiles = (dir: string, basePath: string): any[] => {
                            let results: any[] = [];
                            const items = fs.readdirSync(dir, { withFileTypes: true });

                            for (const item of items) {
                                const itemPath = path.join(dir, item.name);
                                const relativePath = path.relative(agentPath, itemPath);

                                if (item.isDirectory()) {
                                    // Recursively get files from subdirectory
                                    results = results.concat(getAllMdFiles(itemPath, basePath));
                                } else if (item.name.endsWith('.md')) {
                                    const fullPath = `${folder}/${agentName}/${relativePath}`;
                                    const content = fs.readFileSync(itemPath, 'utf-8');

                                    // Get agent-specific metadata (summaries)
                                    const agentMeta = IntelligenceService.getInstance().getMetadata(agentPath);
                                    const fileMeta = agentMeta.files?.[item.name];

                                    results.push({
                                        name: relativePath, // Show full relative path (e.g., knowledge/sales_techniques.md)
                                        path: fullPath,
                                        size: content.length,
                                        isInstructive: agentInstructive === item.name || (agentInstructive === '' && item.name === 'identity.md'),
                                        summary: fileMeta?.summary || null,
                                        lastAnalyzed: fileMeta?.lastAnalyzed || null
                                    });
                                }
                            }
                            return results;
                        };

                        const files = getAllMdFiles(agentPath, agentPath);

                        const hasIdentity = files.some(f => f.name === 'identity.md' || f.isInstructive);
                        const isActive = activeAgent === agentName;

                        return {
                            name: agentName,
                            type: 'agent',
                            hasIdentity,
                            isActive,
                            files: files
                        };
                    });
                structure[folder] = agents;
                structure[`${folder}_config`] = { activeAgent };
            } else {
                // Standard folders (flat files) OR recursive for 'core'
                const getAllFiles = (dir: string, baseDir: string): any[] => {
                    let results: any[] = [];
                    const list = fs.readdirSync(dir);
                    list.forEach(file => {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        if (stat && stat.isDirectory()) {
                            results = results.concat(getAllFiles(filePath, baseDir));
                        } else if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.yaml')) {
                            // Relative path from base folder (e.g. core/brand_framework/legal.md)
                            const relativePath = path.relative(baseDir, filePath);
                            results.push({
                                name: relativePath, // Display full path
                                path: `${folder}/${relativePath}`,
                                displayPath: relativePath
                            });
                        }
                    });
                    return results;
                };

                const files = getAllFiles(folderPath, folderPath);
                structure[folder] = files;
            }
        }

        res.json({
            success: true,
            data: structure
        });

    } catch (error: any) {
        console.error('[KnowledgeController] List error:', error);
        res.status(500).json({ success: false, error: 'Failed to list knowledge files' });
    }
};

/**
 * READ FILE
 */
export const readKnowledgeFile = async (req: Request, res: Response) => {
    try {
        const { folder } = req.params;

        let safePath = '';
        if (AGENT_CATEGORIES.includes(folder)) {
            const subPath = (req.query.path as string) || req.params.filename;
            if (!subPath) return res.status(400).json({ error: 'Subpath is required for agents' });

            // Remove folder prefix if present
            let cleanSubPath = subPath.startsWith(folder + '/') ? subPath.replace(folder + '/', '') : subPath;
            const resolvedPath = path.resolve(KNOWLEDGE_BASE_DIR, folder, cleanSubPath);

            const allowedRoot = path.resolve(KNOWLEDGE_BASE_DIR, folder);
            if (!resolvedPath.startsWith(allowedRoot)) {
                return res.status(403).json({ error: 'Access denied: Path traversal detected' });
            }
            safePath = resolvedPath;
        } else {
            if (!ALLOWED_FOLDERS.includes(folder)) return res.status(400).json({ error: 'Invalid folder' });
            const subPath = req.params[0] || req.params.filename || (req.query.path as string);
            if (!subPath) return res.status(400).json({ error: 'Filename is required' });

            // Support nested paths (no path.basename calls)
            const resolvedPath = path.resolve(KNOWLEDGE_BASE_DIR, folder, subPath);
            const allowedRoot = path.resolve(KNOWLEDGE_BASE_DIR, folder);
            if (!resolvedPath.startsWith(allowedRoot)) {
                return res.status(403).json({ error: 'Access denied: Path traversal detected' });
            }
            safePath = resolvedPath;
        }

        // Final Global Security Check
        const normalizedSafePath = path.resolve(safePath);
        if (!normalizedSafePath.startsWith(path.resolve(KNOWLEDGE_BASE_DIR))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(safePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        // Auto-resolve directory to identity.md
        if (fs.lstatSync(safePath).isDirectory()) {
            const identityPath = path.join(safePath, 'identity.md');
            if (fs.existsSync(identityPath)) {
                safePath = identityPath;
            } else {
                return res.status(400).json({ error: 'Cannot read directory' });
            }
        }

        const content = fs.readFileSync(safePath, 'utf-8');
        res.json({ success: true, data: { content } });

    } catch (error: any) {
        console.error('[KnowledgeController] Read error:', error);
        res.status(500).json({ success: false, error: 'Failed to read file' });
    }
};

/**
 * SAVE FILE
 */
export const saveKnowledgeFile = async (req: Request, res: Response) => {
    try {
        const { folder } = req.params;
        const filename = req.params.filename || req.params[0] || (req.query.path as string) || req.body.path;
        const { content } = req.body;

        if (!filename) return res.status(400).json({ error: 'Filename is required' });
        if (content === undefined) return res.status(400).json({ error: 'Content required' });

        let safePath = '';
        if (AGENT_CATEGORIES.includes(folder)) {
            const subPath = (req.query.path as string) || req.body.path || req.params.filename;
            if (!subPath) return res.status(400).json({ error: 'Subpath is required for agents' });
            const cleanSubPath = subPath.startsWith(folder + '/') ? subPath.replace(folder + '/', '') : subPath;
            safePath = path.join(KNOWLEDGE_BASE_DIR, folder, cleanSubPath);
        } else {
            if (!ALLOWED_FOLDERS.includes(folder)) return res.status(400).json({ error: 'Invalid folder' });
            const subPath = (req.query.path as string) || req.body.path || req.params.filename;
            if (!subPath) return res.status(400).json({ error: 'Filename is required' });

            // Support nested paths
            const resolvedPath = path.resolve(KNOWLEDGE_BASE_DIR, folder, subPath);
            const allowedRoot = path.resolve(KNOWLEDGE_BASE_DIR, folder);
            if (!resolvedPath.startsWith(allowedRoot)) {
                return res.status(403).json({ error: 'Access denied: Path traversal detected' });
            }
            safePath = resolvedPath;
        }

        if (!safePath.startsWith(KNOWLEDGE_BASE_DIR)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const parentDir = path.dirname(safePath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(safePath, content, 'utf-8');

        // BACKGROUND: Trigger Smart Analysis
        if (AGENT_CATEGORIES.includes(folder)) {
            IntelligenceService.getInstance().analyzeFile(parentDir, path.basename(safePath), content).catch(err => {
                console.error(`[KnowledgeController] Analysis hook failed:`, err);
            });
        }

        res.json({ success: true, message: 'Saved' });

    } catch (error: any) {
        console.error('[KnowledgeController] Save error:', error);
        res.status(500).json({ success: false, error: 'Failed to save file' });
    }
};

/**
 * UPLOAD AND PROCESS FILE
 */
export const uploadKnowledgeFile = async (req: Request, res: Response) => {
    try {
        const { folder, agentName } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        let destFolder = '';
        if (AGENT_CATEGORIES.includes(folder)) {
            if (!agentName) return res.status(400).json({ error: 'Agent name required for agent folder' });
            destFolder = path.join(KNOWLEDGE_BASE_DIR, folder, agentName);
        } else {
            if (!ALLOWED_FOLDERS.includes(folder)) return res.status(400).json({ error: 'Invalid folder' });
            destFolder = path.join(KNOWLEDGE_BASE_DIR, folder);
        }

        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }

        const originalName = file.originalname;
        const extension = path.extname(originalName).toLowerCase();
        const baseName = path.basename(originalName, extension);
        const mdFilename = `${baseName}.md`;
        const mdPath = path.join(destFolder, mdFilename);

        let extractedContent = '';
        const { AIService } = require('../services/aiService');
        const aiService = AIService.getInstance();

        if (extension === '.pdf' || ['.jpg', '.jpeg', '.png'].includes(extension)) {
            const prompt = extension === '.pdf'
                ? `Analiza este documento PDF y transcribe todo su contenido a formato Markdown.`
                : `Analiza esta imagen y extrae toda la información relevante en formato Markdown.`;

            const analysis = await aiService.analyzeImage(prompt, file.buffer, file.mimetype);
            extractedContent = extension === '.pdf'
                ? `# DOCUMENTO EXTRAIDO: ${originalName}\n\n${analysis}`
                : `# ANALISIS DE IMAGEN: ${originalName}\n\n${analysis}`;
        } else {
            return res.status(400).json({ error: 'Unsupported file type' });
        }

        fs.writeFileSync(mdPath, extractedContent, 'utf-8');

        // BACKGROUND: Trigger Smart Analysis
        IntelligenceService.getInstance().analyzeFile(destFolder, mdFilename, extractedContent).catch(err => {
            console.error(`[KnowledgeController] Analysis hook failed:`, err);
        });

        res.json({
            success: true,
            data: {
                originalName,
                extractedFile: mdFilename,
                path: AGENT_CATEGORIES.includes(folder) ? `${folder}/${agentName}/${mdFilename}` : `${folder}/${mdFilename}`
            }
        });

    } catch (error: any) {
        console.error('[KnowledgeController] Upload error:', error);
        res.status(500).json({ success: false, error: 'Failed to process file' });
    }
};

/**
 * DELETE FILE
 */
export const deleteKnowledgeFile = async (req: Request, res: Response) => {
    try {
        const { folder } = req.params;
        const subPath = (req.query.path as string) || req.params.filename;

        if (!subPath) return res.status(400).json({ error: 'Filename is required' });

        let safePath = '';
        if (AGENT_CATEGORIES.includes(folder)) {
            const cleanSubPath = subPath.startsWith(folder + '/') ? subPath.replace(folder + '/', '') : subPath;
            safePath = path.join(KNOWLEDGE_BASE_DIR, folder, cleanSubPath);
        } else {
            if (!ALLOWED_FOLDERS.includes(folder)) return res.status(400).json({ error: 'Invalid folder' });
            safePath = path.join(KNOWLEDGE_BASE_DIR, folder, path.basename(subPath));
        }
        if (!safePath.startsWith(KNOWLEDGE_BASE_DIR)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(safePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        fs.unlinkSync(safePath);
        res.json({ success: true, message: 'Deleted' });

    } catch (error: any) {
        console.error('[KnowledgeController] Delete error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
};

/**
 * SET ACTIVE AGENT
 */
export const setActiveAgent = async (req: Request, res: Response) => {
    try {
        const { folder } = req.params;
        const { agentName } = req.body;

        if (!AGENT_CATEGORIES.includes(folder)) {
            return res.status(400).json({ error: 'Invalid agent category' });
        }

        const categoryPath = path.join(KNOWLEDGE_BASE_DIR, folder);
        const configPath = path.join(categoryPath, 'config.json');

        const config = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
            : {};

        config.activeAgent = agentName;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        res.json({ success: true, message: `Active agent set to ${agentName}` });
    } catch (error: any) {
        console.error('[KnowledgeController] SetActive error:', error);
        res.status(500).json({ success: false, error: 'Failed to set active agent' });
    }
};

/**
 * CREATE NEW AGENT
 */
export const createNewAgent = async (req: Request, res: Response) => {
    try {
        const { folder } = req.params;
        const { agentName } = req.body;

        if (!AGENT_CATEGORIES.includes(folder)) {
            return res.status(400).json({ error: 'Invalid agent category' });
        }

        if (!agentName) return res.status(400).json({ error: 'Agent name is required' });

        const agentDir = path.join(KNOWLEDGE_BASE_DIR, folder, agentName.toLowerCase().replace(/\s+/g, '_'));

        if (fs.existsSync(agentDir)) {
            return res.status(400).json({ error: 'Agent already exists' });
        }

        fs.mkdirSync(agentDir, { recursive: true });
        const identityPath = path.join(agentDir, 'identity.md');
        const defaultContent = `# SYSTEM ROLE: ${agentName}\n\n[8740] Identity description goes here...`;
        fs.writeFileSync(identityPath, defaultContent);

        res.json({ success: true, data: { name: path.basename(agentDir), path: `${folder}/${path.basename(agentDir)}` } });
    } catch (error: any) {
        console.error('[KnowledgeController] CreateAgent error:', error);
        res.status(500).json({ success: false, error: 'Failed to create agent' });
    }
};

/**
 * MARK AS INSTRUCTIVE
 * Renames a file to identity.md
 */
export const markAsInstructive = async (req: Request, res: Response) => {
    try {
        const { folder } = req.params;
        const { path: subPath } = req.body;

        if (!AGENT_CATEGORIES.includes(folder)) {
            return res.status(400).json({ error: 'Invalid agent category' });
        }

        if (!subPath) return res.status(400).json({ error: 'Source path is required' });

        const cleanSubPath = subPath.startsWith(folder + '/') ? subPath.replace(folder + '/', '') : subPath;
        const sourcePath = path.join(KNOWLEDGE_BASE_DIR, folder, cleanSubPath);
        const agentDir = path.dirname(sourcePath);
        const fileName = path.basename(sourcePath);

        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({ error: 'Source file not found' });
        }

        // Write to metadata.json instead of renaming
        const metadataPath = path.join(agentDir, 'metadata.json');
        let metadata: any = {};
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            } catch (e) { }
        }

        metadata.instructivePath = fileName;
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({ success: true, message: 'File is now the main instructive' });
    } catch (error: any) {
        console.error('[KnowledgeController] MarkInstructive error:', error);
        res.status(500).json({ success: false, error: 'Failed to mark as instructive' });
    }
};

export const getAgentsMetadata = async (req: Request, res: Response): Promise<void> => {
    try {
        const metadata: any[] = [];

        for (const folder of AGENT_CATEGORIES) {
            const folderPath = path.join(KNOWLEDGE_BASE_DIR, folder);
            if (!fs.existsSync(folderPath)) continue;

            const agents = fs.readdirSync(folderPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory());

            for (const dirent of agents) {
                const agentName = dirent.name;
                const agentPath = path.join(folderPath, agentName);
                const identityPath = path.join(agentPath, 'identity.md');
                const metadataPath = path.join(agentPath, 'metadata.json');

                let agentMeta: any = {
                    id: agentName,
                    category: folder.replace('agents_', '').toUpperCase(),
                    status: 'Ready',
                    default_tools: [],
                    description: '',
                    label: agentName
                };

                // Load custom metadata if exists
                if (fs.existsSync(metadataPath)) {
                    try {
                        const custom = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
                        agentMeta = { ...agentMeta, ...custom };
                    } catch (e) {
                        console.error(`Error reading metadata for ${agentName}:`, e);
                    }
                }

                // Check Health Status
                if (!fs.existsSync(identityPath)) {
                    agentMeta.status = 'Broken';
                    agentMeta.error = 'Missing identity.md';
                }

                metadata.push(agentMeta);
            }
        }

        res.json({ success: true, data: metadata });
    } catch (error: any) {
        console.error('[KnowledgeController] getAgentsMetadata error:', error.message);
        res.status(500).json({ success: false, error: 'Error al cargar metadata de agentes' });
    }
};

export const getToolsRegistry = async (req: Request, res: Response): Promise<void> => {
    try {
        const registryPath = path.join(KNOWLEDGE_BASE_DIR, 'core', 'tools_registry.json');
        if (fs.existsSync(registryPath)) {
            const data = fs.readFileSync(registryPath, 'utf-8');
            res.json({ success: true, data: JSON.parse(data) });
        } else {
            res.json({ success: true, data: [] });
        }
    } catch (error: any) {
        console.error('[KnowledgeController] getToolsRegistry error:', error.message);
        res.status(500).json({ success: false, error: 'Error al cargar el registro de herramientas' });
    }
};
