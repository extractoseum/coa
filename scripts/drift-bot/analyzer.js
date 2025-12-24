
module.exports = {
    analyze: (data) => {
        const { defined, used } = data;
        const definedKeys = Object.keys(defined);
        const usedKeys = Object.keys(used);

        const ghosts = [];
        const zombies = [];
        const matched = [];
        const ignored = [];

        // Find Ghosts: Used but not Defined
        usedKeys.forEach(id => {
            if (!defined[id]) {
                // Here we could check a global ignore list too
                ghosts.push({
                    id,
                    locations: used[id],
                    severity: 'critical'
                });
            } else {
                matched.push(id);
            }
        });

        // Find Zombies: Defined but not Used
        definedKeys.forEach(id => {
            const def = defined[id];

            // If used, it's not a zombie
            if (used[id]) return;

            // Check Allowlist/Ignore logic
            if (def.ignoreDrift) {
                ignored.push(id);
                return;
            }

            if (def.visibility === 'featureFlag' || def.visibility === 'mobileOnly') {
                // Maybe warn but don't fail? Or ignore?
                // For now, treat as 'ignored' from drift check to reduce noise, or distinct category
                ignored.push(id);
                return;
            }

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
                ignoredCount: ignored.length
            },
            ghosts,
            zombies,
            ignored
        };
    }
};
