
module.exports = {
    analyze: (data, routeManifest) => {
        const { defined, used } = data;
        const definedKeys = Object.keys(defined);
        const usedKeys = Object.keys(used);

        const ghosts = [];
        const zombies = [];
        const matched = [];
        const ignored = [];
        const routeMismatches = [];

        // Valid Routes Set for O(1) lookup
        const validRoutes = routeManifest ? new Set(Object.values(routeManifest)) : null;

        // Find Ghosts: Used but not Defined
        usedKeys.forEach(id => {
            if (!defined[id]) {
                ghosts.push({
                    id,
                    locations: used[id],
                    severity: 'critical'
                });
            } else {
                matched.push(id);
            }
        });

        // Find Zombies & Route Mismatches
        definedKeys.forEach(id => {
            const def = defined[id];

            // Check Allowlist/Ignore logic
            if (def.ignoreDrift) {
                ignored.push(id);
                return;
            }

            if (def.visibility === 'featureFlag' || def.visibility === 'mobileOnly') {
                ignored.push(id);
                return;
            }

            // Route Check
            if (validRoutes && def.route) {
                // Check exact match (or handles :param?)
                // Manifest has "/coa/:token". UI Map resolves to "/coa/:token" (via ROUTES.coaDetails).
                // So exact string match should work.
                if (!validRoutes.has(def.route)) {
                    routeMismatches.push({
                        id,
                        route: def.route,
                        severity: 'critical'
                    });
                }
            }

            // Used Check
            if (used[id]) return;

            zombies.push({
                id,
                location: def,
                severity: 'warning'
            });
        });

        return {
            summary: {
                totalDefined: definedKeys.length,
                totalUsed: usedKeys.length,
                ghostCount: ghosts.length,
                zombieCount: zombies.length,
                matchedCount: matched.length,
                ignoredCount: ignored.length,
                routeMismatchCount: routeMismatches.length
            },
            ghosts,
            zombies,
            ignored,
            routeMismatches
        };
    }
};
