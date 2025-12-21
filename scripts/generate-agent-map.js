const fs = require('fs');
const path = require('path');

// Configuration
const UI_MAP_PATH = path.join(__dirname, '../frontend/src/telemetry/uiMap.ts');
const OUTPUT_PATH = path.join(__dirname, '../frontend/public/agentMap.json');

console.log('🤖 SWIS Watch: Generating Agent Map (v2.0)');
console.log('==========================================');

// 1. Read UI Map
const uiMapContent = fs.readFileSync(UI_MAP_PATH, 'utf8');

// 2. Parse into JSON structure
// We want to extract the object properties.
// Since the file is TS, we can't require() it directly without ts-node.
// We will use a robust regex to parse the object fields.

const agentMap = {
    version: "2.0",
    generatedAt: new Date().toISOString(),
    beacons: {}
};

// Match: "key": { ...content... }
// We need to be careful with nested braces. 
// For v1 of this script, we assume the format in uiMap.ts is consistent (one line per entry).
const lineRegex = /"([^"]+)":\s*({[^}]+})/g;
let match;

let count = 0;

while ((match = lineRegex.exec(uiMapContent)) !== null) {
    const key = match[1];
    const objectStr = match[2];

    try {
        // Convert JS object string to JSON-ish string manually
        // 1. Quote keys: testid: -> "testid":
        // 2. Quote strings: DONE (already quoted)
        // 3. Handle ROUTES constant? -> We need to resolve ROUTES.dashboard etc.

        // Simpler approach: Extract specific known fields via regex from the object string
        const testid = /testid:\s*"([^"]+)"/.exec(objectStr)?.[1];

        // Route is tricky because it might be `ROUTES.dashboard` OR `"/some/path"`
        let route = /route:\s*"([^"]+)"/.exec(objectStr)?.[1];
        if (!route) {
            // Check for ROUTES constant usage
            const routeConst = /route:\s*ROUTES\.([a-zA-Z0-9_]+)/.exec(objectStr)?.[1];
            if (routeConst) {
                route = `[Ref: ROUTES.${routeConst}]`;
                // In a perfect world we'd map this, but for agents, the symbolic ref is often enough 
                // OR we'd need to parse routes.ts. 
                // For v2.0 MVP, let's keep the symbolic ref or try to map a few common ones if needed.
            }
        }

        const authRequired = /authRequired:\s*(true|false)/.exec(objectStr)?.[1] === 'true';
        const description = `Interactive element: ${key}`; // Placeholder desc

        if (testid) {
            agentMap.beacons[key] = {
                testid,
                route,
                requiresAuth: authRequired,
                description
            };
            count++;
        }

    } catch (e) {
        console.warn(`Failed to parse entry for ${key}:`, e);
    }
}

// 3. Write Output
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(agentMap, null, 2));

console.log(`✅ Generated Map with ${count} beacons.`);
console.log(`📍 Output: ${OUTPUT_PATH}`);
