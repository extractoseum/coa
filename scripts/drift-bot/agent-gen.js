
const fs = require('fs');
const path = require('path');
const detector = require('./detector');

function generate(rootDir) {
    if (!rootDir) rootDir = process.cwd();

    console.log('🤖 Generating Agent Map...');
    const result = detector.detect(rootDir);
    const defined = result.defined;

    const capabilities = Object.values(defined).map(item => {
        // Construct the capability object
        // We only want to expose testable/navigable capabilities
        // If it's a "Zombie" (dynamic usage), we still expose it if it has a route?
        // Actually, zombie status is usage-based. AgentMap is DEFINITION based.
        // So we expose everything in the UI Map.

        const cap = {
            id: item.id, // e.g. "nav.user.mi_dashboard"
            // We might want the LOGICAL key (e.g. "nav.user.dashboard")?
            // Detector doesn't capture the key name currently.
            // But 'id' (testId) is the actionable selector.
            route: item.route,
            auth: item.authRequired,
            dynamic: item.dynamic || false
        };

        if (item.routeParams) {
            cap.params = item.routeParams;
        }

        if (item.description) {
            cap.description = item.description;
        }

        // Only include if it has a route (Navigation Capability) or explicit interaction?
        // UI Map defines elements. Some are just buttons.
        // But the primary use of Agent Map is Navigation.
        return cap;
    }); // Filter out items without routes if we only want navigation map?
    // But buttons are also capabilties (e.g. click).

    const agentMap = {
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        capabilities: capabilities.sort((a, b) => a.id.localeCompare(b.id))
    };

    const outputPath = path.resolve(rootDir, 'frontend/public/agentMap.json');
    fs.writeFileSync(outputPath, JSON.stringify(agentMap, null, 2));

    console.log(`🗺️  Agent Map written to ${outputPath} (${capabilities.length} capabilities)`);
    return agentMap;
}

module.exports = { generate };

// Allow direct execution
if (require.main === module) {
    generate(process.argv[2]);
}
