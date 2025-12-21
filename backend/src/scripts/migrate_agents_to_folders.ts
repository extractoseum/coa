
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(__dirname, '../ai_knowledge_base/identity');
const AGENTS_DIR = path.join(__dirname, '../ai_knowledge_base/agents');

// Ensure agents dir exists
if (!fs.existsSync(AGENTS_DIR)) {
    console.log('Creating agents directory...');
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
}

// 1. Read all .md files in identity
const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.md'));

console.log(`Found ${files.length} agents to migrate.`);

files.forEach(file => {
    const agentName = path.parse(file).name;
    const agentFolder = path.join(AGENTS_DIR, agentName);

    // Create folder for this agent
    if (!fs.existsSync(agentFolder)) {
        fs.mkdirSync(agentFolder, { recursive: true });
    }

    // Move file to new location as "identity.md" (CORE file)
    const oldPath = path.join(SRC_DIR, file);
    const newPath = path.join(agentFolder, 'identity.md');

    fs.copyFileSync(oldPath, newPath);
    console.log(`✅ Migrated ${file} -> agents/${agentName}/identity.md`);
});

console.log('Migration complete.');
