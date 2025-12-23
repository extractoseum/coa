# System Debugger for AI Agents

## Executive Summary

A **non-invasive diagnostic framework** that enables AI agents (like Claude) to validate system health, detect schema mismatches, test API integrations, and generate actionable reports—**without modifying production code**.

---

## The Problem

When implementing new features (like Omnichannel Orchestrator), we encountered:
1. **Schema Mismatches**: SQL migrations used `active` but TypeScript expected `is_active`
2. **Silent Failures**: ChipEngine queries returned empty results without errors
3. **Manual Debugging**: Required reading multiple files to correlate issues
4. **No Single Source of Truth**: Migrations, TypeScript interfaces, and runtime DB all diverged

**Cost of Not Having This**: Hours of debugging, potential production bugs, developer frustration.

---

## Proposed Solution: `SystemDiagnostics` Service

A read-only diagnostic layer that:
1. **Validates Schema** against TypeScript interfaces
2. **Tests API Endpoints** for response integrity
3. **Audits Integrations** (Whapi, Supabase, Shopify, OpenAI)
4. **Generates JSON Reports** for AI consumption

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SystemDiagnostics                             │
├─────────────────────────────────────────────────────────────────────┤
│  SchemaValidator    │  APITester    │  IntegrationAuditor           │
│  ─────────────────  │  ───────────  │  ─────────────────────        │
│  - Compare SQL ↔ TS │  - HTTP calls │  - Whapi health               │
│  - Column existence │  - Auth flows │  - Supabase connectivity      │
│  - Type validation  │  - Response   │  - Shopify API status         │
│                     │    schemas    │  - OpenAI quota check         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   DiagnosticReport      │
                    │   (JSON for AI Agent)   │
                    └─────────────────────────┘
```

---

## Component 1: Schema Validator

### Purpose
Detect mismatches between database schema and TypeScript interfaces.

### Implementation

```typescript
// backend/src/diagnostics/SchemaValidator.ts

import { supabase } from '../config/supabase';

interface SchemaCheck {
    table: string;
    expectedColumns: string[];
    optionalColumns?: string[];
}

interface SchemaResult {
    table: string;
    status: 'OK' | 'MISMATCH' | 'ERROR';
    missing: string[];
    extra: string[];
    details?: string;
}

const SCHEMA_DEFINITIONS: SchemaCheck[] = [
    {
        table: 'mini_chips',
        expectedColumns: [
            'id', 'chip_type', 'key', 'trigger_type', 'trigger_config',
            'actions_payload', 'priority', 'is_active', 'is_global',
            'name', 'channel_chip_id', 'created_at', 'updated_at'
        ]
    },
    {
        table: 'conversation_chips',
        expectedColumns: [
            'conversation_id', 'mini_chip_id', 'confidence',
            'metadata', 'applied_at', 'triggered_by_message_id'
        ]
    },
    {
        table: 'channel_chips',
        expectedColumns: [
            'id', 'channel_id', 'platform', 'account_reference',
            'traffic_source', 'expected_intent', 'default_entry_column_id',
            'default_agent_id', 'ruleset', 'is_active', 'created_at', 'updated_at'
        ]
    },
    {
        table: 'conversations',
        expectedColumns: [
            'id', 'channel', 'contact_handle', 'column_id', 'status',
            'agent_override_id', 'channel_chip_id', 'platform', 'traffic_source',
            'facts', 'summary', 'created_at', 'updated_at'
        ]
    },
    {
        table: 'crm_columns',
        expectedColumns: [
            'id', 'name', 'position', 'color', 'mode', 'objectives',
            'assigned_agent_id', 'voice_profile', 'extended_config', 'config'
        ]
    }
];

export class SchemaValidator {
    async validateAll(): Promise<SchemaResult[]> {
        const results: SchemaResult[] = [];

        for (const def of SCHEMA_DEFINITIONS) {
            results.push(await this.validateTable(def));
        }

        return results;
    }

    async validateTable(def: SchemaCheck): Promise<SchemaResult> {
        try {
            // Attempt to select all expected columns
            const { data, error } = await supabase
                .from(def.table)
                .select(def.expectedColumns.join(','))
                .limit(1);

            if (error) {
                // Parse error to find missing columns
                const match = error.message.match(/column "(\w+)" does not exist/);
                if (match) {
                    return {
                        table: def.table,
                        status: 'MISMATCH',
                        missing: [match[1]],
                        extra: [],
                        details: error.message
                    };
                }
                return {
                    table: def.table,
                    status: 'ERROR',
                    missing: [],
                    extra: [],
                    details: error.message
                };
            }

            return {
                table: def.table,
                status: 'OK',
                missing: [],
                extra: []
            };

        } catch (e: any) {
            return {
                table: def.table,
                status: 'ERROR',
                missing: [],
                extra: [],
                details: e.message
            };
        }
    }

    // Deep validation: Check individual columns
    async probeColumns(table: string, columns: string[]): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};

        for (const col of columns) {
            const { error } = await supabase
                .from(table)
                .select(col)
                .limit(1);

            results[col] = !error;
        }

        return results;
    }
}
```

---

## Component 2: API Tester

### Purpose
Validate API endpoints return expected response structures.

### Implementation

```typescript
// backend/src/diagnostics/APITester.ts

interface APITest {
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    endpoint: string;
    requiresAuth: boolean;
    expectedStatus: number[];
    expectedFields?: string[];
    mockBody?: any;
}

interface APITestResult {
    name: string;
    endpoint: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    actualStatus?: number;
    missingFields?: string[];
    responseTime?: number;
    error?: string;
}

const API_TESTS: APITest[] = [
    // CRM Chips
    {
        name: 'Get Channel Chips',
        method: 'GET',
        endpoint: '/api/crm/chips/channel',
        requiresAuth: true,
        expectedStatus: [200],
        expectedFields: ['success', 'data']
    },
    {
        name: 'Get Mini Chips',
        method: 'GET',
        endpoint: '/api/crm/chips/mini',
        requiresAuth: true,
        expectedStatus: [200],
        expectedFields: ['success', 'data']
    },
    // Health Checks
    {
        name: 'Health Check',
        method: 'GET',
        endpoint: '/api/health',
        requiresAuth: false,
        expectedStatus: [200],
        expectedFields: ['status']
    },
    // WhatsApp Status
    {
        name: 'WhatsApp Status',
        method: 'GET',
        endpoint: '/api/whatsapp/status',
        requiresAuth: true,
        expectedStatus: [200],
        expectedFields: ['connected', 'configured']
    },
    // CRM Columns
    {
        name: 'Get CRM Columns',
        method: 'GET',
        endpoint: '/api/crm/columns',
        requiresAuth: true,
        expectedStatus: [200],
        expectedFields: ['success']
    }
];

export class APITester {
    private baseUrl: string;
    private authToken?: string;

    constructor(baseUrl: string = 'http://localhost:3001') {
        this.baseUrl = baseUrl;
    }

    setAuthToken(token: string) {
        this.authToken = token;
    }

    async runAll(): Promise<APITestResult[]> {
        const results: APITestResult[] = [];

        for (const test of API_TESTS) {
            if (test.requiresAuth && !this.authToken) {
                results.push({
                    name: test.name,
                    endpoint: test.endpoint,
                    status: 'SKIP',
                    error: 'Auth token not provided'
                });
                continue;
            }

            results.push(await this.runTest(test));
        }

        return results;
    }

    async runTest(test: APITest): Promise<APITestResult> {
        const start = Date.now();

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (test.requiresAuth && this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }

            const response = await fetch(`${this.baseUrl}${test.endpoint}`, {
                method: test.method,
                headers,
                body: test.mockBody ? JSON.stringify(test.mockBody) : undefined
            });

            const responseTime = Date.now() - start;
            const data = await response.json().catch(() => ({}));

            // Check status
            const statusOk = test.expectedStatus.includes(response.status);

            // Check fields
            const missingFields = (test.expectedFields || []).filter(
                field => !(field in data)
            );

            return {
                name: test.name,
                endpoint: test.endpoint,
                status: statusOk && missingFields.length === 0 ? 'PASS' : 'FAIL',
                actualStatus: response.status,
                missingFields: missingFields.length > 0 ? missingFields : undefined,
                responseTime
            };

        } catch (e: any) {
            return {
                name: test.name,
                endpoint: test.endpoint,
                status: 'FAIL',
                error: e.message,
                responseTime: Date.now() - start
            };
        }
    }
}
```

---

## Component 3: Integration Auditor

### Purpose
Verify external service connectivity and configuration.

### Implementation

```typescript
// backend/src/diagnostics/IntegrationAuditor.ts

import { checkWhapiStatus, isWhapiConfigured } from '../services/whapiService';
import { supabase } from '../config/supabase';

interface IntegrationCheck {
    name: string;
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNCONFIGURED';
    latency?: number;
    details?: any;
    error?: string;
}

export class IntegrationAuditor {
    async auditAll(): Promise<IntegrationCheck[]> {
        return await Promise.all([
            this.checkSupabase(),
            this.checkWhapi(),
            this.checkOpenAI(),
            this.checkShopify()
        ]);
    }

    async checkSupabase(): Promise<IntegrationCheck> {
        const start = Date.now();
        try {
            const { data, error } = await supabase
                .from('conversations')
                .select('id')
                .limit(1);

            return {
                name: 'Supabase',
                status: error ? 'DEGRADED' : 'HEALTHY',
                latency: Date.now() - start,
                error: error?.message
            };
        } catch (e: any) {
            return {
                name: 'Supabase',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }

    async checkWhapi(): Promise<IntegrationCheck> {
        const start = Date.now();

        if (!isWhapiConfigured()) {
            return {
                name: 'Whapi (WhatsApp)',
                status: 'UNCONFIGURED',
                details: { reason: 'WHAPI_TOKEN not set or too short' }
            };
        }

        try {
            const status = await checkWhapiStatus();
            return {
                name: 'Whapi (WhatsApp)',
                status: status.connected ? 'HEALTHY' : 'DEGRADED',
                latency: Date.now() - start,
                details: {
                    connected: status.connected,
                    phone: status.phone,
                    name: status.name
                },
                error: status.error
            };
        } catch (e: any) {
            return {
                name: 'Whapi (WhatsApp)',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }

    async checkOpenAI(): Promise<IntegrationCheck> {
        const start = Date.now();
        const token = process.env.OPENAI_API_KEY;

        if (!token) {
            return {
                name: 'OpenAI',
                status: 'UNCONFIGURED',
                details: { reason: 'OPENAI_API_KEY not set' }
            };
        }

        try {
            // Simple models list to check connectivity
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                return {
                    name: 'OpenAI',
                    status: 'DOWN',
                    error: 'Invalid API Key'
                };
            }

            return {
                name: 'OpenAI',
                status: response.ok ? 'HEALTHY' : 'DEGRADED',
                latency: Date.now() - start
            };
        } catch (e: any) {
            return {
                name: 'OpenAI',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }

    async checkShopify(): Promise<IntegrationCheck> {
        const start = Date.now();
        const store = process.env.SHOPIFY_STORE_DOMAIN;
        const token = process.env.SHOPIFY_ACCESS_TOKEN;

        if (!store || !token) {
            return {
                name: 'Shopify',
                status: 'UNCONFIGURED',
                details: { reason: 'SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN not set' }
            };
        }

        try {
            const response = await fetch(`https://${store}/admin/api/2024-01/shop.json`, {
                headers: { 'X-Shopify-Access-Token': token }
            });

            return {
                name: 'Shopify',
                status: response.ok ? 'HEALTHY' : 'DEGRADED',
                latency: Date.now() - start,
                error: response.ok ? undefined : `Status ${response.status}`
            };
        } catch (e: any) {
            return {
                name: 'Shopify',
                status: 'DOWN',
                latency: Date.now() - start,
                error: e.message
            };
        }
    }
}
```

---

## Component 4: Main Diagnostic Runner

### Purpose
Orchestrate all diagnostics and produce a unified report.

### Implementation

```typescript
// backend/src/diagnostics/SystemDiagnostics.ts

import { SchemaValidator } from './SchemaValidator';
import { APITester } from './APITester';
import { IntegrationAuditor } from './IntegrationAuditor';

export interface DiagnosticReport {
    timestamp: string;
    version: string;
    summary: {
        overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
        schemaIssues: number;
        apiFailures: number;
        integrationIssues: number;
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
        console.log('[Diagnostics] Starting full system diagnostic...');

        // Run all checks in parallel
        const [schemaResults, apiResults, integrationResults] = await Promise.all([
            this.schemaValidator.validateAll(),
            this.apiTester.runAll(),
            this.integrationAuditor.auditAll()
        ]);

        // Calculate summary
        const schemaIssues = schemaResults.filter(r => r.status !== 'OK').length;
        const apiFailures = apiResults.filter(r => r.status === 'FAIL').length;
        const integrationIssues = integrationResults.filter(
            r => r.status === 'DOWN' || r.status === 'DEGRADED'
        ).length;

        // Determine overall health
        let overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
        if (schemaIssues > 0 || integrationIssues > 0) overall = 'DEGRADED';
        if (apiFailures > 2 || integrationResults.some(r => r.status === 'DOWN')) {
            overall = 'CRITICAL';
        }

        // Generate recommendations
        const recommendations = this.generateRecommendations(
            schemaResults, apiResults, integrationResults
        );

        return {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            summary: {
                overall,
                schemaIssues,
                apiFailures,
                integrationIssues
            },
            schema: schemaResults,
            api: apiResults,
            integrations: integrationResults,
            recommendations
        };
    }

    private generateRecommendations(
        schema: any[], api: any[], integrations: any[]
    ): string[] {
        const recs: string[] = [];

        // Schema recommendations
        for (const s of schema) {
            if (s.status === 'MISMATCH') {
                recs.push(`[SCHEMA] Run migration to add missing columns in ${s.table}: ${s.missing.join(', ')}`);
            }
        }

        // API recommendations
        const failedApis = api.filter(a => a.status === 'FAIL');
        if (failedApis.length > 0) {
            recs.push(`[API] ${failedApis.length} endpoints failing. Check server logs.`);
        }

        // Integration recommendations
        for (const i of integrations) {
            if (i.status === 'UNCONFIGURED') {
                recs.push(`[CONFIG] Configure ${i.name}: ${i.details?.reason}`);
            }
            if (i.status === 'DOWN') {
                recs.push(`[CRITICAL] ${i.name} is DOWN: ${i.error}`);
            }
        }

        return recs;
    }
}
```

---

## CLI Runner (For AI Agents)

```typescript
// backend/src/diagnostics/cli.ts

import { SystemDiagnostics } from './SystemDiagnostics';

async function main() {
    const diagnostics = new SystemDiagnostics();

    // Optional: Set auth token from environment
    if (process.env.DIAG_AUTH_TOKEN) {
        diagnostics.setAuthToken(process.env.DIAG_AUTH_TOKEN);
    }

    const report = await diagnostics.runFullDiagnostic();

    // Output JSON for AI consumption
    console.log(JSON.stringify(report, null, 2));

    // Exit with appropriate code
    process.exit(report.summary.overall === 'CRITICAL' ? 1 : 0);
}

main().catch(e => {
    console.error('Diagnostic failed:', e);
    process.exit(1);
});
```

### NPM Script

```json
// Add to backend/package.json
{
  "scripts": {
    "diagnose": "npx ts-node src/diagnostics/cli.ts",
    "diagnose:schema": "npx ts-node -e \"require('./src/diagnostics/SchemaValidator').then(m => m.validateAll().then(console.log))\"",
    "diagnose:integrations": "npx ts-node -e \"require('./src/diagnostics/IntegrationAuditor').then(m => m.auditAll().then(console.log))\""
  }
}
```

---

## Usage by AI Agent

### Command
```bash
cd backend && npm run diagnose
```

### Example Output (What Claude Sees)
```json
{
  "timestamp": "2025-12-22T18:30:00.000Z",
  "version": "1.0.0",
  "summary": {
    "overall": "DEGRADED",
    "schemaIssues": 1,
    "apiFailures": 0,
    "integrationIssues": 0
  },
  "schema": [
    {
      "table": "mini_chips",
      "status": "MISMATCH",
      "missing": ["is_global"],
      "extra": []
    }
  ],
  "api": [
    { "name": "Get Channel Chips", "status": "PASS", "responseTime": 45 }
  ],
  "integrations": [
    { "name": "Supabase", "status": "HEALTHY", "latency": 32 },
    { "name": "Whapi (WhatsApp)", "status": "HEALTHY", "latency": 156 }
  ],
  "recommendations": [
    "[SCHEMA] Run migration to add missing columns in mini_chips: is_global"
  ]
}
```

### AI Agent Response
> "The diagnostic report shows a schema mismatch. The `mini_chips` table is missing the `is_global` column. I recommend running migration `037_fix_chip_schema.sql` to fix this."

---

## File Structure

```
backend/src/diagnostics/
├── index.ts                 # Export all
├── SystemDiagnostics.ts     # Main orchestrator
├── SchemaValidator.ts       # DB schema checks
├── APITester.ts             # API endpoint tests
├── IntegrationAuditor.ts    # External service checks
├── cli.ts                   # CLI runner for AI
└── definitions/
    ├── schemaDefinitions.ts # Expected DB schema
    └── apiDefinitions.ts    # Expected API contracts
```

---

## Benefits

| Feature | Benefit |
|---------|---------|
| **Non-Invasive** | Read-only operations, no mutations |
| **AI-Friendly** | JSON output perfect for LLM parsing |
| **Fast Execution** | Parallel checks, < 5 seconds typical |
| **Extensible** | Add new checks via definitions |
| **CI/CD Ready** | Exit codes for pipeline integration |
| **Self-Documenting** | Recommendations explain issues |

---

## Next Steps

1. **Phase 1**: Implement SchemaValidator + CLI runner
2. **Phase 2**: Add APITester with auth token support
3. **Phase 3**: Add IntegrationAuditor for external services
4. **Phase 4**: Integrate with E2E tests (Playwright)
5. **Phase 5**: Add to CI/CD pipeline as health gate

---

## Migration Completed vs Current State

### Schema Fixes Applied (037_fix_chip_schema.sql)
| Fix | Status |
|-----|--------|
| `active` → `is_active` | ✅ Ready |
| `actions` → `actions_payload` | ✅ Ready |
| Add `is_global` | ✅ Ready |
| Add `name` | ✅ Ready |
| Add `channel_chip_id` FK | ✅ Ready |
| `chip_id` → `mini_chip_id` | ✅ Ready |
| Add `triggered_by_message_id` | ✅ Ready |

### Remaining Items
- Execute migration on Supabase
- Verify with `npm run diagnose`
- Update any remaining TypeScript interfaces

---

*Document created: 2025-12-22*
*For: COA Viewer 2.0 / Omnichannel Orchestrator*
