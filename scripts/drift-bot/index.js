#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const detector = require('./detector');
const analyzer = require('./analyzer');
const reporter = require('./reporter');
const suggester = require('./suggester');
const agentGen = require('./agent-gen');
const config = require('./config');

const args = {
    json: process.argv.includes('--json'),
    markdown: process.argv.includes('--markdown'),
    strict: process.argv.includes('--strict'),
    fix: process.argv.includes('--fix'),
    gen: process.argv.includes('--gen')
};

function main() {
    const rootDir = path.resolve(__dirname, '../../');

    try {
        // 1. Detect
        const rawData = detector.detect(rootDir);

        // 1.5 Load Route Manifest
        let routeManifest = null;
        const manifestPath = path.resolve(rootDir, 'frontend/public/routeManifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                routeManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            } catch (e) {
                console.warn('⚠️ Failed to parse routeManifest.json');
            }
        }

        // 2. Analyze
        const analysis = analyzer.analyze(rawData, routeManifest);

        // 3. Report
        const report = reporter.report(analysis, args);

        // 4. Auto-Fix
        if (args.fix) {
            suggester.fix(analysis, config);
        }

        // 5. Exit Code
        if (args.json) {
            console.log(JSON.stringify(report, null, 2));
        }

        // 6. Generate Agent Map (Phase 46)
        // Auto-generate if requested OR if verified clean (optional, stick to flag for now)
        if (args.gen) {
            agentGen.generate(process.cwd());
        }

        const success = report.summary.ghostCount === 0 &&
            (report.routeMismatches ? report.routeMismatches.length === 0 : true) &&
            (!args.strict || report.summary.zombieCount === 0);

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
