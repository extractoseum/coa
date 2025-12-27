
import * as fs from 'fs';
import * as path from 'path';

const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../data/ai_knowledge_base');

function testListing() {
    console.log("🔍 Checking Knowledge Base Structure...");
    const folder = 'core';
    const folderPath = path.join(KNOWLEDGE_BASE_DIR, folder);

    if (!fs.existsSync(folderPath)) {
        console.error(`❌ Folder not found: ${folderPath}`);
        return;
    }

    console.log(`📂 Scanning: ${folderPath}`);

    const getAllFiles = (dir: string, baseDir: string): any[] => {
        let results: any[] = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                console.log(`  ➡ Entering subdir: ${file}`);
                results = results.concat(getAllFiles(filePath, baseDir));
            } else if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.yaml')) {
                const relativePath = path.relative(baseDir, filePath);
                console.log(`  ✅ Found file: ${relativePath}`);
                results.push({
                    name: relativePath,
                    path: `${folder}/${relativePath}`
                });
            } else {
                console.log(`  ⚠️ Skipped: ${file}`);
            }
        });
        return results;
    };

    const files = getAllFiles(folderPath, folderPath);
    console.log("\n📊 Final Result:");
    console.log(JSON.stringify(files, null, 2));
}

testListing();
