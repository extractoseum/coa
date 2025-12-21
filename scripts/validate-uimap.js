const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Guardrails Configuration
const CONFIG = {
    forbiddenPatterns: [
        {
            regex: /navigate\s*\(\s*["'`]\/[^"'`]+["'`]\s*\)/g,
            message: "❌ Hardcoded navigation detected! Use 'to.*' or 'ROUTES.*' instead."
        },
        {
            regex: /path=["']\/[^"']+["']/g,
            message: "❌ Hardcoded route path in JSX! Use 'ROUTES.*' constants."
        }
    ],
    requiredFileTypes: ['**/*.tsx', '**/*.ts'],
    ignore: ['**/node_modules/**', '**/dist/**', '**/routes.ts', '**/uiMap.ts', '**/QAOverlay.tsx'], // Ignore uiMap and QA tools
    criticalScreens: [
        'ClientDashboard.tsx',
        'AdminCRM.tsx'
    ]
};

let errorCount = 0;

// Load UI Map (Source of Truth)
function loadUiMap() {
    const uiMapPath = path.join(__dirname, '../frontend/src/telemetry/uiMap.ts');
    const content = fs.readFileSync(uiMapPath, 'utf-8');

    // Regex to extract keys like "nav.user.dashboard": { testid: "..." }
    // This is a rough parser for the specific format in uiMap.ts
    const map = {};
    const regex = /"([^"]+)":\s*{\s*testid:\s*"([^"]+)"/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        map[match[2]] = match[1]; // Store testid -> logicalname
    }

    return Object.keys(map); // Return list of registered IDs
}

function scanFiles() {
    console.log('🛡️  Starting Telemetry Guardrails Check...');

    const registeredIds = loadUiMap();
    console.log(`ℹ️  Loaded ${registeredIds.length} registered TestIDs from uiMap.`);

    // Find all TS/TSX files
    const files = glob.sync('src/**/*.{ts,tsx}', {
        cwd: path.join(__dirname, '../frontend'),
        ignore: CONFIG.ignore,
        absolute: true
    });

    const usedIds = new Set();

    files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const filename = path.basename(file);
        const relativePath = path.relative(path.join(__dirname, '../frontend'), file);

        // --- Rule 1: Forbidden Patterns ---
        CONFIG.forbiddenPatterns.forEach(rule => {
            let match;
            while ((match = rule.regex.exec(content)) !== null) {
                // Allow exemptions via comments
                const lineStart = content.lastIndexOf('\n', match.index) + 1;
                const lineEnd = content.indexOf('\n', match.index);
                const line = content.slice(lineStart, lineEnd);

                if (!line.includes('// telemetry-ignore')) {
                    console.error(`\n${rule.message}`);
                    console.error(`   File: ${relativePath}`);
                    console.error(`   Line: ${line.trim()}`);
                    errorCount++;
                }
            }
        });

        // --- Rule 2: Strict TestID Usage (Rule A/B) ---
        // Find all data-testid usages
        const testIdRegex = /data-testid=["']([^"']+)["']/g;
        let tidMatch;
        while ((tidMatch = testIdRegex.exec(content)) !== null) {
            const id = tidMatch[1];
            usedIds.add(id);

            if (!registeredIds.includes(id)) {
                console.error(`\n❌ Unregistered data-testid detected! (Rule B)`);
                console.error(`   ID: ${id}`);
                console.error(`   File: ${relativePath}`);
                console.error(`   Action: Add this ID to src/telemetry/uiMap.ts`);
                errorCount++;
            }
        }

        // --- Rule 3: Critical Context (Rule C) ---
        if (CONFIG.criticalScreens.includes(filename)) {
            if (!content.includes('<Screen') || !content.includes('id=')) {
                console.error(`\n❌ Critical screen missing <Screen> wrapper! (Rule C)`);
                console.error(`   File: ${relativePath}`);
                errorCount++;
            }
        }
    });

    // --- Rule 4: Integrity Check (Rule A - verify all registered IDs are used) ---
    // Optional: Warn if registered ID is NOT found in code (Zombie IDs)
    /*
    registeredIds.forEach(id => {
      if (!usedIds.has(id)) {
        console.warn(`⚠️  Warning: TestID '${id}' is registered but NOT found in codebase.`);
      }
    });
    */

    if (errorCount > 0) {
        console.error(`\n💥 Found ${errorCount} violations. Fix them to merge.`);
        process.exit(1);
    } else {
        console.log('✅ Telemetry Guardrails Passed!');
    }
}

scanFiles();
