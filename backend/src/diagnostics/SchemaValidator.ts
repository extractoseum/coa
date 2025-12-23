import { Client } from 'pg';
import { supabase } from '../config/supabase';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

interface ColumnExpectation {
    column: string;
    type: string;
    nullable: boolean;
    hasDefault: boolean;
}

interface TableExpectation {
    table: string;
    columns: ColumnExpectation[];
}

interface SchemaV2Result {
    table: string;
    status: 'PASS' | 'WARN' | 'FAIL';
    findings: SchemaFinding[];
}

interface SchemaFinding {
    column: string;
    issue: 'MISSING' | 'TYPE_MISMATCH' | 'NULLABILITY' | 'DEFAULT_MISSING';
    severity: 'CRITICAL' | 'WARNING';
    details: string;
}

const SCHEMA_EXPECTATIONS: TableExpectation[] = [
    {
        table: 'mini_chips',
        columns: [
            { column: 'id', type: 'uuid', nullable: false, hasDefault: true },
            { column: 'is_active', type: 'boolean', nullable: true, hasDefault: true },
            { column: 'actions_payload', type: 'jsonb', nullable: false, hasDefault: true },
            { column: 'name', type: 'character varying', nullable: false, hasDefault: false },
            { column: 'is_global', type: 'boolean', nullable: true, hasDefault: true }
        ]
    }
];

export class SchemaValidator {
    async validateAll(): Promise<SchemaV2Result[]> {
        const results: SchemaV2Result[] = [];
        let pgClient: Client | null = null;

        try {
            const url = new URL(process.env.DATABASE_URL || '');
            const host = url.hostname;
            console.warn(`[SchemaValidator] Resolving ${host} to IPv4...`);

            const { address } = await lookup(host, { family: 4 });
            url.hostname = address;
            console.warn(`[SchemaValidator] Forced IPv4: ${address}`);

            pgClient = new Client({
                connectionString: url.toString(),
                ssl: { rejectUnauthorized: false }
            });

            await pgClient.connect();

            for (const exp of SCHEMA_EXPECTATIONS) {
                results.push(await this.validateTableDeep(pgClient, exp));
            }

        } catch (e: any) {
            console.warn('[SchemaValidator] Deep Metadata check failed (IPv6/DNS/SSL):', e.message);
            // Fallback to basic Supabase probe if PG fails
            for (const exp of SCHEMA_EXPECTATIONS) {
                results.push(await this.validateTableBasic(exp));
            }
        } finally {
            if (pgClient) {
                try { await pgClient.end(); } catch (e) { }
            }
        }

        return results;
    }

    private async validateTableDeep(client: Client, exp: TableExpectation): Promise<SchemaV2Result> {
        const findings: SchemaFinding[] = [];

        try {
            const query = `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1
            `;
            const { rows } = await client.query(query, [exp.table]);

            if (rows.length === 0) {
                return {
                    table: exp.table,
                    status: 'FAIL',
                    findings: [{
                        column: 'TABLE',
                        issue: 'MISSING',
                        severity: 'CRITICAL',
                        details: `Table ${exp.table} not found in information_schema`
                    }]
                };
            }

            for (const colExp of exp.columns) {
                const actual = rows.find(r => r.column_name === colExp.column);

                if (!actual) {
                    findings.push({
                        column: colExp.column,
                        issue: 'MISSING',
                        severity: 'CRITICAL',
                        details: 'Column does not exist'
                    });
                    continue;
                }

                // Check Nullability
                const actualNullable = actual.is_nullable === 'YES';
                if (actualNullable !== colExp.nullable) {
                    findings.push({
                        column: colExp.column,
                        issue: 'NULLABILITY',
                        severity: 'WARNING',
                        details: `Expected nullable=${colExp.nullable}, but actual is ${actualNullable}`
                    });
                }

                // Check Defaults
                const actualHasDefault = actual.column_default !== null;
                if (colExp.hasDefault && !actualHasDefault) {
                    findings.push({
                        column: colExp.column,
                        issue: 'DEFAULT_MISSING',
                        severity: 'WARNING',
                        details: 'Missing expected default value'
                    });
                }
            }

            const hasCritical = findings.some(f => f.severity === 'CRITICAL');
            const hasWarning = findings.some(f => f.severity === 'WARNING');

            return {
                table: exp.table,
                status: hasCritical ? 'FAIL' : (hasWarning ? 'WARN' : 'PASS'),
                findings
            };

        } catch (e: any) {
            return {
                table: exp.table,
                status: 'FAIL',
                findings: [{
                    column: 'DB',
                    issue: 'MISSING',
                    severity: 'CRITICAL',
                    details: e.message
                }]
            };
        }
    }

    private async validateTableBasic(exp: TableExpectation): Promise<SchemaV2Result> {
        const findings: SchemaFinding[] = [];
        for (const colExp of exp.columns) {
            const { error } = await supabase.from(exp.table).select(colExp.column).limit(1);
            if (error) {
                findings.push({
                    column: colExp.column,
                    issue: 'MISSING',
                    severity: 'CRITICAL',
                    details: error.message
                });
            }
        }
        return {
            table: exp.table,
            status: findings.length > 0 ? 'FAIL' : 'PASS',
            findings
        };
    }
}
