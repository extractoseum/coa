
const fs = require('fs');
const path = require('path');

module.exports = {
    fix: (analysis, config) => {
        const { zombies } = analysis;
        if (!zombies || zombies.length === 0) {
            console.log('✨ No zombies to fix.');
            return;
        }

        const uiMapPath = path.resolve(process.cwd(), config.uiMapPath);
        if (!fs.existsSync(uiMapPath)) {
            console.error(`❌ UIMap not found at ${uiMapPath}`);
            return;
        }

        console.log(`🔧 Applying fixes to ${zombies.length} Zombies...`);

        let content = fs.readFileSync(uiMapPath, 'utf-8');
        const lines = content.split('\n');
        let modifications = 0;

        // Process from bottom to top to preserve line numbers
        // detector returns 1-based line number for the 'testid' property
        const sortedZombies = [...zombies].sort((a, b) => b.location.line - a.location.line);

        sortedZombies.forEach(z => {
            const lineIdx = z.location.line - 1;
            const originalLine = lines[lineIdx];

            // Safety check: verify line contains the ID
            if (!originalLine || !originalLine.includes(z.id)) {
                console.warn(`⚠️ Skipping ${z.id}: Line mismatch at ${z.location.line}`);
                return;
            }

            // Check if already ignored (shouldn't be, since it's a zombie, but good to check)
            if (z.location.ignoreDrift) return;

            // Naive insertion: append ignoreDrift: true after the testid line
            // We assume the object structure is valid.
            // We'll splice a new line AFTER the testid line.
            // But wait, if we splice, we shift line numbers for subsequent edits?
            // YES. That's why we sort Bottom-to-Top! correctly.

            // Check if it's a single-line object definition
            // e.g. "key": { ... },
            const closeBraceIdx = originalLine.lastIndexOf('}');
            if (closeBraceIdx !== -1) {
                // Verify it's not a comment or something
                // We'll inject before the closing brace
                const before = originalLine.substring(0, closeBraceIdx);
                const after = originalLine.substring(closeBraceIdx);

                // Check if we need a comma prefix
                // If the last non-space char before brace is not '{' and not ',', add ','
                // But easiest is just to add ", ignoreDrift: true"
                // If the object was empty "{}", it becomes "{, ignoreDrift: true}" which is valid-ish but ugly.
                // Assuming non-empty since it has 'testid'.

                const newLine = `${before}, ignoreDrift: true${after}`;
                lines[lineIdx] = newLine; // Replace the line
                modifications++;
                console.log(`   ✅ Ignored ${z.id} (Inline)`);
            } else {
                console.warn(`⚠️ Could not parse object at line ${z.location.line}. Skipping.`);
            }
        });

        if (modifications > 0) {
            fs.writeFileSync(uiMapPath, lines.join('\n'), 'utf-8');
            console.log(`🎉 Applied ${modifications} fixes to uiMap.ts`);
        } else {
            console.log('No changes applied.');
        }
    }
};
