const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const UI_MAP_PATH = path.join(__dirname, '../frontend/src/telemetry/uiMap.ts');
const FRONTEND_SRC = path.join(__dirname, '../frontend/src');

console.log('🔮 SWIS Watch: Predictive Resilience (Drift Detection)');
console.log('====================================================');

// 1. Parse UI Map (Source of Truth)
// We use a more robust regex to capture the key, testid, AND flags like 'dynamic: true'
const uiMapContent = fs.readFileSync(UI_MAP_PATH, 'utf8');
const definedBeacons = new Map(); // testid -> { key, isDynamic }
const definedKeys = new Set();

// Split by lines to handle the object properties one by one roughly
const lines = uiMapContent.split('\n');
lines.forEach(line => {
    // Match: "key": { testid: "value", ... }
    const keyMatch = /"([^"]+)":\s*{/.exec(line);
    const testidMatch = /testid:\s*"([^"]+)"/.exec(line);
    const dynamicMatch = /dynamic:\s*true/.exec(line);

    if (keyMatch && testidMatch) {
        const key = keyMatch[1];
        const testid = testidMatch[1];
        const isDynamic = !!dynamicMatch;

        definedKeys.add(key);
        definedBeacons.set(testid, { key, isDynamic });
    }
});

console.log(`✅ Loaded Contract: ${definedBeacons.size} defined beacons.`);

// 2. Scan Codebase
console.log(`\n🔍 Scanning codebase in: ${FRONTEND_SRC}`);
const files = glob.sync(`${FRONTEND_SRC}/**/*.tsx`);
const usedBeacons = new Set();
const usedKeys = new Set();

const beaconUsageRegex = /data-testid="([^"]+)"/g;
const keyUsageRegex = /UI\["([^"]+)"\]|UI\.([a-zA-Z0-9_.]+)/g;

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');

    // Find literal data-testid usage
    let usageMatch;
    while ((usageMatch = beaconUsageRegex.exec(content)) !== null) {
        usedBeacons.add(usageMatch[1]);
    }

    // Find UI key usage (UI["key"] or UI.key)
    let keyMatch;
    while ((keyMatch = keyUsageRegex.exec(content)) !== null) {
        // match[1] is ["key"], match[2] is .key
        const key = keyMatch[1] || keyMatch[2];
        usedKeys.add(key);
    }
});

console.log(`✅ Analyzed ${files.length} files.`);
console.log(`   - Found ${usedBeacons.size} literal beacon usages.`);
console.log(`   - Found ${usedKeys.size} UI key references.`);

// 3. Drift Analysis
const ghostBeacons = []; // Used but not defined
const zombieKeys = [];   // Defined but not used

// Check Ghosts
usedBeacons.forEach(beacon => {
    // Ignore dynamic beacons containing template interpolation
    if (beacon.includes('${') || beacon.includes('{')) {
        return;
    }
    if (!definedBeacons.has(beacon)) {
        ghostBeacons.push(beacon);
    }
});

// Check Zombies
// A key is a Zombie if:
// 1. Its testID is NOT used literally in code
// 2. AND its Key is NOT referenced in code
// 3. AND it is NOT marked dynamic
definedBeacons.forEach((info, testid) => {
    const literallyUsed = usedBeacons.has(testid);
    const keyReferenced = usedKeys.has(info.key);

    if (!literallyUsed && !keyReferenced && !info.isDynamic) {
        zombieKeys.push(`${info.key} (${testid})`);
    }
});

// 4. Report
console.log('\n📊 Drift Report:');

if (ghostBeacons.length > 0) {
    console.error(`\n❌ VIOLATION: Found ${ghostBeacons.length} Ghost Beacons (Used in code but not in Contract):`);
    ghostBeacons.forEach(b => console.error(`   - ${b}`));
} else {
    console.log('✨ No Ghost Beacons found.');
}

if (zombieKeys.length > 0) {
    console.warn(`\n⚠️  WARNING: Found ${zombieKeys.length} Zombie Beacons (Defined in Contract but not used):`);
    zombieKeys.forEach(b => console.warn(`   - ${b}`));
} else {
    console.log('✨ No Zombie Beacons found.');
}

// 5. Exit Code
if (ghostBeacons.length > 0) {
    console.error('\n🚫 DRIFT DETECTED: Codebase has diverged from Governance Contract.');
    process.exit(1);
} else {
    console.log('\n🟢 SYSTEM INTEGRITY VALID. No critical drift.');
    process.exit(0);
}
