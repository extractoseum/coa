import { SchemaValidator } from './SchemaValidator';
import { APITester } from './APITester';
import { IntegrationAuditor } from './IntegrationAuditor';

export interface DiagnosticReport {
    timestamp: string;
    version: string;
    summary: {
        overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
        passed: number;
        warnings: number;
        failures: number;
    };
    schema: any[];
    api: any[];
    integrations: any[];
    recommendations: string[];
}

export class SystemDiagnostics {
    private schemaValidator: SchemaValidator;
    private apiTester: APITester;
    private integrationAuditor: IntegrationAuditor;

    constructor() {
        this.schemaValidator = new SchemaValidator();
        this.apiTester = new APITester();
        this.integrationAuditor = new IntegrationAuditor();
    }

    setAuthToken(token: string) {
        this.apiTester.setAuthToken(token);
    }

    async runFullDiagnostic(): Promise<DiagnosticReport> {
        console.warn('[Diagnostics] Running Elite System Audit (v2.0)...');

        const [schemaResults, apiResults, integrationResults] = await Promise.all([
            this.schemaValidator.validateAll(),
            this.apiTester.runAll(),
            this.integrationAuditor.auditAll()
        ]);

        const schemaWarnings = schemaResults.filter(r => r.status === 'WARN').length;
        const schemaFailures = schemaResults.filter(r => r.status === 'FAIL').length;

        const apiWarnings = apiResults.filter(r => r.status === 'WARN').length;
        const apiFailures = apiResults.filter(r => r.status === 'FAIL').length;

        const integrationIssues = integrationResults.filter(
            r => r.status === 'DOWN' || r.status === 'DEGRADED' || r.status === 'UNCONFIGURED'
        ).length;

        // Overall status logic
        let overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
        if (schemaWarnings > 0 || apiWarnings > 0) overall = 'DEGRADED';
        if (schemaFailures > 0 || apiFailures > 0 || integrationResults.some(r => r.status === 'DOWN')) {
            overall = 'CRITICAL';
        }

        return {
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            summary: {
                overall,
                passed: schemaResults.filter(r => r.status === 'PASS').length +
                    apiResults.filter(r => r.status === 'PASS').length +
                    integrationResults.filter(r => r.status === 'HEALTHY').length,
                warnings: schemaWarnings + apiWarnings,
                failures: schemaFailures + apiFailures + integrationIssues
            },
            schema: schemaResults,
            api: apiResults,
            integrations: integrationResults,
            recommendations: this.generateRecommendations(schemaResults, apiResults, integrationResults)
        };
    }

    private generateRecommendations(schema: any[], api: any[], integrations: any[]): string[] {
        const recs: string[] = [];

        schema.forEach(s => {
            s.findings.forEach((f: any) => {
                recs.push(`[SCHEMA] ${s.table}.${f.column}: ${f.issue} (${f.severity}) - ${f.details}`);
            });
        });

        api.filter(a => a.status !== 'PASS').forEach(a => {
            recs.push(`[API] ${a.name} (${a.endpoint}): ${a.status} - ${a.issue || a.error}`);
        });

        integrations.filter(i => i.status !== 'HEALTHY').forEach(i => {
            recs.push(`[INTEGRATION] ${i.name}: ${i.status} - ${i.error || i.details?.reason || 'Check health endpoint'}`);
        });

        return recs;
    }
}
