import { SystemDiagnostics } from './SystemDiagnostics';

async function main() {
    // Initialize orchestrator
    const diagnostics = new SystemDiagnostics();

    // Optional: Set auth token from env if needed for deeper API tests
    if (process.env.DIAG_AUTH_TOKEN) {
        diagnostics.setAuthToken(process.env.DIAG_AUTH_TOKEN);
    }

    // Run full suite
    const report = await diagnostics.runFullDiagnostic();

    // Output JSON to stdout for AI consumption
    console.log(JSON.stringify(report, null, 2));

    // Exit code based on critical status
    process.exit(report.summary.overall === 'CRITICAL' ? 1 : 0);
}

main().catch(e => {
    console.error('Diagnostic failed:', e);
    process.exit(1);
});
