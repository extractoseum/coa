
import { Request, Response } from 'express';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export const getDriftReport = async (req: Request, res: Response) => {
    try {
        // Locate script: 
        // In Prod: /var/www/coa-viewer/scripts/drift-bot/index.js
        // In Dev: src/../../scripts/drift-bot/index.js

        const rootDir = path.resolve(process.cwd(), '..');
        const scriptPath = path.join(rootDir, 'scripts', 'drift-bot', 'index.js');

        // We need to pass the root dir to the script if it relies on __dirname relative to script location
        // The script calculates rootDir as path.resolve(__dirname, '../../')
        // So as long as script file is in /scripts/drift-bot/ it should find the project root.

        // However, in Prod, the 'project root' might not contain 'frontend/src'.
        // We will catch that error.

        const { stdout } = await execPromise(`node "${scriptPath}" --json`);

        try {
            const report = JSON.parse(stdout);
            res.json({ success: true, report });
        } catch (parseErr) {
            res.status(500).json({ success: false, error: 'Failed to parse drift report', raw: stdout });
        }

    } catch (error: any) {
        // Check if it's a known drift exit code (1 = Critical)
        // The execPromise throws if exit code != 0
        if (error.stdout) {
            try {
                // If the bot exited with 1 (Critical), it still outputs JSON
                const report = JSON.parse(error.stdout);
                return res.json({ success: true, report });
            } catch (e) {
                // ignore
            }
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Drift execution failed',
            hint: 'Drift Bot requires access to frontend source code, which might not be available in this environment.'
        });
    }
};
