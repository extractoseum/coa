const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const UI_MAP_PATH = path.join(__dirname, '../frontend/src/telemetry/uiMap.ts');
const FRONTEND_SRC = path.join(__dirname, '../frontend/src');

console.log('🔮 SWIS Watch: Drift Auto-Fixer');
console.log('===============================');

// Parse flags
const args = process.argv.slice(2);
const isFixMode = args.includes('--fix');
const isReportMode = args.includes('--report');

// 1. Parse UI Map
const uiMapContent = fs.readFileSync(UI_MAP_PATH, 'utf8');
const definedBeacons = new Set();
const definedKeys = new Set();

const lines = uiMapContent.split('\n');
lines.forEach(line => {
    const keyMatch = /"([^"]+)":\s*{/.exec(line);
    const testidMatch = /testid:\s*"([^"]+)"/.exec(line);
    const dynamicMatch = /dynamic:\s*true/.exec(line);

    if (keyMatch && testidMatch) {
        // definedKeys.add(keyMatch[1]);
        definedBeacons.add(testidMatch[1]);
    }
});

// 2. Scan Codebase
console.log(`\n🔍 Scanning codebase...`);
const files = glob.sync(`${FRONTEND_SRC}/**/*.tsx`);
const usedBeacons = new Map(); // testid -> filePath needed for context

const beaconUsageRegex = /data-testid="([^"]+)"/g;

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = beaconUsageRegex.exec(content)) !== null) {
        const beacon = match[1];
        if (!usedBeacons.has(beacon)) {
            usedBeacons.set(beacon, file);
        }
    }
});

// 3. Identify Ghosts
const ghostBeacons = [];
usedBeacons.forEach((file, beacon) => {
    if (beacon.includes('${') || beacon.includes('{')) return; // Ignore dynamic
    if (!definedBeacons.has(beacon)) {
        ghostBeacons.push({ beacon, file });
    }
});

if (ghostBeacons.length === 0) {
    console.log('✨ No Ghost Beacons found. System is healthy.');
    process.exit(0);
}

// 4. Generate Proposals
console.log(`\n🛠️  Found ${ghostBeacons.length} Ghost Beacons.`);
console.log('   Generating fix proposals...\n');

const proposals = ghostBeacons.map(g => {
    // Heuristic: Try to derive a meaningful key from the testid or filename
    const filename = path.basename(g.file, '.tsx').toLowerCase();
    const safeBeacon = g.beacon.replace(/[^a-zA-Z0-9_]/g, '_');

    // Proposal: "page.element"
    const proposedKey = `auto.${filename}.${safeBeacon}`;

    return {
        beacon: g.beacon,
        key: proposedKey,
        file: g.file,
        patch: `    "${proposedKey}": { testid: "${g.beacon}", route: ROUTES.dashboard, authRequired: true }, // [AUTO-FIX]`
    };
});

// 5. Execution
if (isReportMode) {
    console.log('📋 PROPOSED FIXES (Copy to uiMap.ts):');
    proposals.forEach(p => console.log(p.patch));
} else if (isFixMode) {
    console.log('💾 applying fixes to uiMap.ts...');

    const closingBraceIndex = uiMapContent.lastIndexOf('};');
    if (closingBraceIndex === -1) {
        console.error('❌ Could not find closing brace of UI object.');
        process.exit(1);
    }

    const insertionPoint = closingBraceIndex;
    const before = uiMapContent.substring(0, insertionPoint);
    const after = uiMapContent.substring(insertionPoint);

    const patchBlock = '\n    // --- AUTO-GENERATED FIXES ---\n' +
        proposals.map(p => p.patch).join('\n') +
        '\n';

    const newContent = before + patchBlock + after;
    fs.writeFileSync(UI_MAP_PATH, newContent);
    console.log('✅ Successfully patched uiMap.ts');

} else {
    console.log('⚠️  Dry Run. Use --fix to apply changes or --report to see patches.');
    proposals.forEach(p => {
        console.log(`   - Ghost: "${p.beacon}" -> Proposed Key: "${p.key}" (in ${path.basename(p.file)})`);
    });
}
