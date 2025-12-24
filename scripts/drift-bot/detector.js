
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const ts = require('typescript');
const config = require('./config');

/**
 * Parses routes.ts to create a map of ROUTES.key -> value
 */
function getRouteMap(rootDir) {
    const fullPath = path.resolve(rootDir, 'frontend/src/routes.ts');
    if (!fs.existsSync(fullPath)) return {};

    const content = fs.readFileSync(fullPath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        fullPath,
        content,
        ts.ScriptTarget.Latest,
        true
    );

    const routeMap = {};

    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'ROUTES') {
            let initializer = node.initializer;

            // Handle "as const" assertion
            if (initializer && ts.isAsExpression(initializer)) {
                initializer = initializer.expression;
            }

            if (initializer && ts.isObjectLiteralExpression(initializer)) {
                initializer.properties.forEach(prop => {
                    if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
                        const key = prop.name.getText(sourceFile);
                        const val = prop.initializer.text;
                        console.log(`DEBUG: Found Route: ROUTES.${key} -> ${val}`);
                        routeMap[`ROUTES.${key}`] = val;
                    }
                });
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return routeMap;
}

/**
 * Parses uiMap.ts using TypeScript AST to extract defined TestIDs and Metadata.
 */
function getDefinedIDs(rootDir) {
    const routeMap = getRouteMap(rootDir);
    console.log('DEBUG: RouteMap Keys:', Object.keys(routeMap));
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
                // Check if this is inside an 'open' action definition (Reference, not Definition)
                // Hierarchy: PropertyAssignment(testid) -> ObjectLiteral -> PropertyAssignment(open)
                const objLiteralParent = node.parent; // ObjectLiteral
                if (ts.isObjectLiteralExpression(objLiteralParent) && objLiteralParent.parent && ts.isPropertyAssignment(objLiteralParent.parent)) {
                    const grandParentName = objLiteralParent.parent.name.getText(sourceFile);
                    if (grandParentName === 'open') {
                        // specific exclusion for known nested action properties
                        return;
                    }
                }

                if (ts.isStringLiteral(node.initializer)) {
                    const testId = node.initializer.text;
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

                    // Now try to find siblings for metadata (visibility, etc.)
                    const parent = node.parent; // ObjectLiteralExpression
                    let visibility = 'always';
                    // Extract Metadata
                    let route = undefined;
                    let routeParams = undefined;
                    let ignoreDrift = false;
                    let authRequired = undefined;
                    let dynamic = false;
                    let description = undefined;

                    if (ts.isObjectLiteralExpression(parent)) { // Metadata is sibling properties to 'testid'
                        parent.properties.forEach(p => {
                            if (!ts.isPropertyAssignment(p)) return;
                            const propName = p.name.getText(sourceFile);

                            // Route
                            if (propName === 'route') {
                                if (ts.isPropertyAccessExpression(p.initializer)) {
                                    const raw = p.initializer.getText(sourceFile);
                                    if (routeMap[raw]) route = routeMap[raw];
                                    else route = raw; // Fallback to raw constant name
                                } else if (ts.isStringLiteral(p.initializer)) {
                                    route = p.initializer.text;
                                }
                            }

                            // Route Params
                            if (propName === 'routeParams' && ts.isObjectLiteralExpression(p.initializer)) {
                                routeParams = {};
                                p.initializer.properties.forEach(param => {
                                    if (ts.isPropertyAssignment(param) && ts.isStringLiteral(param.initializer)) {
                                        routeParams[param.name.getText(sourceFile)] = param.initializer.text;
                                    }
                                });
                            }

                            // Ignore Drift
                            if (propName === 'ignoreDrift' && p.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                                ignoreDrift = true;
                            }

                            // Auth Required
                            if (propName === 'authRequired') {
                                if (p.initializer.kind === ts.SyntaxKind.TrueKeyword) authRequired = true;
                                if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) authRequired = false;
                            }

                            // Dynamic
                            if (propName === 'dynamic' && p.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                                dynamic = true;
                            }

                            // Description (if we assume it exists, though uiMap doesn't seem to have it in example?)
                            if (propName === 'description' && ts.isStringLiteral(p.initializer)) {
                                description = p.initializer.text;
                            }
                            // Also handle visibility, which was already there
                            if (propName === 'visibility' && ts.isStringLiteral(p.initializer)) {
                                visibility = p.initializer.text;
                            }
                        });
                    }

                    // The testid is already extracted as `testId`
                    // The line is already extracted as `line`

                    definedIndices[testId] = {
                        id: testId, // Use the already extracted testId
                        file: config.uiMapPath,
                        line: line, // Use the already extracted line
                        visibility, // Keep visibility
                        route,
                        routeParams,
                        authRequired,
                        dynamic,
                        ignoreDrift,
                        description
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
