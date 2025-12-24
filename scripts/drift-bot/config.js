
const path = require('path');

module.exports = {
    // Directories to scan for usage
    scanDirs: [
        'frontend/src',
        'frontend/components',
        'frontend/pages'
    ],

    // File extensions to check
    extensions: ['.tsx', '.ts', '.jsx', '.js'],

    // Path to the source of truth
    uiMapPath: 'frontend/src/telemetry/uiMap.ts',

    // Regex patterns
    patterns: {
        // Finds data-testid="something"
        usage: /data-testid=["']([^"']+)["']/g,

        // Finds definitions in uiMap.ts (simplified for parsing)
        // We might prefer a proper AST parser, but regex is faster for CLI checks
        definition: /['"]?([\w.-]+)['"]?:\s*{/g
    },

    // Ignore list
    exclusions: [
        'frontend/src/telemetry/uiMap.ts', // Don't count definition as usage
        'node_modules',
        'dist',
        'build',
        '.test.',
        '.spec.'
    ]
};
