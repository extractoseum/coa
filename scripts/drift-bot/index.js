#!/usr/bin/env node

const path = require('path');
const detector = require('./detector');
const analyzer = require('./analyzer');
const reporter = require('./reporter');

const args = {
    json: process.argv.includes('--json'),
    markdown: process.argv.includes('--markdown'),
    strict: process.argv.includes('--strict') // Fail on Zombies too?
};

function main() {
    const rootDir = path.resolve(__dirname, '../../');

    try {
        // 1. Detect
        const rawData = detector.detect(rootDir);

        // 2. Analyze
        const analysis = analyzer.analyze(rawData);

        // 3. Report
        const report = reporter.report(analysis, args);

        if (args.json) {
            console.log(JSON.stringify(report, null, 2));
        }

        // Exit Codes
        // 0: Success
        // 1: Critical Issues (Ghosts)
        // 2: Warning Issues (Zombies) - only if strict

        if (analysis.ghosts.length > 0) {
            process.exit(1);
        }

        if (args.strict && analysis.zombies.length > 0) {
            process.exit(1);
        }

        process.exit(0);

    } catch (error) {
        console.error('Drift Bot Error:', error.message);
        process.exit(1);
    }
}

main();
