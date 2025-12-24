
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const ts = require('typescript');
const config = require('./config');

/**
 * Parses uiMap.ts using TypeScript AST to extract defined TestIDs and Metadata.
 */
function getDefinedIDs(rootDir) {
    const fullPath = path.resolve(rootDir, config.uiMapPath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`UIMap file not found at: ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        fullPath,
        content,
        ts.ScriptTarget.Latest,
        true
    );

    const definedIndices = {};

    // We look for the 'uiMap' constant or exported object
    function visit(node) {
        if (ts.isPropertyAssignment(node)) {
            // We are looking for: testid: "value"
            const name = node.name.getText(sourceFile);
            if (name === 'testid' || name === "'testid'" || name === '"testid"') {
                if (ts.isStringLiteral(node.initializer)) {
                    const testId = node.initializer.text;
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

                    // Now try to find siblings for metadata (visibility, etc.)
                    const parent = node.parent; // ObjectLiteralExpression
                    let visibility = 'always';
                    let ignoreDrift = false;

                    if (ts.isObjectLiteralExpression(parent)) {
                        parent.properties.forEach(prop => {
                            if (ts.isPropertyAssignment(prop)) {
                                const propName = prop.name.getText(sourceFile);
                                if (propName === 'visibility' && ts.isStringLiteral(prop.initializer)) {
                                    visibility = prop.initializer.text;
                                }
                                if (propName === 'ignoreDrift' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                                    ignoreDrift = true;
                                }
                            }
                        });
                    }

                    definedIndices[testId] = {
                        file: config.uiMapPath,
                        line,
                        visibility,
                        ignoreDrift
                    };
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return definedIndices;
}

/**
 * Scans the codebase using TypeScript AST to find data-testid usages.
 */
function getUsedIDs(rootDir) {
    const usedIndices = {};

    const files = config.scanDirs.reduce((acc, dir) => {
        const pattern = `${dir}/**/*{${config.extensions.join(',')}}`;
        const found = glob.sync(path.resolve(rootDir, pattern), {
            ignore: config.exclusions.map(ex => `**/${ex}/**`)
        });
        return acc.concat(found);
    }, []);

    files.forEach(file => {
        if (config.exclusions.some(ex => file.includes(ex))) return;

        const content = fs.readFileSync(file, 'utf-8');
        const sourceFile = ts.createSourceFile(
            file,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        function visit(node) {
            // 1. Check for JSX Attribute: data-testid="value"
            if (ts.isJsxAttribute(node)) {
                if (node.name.getText(sourceFile) === 'data-testid') {
                    if (node.initializer && ts.isStringLiteral(node.initializer)) {
                        addUsage(node.initializer.text, node);
                    }
                    // Handle {expression} ?
                    else if (node.initializer && ts.isJsxExpression(node.initializer)) {
                        // Determine if it's a simple string inside expression
                        // Not implemented for complex expressions yet, but captures {'string'}
                    }
                }
            }

            // 2. Check for Playwright calls: getByTestId('value') or locator('[data-testid="value"]')
            // This is a bit more complex, simplified for MVP to just look for string literals in specific call contexts roughly?
            // Or just stick to strictly JSX attributes for 'Front End Usage' and separate 'Test Usage' later.
            // User requested separation.

            // Let's stick to Trusted JSX attributes for now to avoid false positives. 
            // Playwright usage scanning is Phase 1.5.

            ts.forEachChild(node, visit);
        }

        function addUsage(id, node) {
            if (!usedIndices[id]) {
                usedIndices[id] = [];
            }
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            usedIndices[id].push({
                file: path.relative(rootDir, file),
                line,
                type: 'frontend' // vs 'test'
            });
        }

        visit(sourceFile);
    });

    return usedIndices;
}

module.exports = {
    detect: (rootDir) => {
        console.log('🔍 Scanning for TestIDs (AST-Powered)...');
        const defined = getDefinedIDs(rootDir);
        const used = getUsedIDs(rootDir);

        return { defined, used };
    }
};
