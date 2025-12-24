
const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
    dim: '\x1b[2m',
    bold: '\x1b[1m'
};

module.exports = {
    report: (analysis, options = {}) => {
        const { summary, ghosts, zombies, ignored, routeMismatches } = analysis;

        // Markdown Output
        if (options.markdown) {
            let md = `### 🤖 Drift Bot Report\n\n`;
            const hasCritical = ghosts.length > 0 || (routeMismatches && routeMismatches.length > 0);

            md += `**Verdict**: ${hasCritical ? '🔴 FAIL' : (zombies.length > 0 ? '🟡 PASS (with Warnings)' : '🟢 PASS')}\n\n`;
            md += `| Metric | Count |\n| :--- | :---: |\n`;
            md += `| Defined | ${summary.totalDefined} |\n`;
            md += `| Used | ${summary.totalUsed} |\n`;
            md += `| 👻 Ghosts | ${summary.ghostCount} |\n`;
            md += `| 🔗 Route Errors | ${summary.routeMismatchCount || 0} |\n`;
            md += `| 🧟 Zombies | ${summary.zombieCount} |\n`;
            md += `| ⚪ Ignored | ${summary.ignoredCount} |\n\n`;

            if (ghosts.length > 0) {
                md += `### 🔴 Critical Issues (Ghosts)\n`;
                md += `> These IDs are used in code but NOT defined in \`uiMap.ts\`.\n\n`;
                ghosts.forEach((g) => {
                    md += `- **\`${g.id}\`**\n`;
                    g.locations.forEach(loc => md += `  - 📄 \`${loc.file}:${loc.line}\`\n`);
                });
                md += `\n`;
            }

            if (routeMismatches && routeMismatches.length > 0) {
                md += `### 🔴 Route Integrity Errors\n`;
                md += `> Routes defined in \`uiMap.ts\` do not exist in \`routeManifest.json\`.\n\n`;
                routeMismatches.forEach((r) => {
                    md += `- **\`${r.id}\`** points to invalid route \`${r.route}\`\n`;
                });
                md += `\n`;
            }

            if (zombies.length > 0) {
                md += `### 🟡 Warnings (Zombies)\n`;
                md += `> Defined in \`uiMap.ts\` but static usage not found (may be dynamic).\n\n`;
                md += `<details><summary>View ${zombies.length} Zombies</summary>\n\n`;
                zombies.forEach((z) => {
                    md += `- \`${z.id}\`\n`;
                });
                md += `\n</details>\n`;
            }

            console.log(md);
            return analysis;
        }

        // Console Report
        if (!options.json) {
            console.log(`\n${colors.bold}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
            console.log(`${colors.bold}║                    DRIFT BOT REPORT                           ║${colors.reset}`);
            console.log(`${colors.bold}╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

            console.log(`${colors.blue}📊 SUMMARY${colors.reset}`);
            console.log(`   Total Defined: ${summary.totalDefined}`);
            console.log(`   Used in Code:  ${summary.totalUsed}`);
            console.log(`   Ghosts:        ${summary.ghostCount > 0 ? colors.red : colors.green}${summary.ghostCount}${colors.reset}`);
            console.log(`   Route Errors:  ${(summary.routeMismatchCount > 0) ? colors.red : colors.green}${summary.routeMismatchCount || 0}${colors.reset}`);
            console.log(`   Zombies:       ${summary.zombieCount > 0 ? colors.yellow : colors.green}${summary.zombieCount}${colors.reset}`);
            console.log(`   Ignored:       ${colors.gray}${summary.ignoredCount}${colors.reset}\n`);

            if (ghosts.length > 0) {
                console.log(`${colors.red}🔴 CRITICAL - Ghost Beacons (used but not registered)${colors.reset}`);
                ghosts.forEach((g, i) => {
                    console.log(`   ${i + 1}. ${colors.bold}${g.id}${colors.reset}`);
                    g.locations.forEach(loc => console.log(`      ${colors.dim}${loc.file}:${loc.line}${colors.reset}`));
                });
                console.log('');
            } else {
                console.log(`${colors.green}✅ No Ghost Beacons found.${colors.reset}\n`);
            }

            if (routeMismatches && routeMismatches.length > 0) {
                console.log(`${colors.red}🔴 CRITICAL - Route Mismatches (UI Map vs Manifest)${colors.reset}`);
                routeMismatches.forEach((r, i) => {
                    console.log(`   ${i + 1}. ${colors.bold}${r.id}${colors.reset} -> Invalid Route: ${colors.red}${r.route}${colors.reset}`);
                });
                console.log('');
            } else {
                console.log(`${colors.green}✅ Route Integrity OK.${colors.reset}\n`);
            }

            if (zombies.length > 0) {
                console.log(`${colors.yellow}🟡 WARNING - Zombie Beacons (registered but not used)${colors.reset}`);
                zombies.forEach((z, i) => {
                    console.log(`   ${i + 1}. ${z.id} ${colors.dim}(defined in ${path.basename(z.location.file)}:${z.location.line})${colors.reset}`);
                });
                console.log('');
            } else {
                console.log(`${colors.green}✅ No Zombie Beacons found.${colors.reset}\n`);
            }

            if (ignored && ignored.length > 0) {
                console.log(`${colors.gray}⚪ IGNORED - Exempt from Drift Check${colors.reset}`);
                ignored.forEach((id) => {
                    console.log(`   - ${id}`);
                });
                console.log('');
            }

            const hasCritical = ghosts.length > 0 || (routeMismatches && routeMismatches.length > 0);
            const verdict = hasCritical ? 'FAIL' : 'PASS';
            const color = hasCritical ? colors.red : (zombies.length > 0 ? colors.yellow : colors.green);

            console.log(`${color}${colors.bold}VERDICT: ${verdict}${colors.reset} (Ghosts: ${ghosts.length}, Zombies: ${zombies.length})`);
        }

        // JSON Output (always return raw object for CLI to print or save)
        return {
            timestamp: new Date().toISOString(),
            ...analysis
        };
    }
};
