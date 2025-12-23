import axios from 'axios';

interface APITest {
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    endpoint: string;
    requiresAuth: boolean;
    expectedStatus: number[];
    validate?: (data: any) => { ok: boolean; error?: string };
    mockBody?: any;
}

interface APITestResult {
    name: string;
    endpoint: string;
    status: 'PASS' | 'FAIL' | 'WARN';
    actualStatus?: number;
    issue?: string;
    responseTime?: number;
    error?: string;
}

const API_TESTS: APITest[] = [
    {
        name: 'Health Check',
        method: 'GET',
        endpoint: '/api/v1/health',
        requiresAuth: false,
        expectedStatus: [200],
        validate: (data) => {
            if (!data.status) return { ok: false, error: 'Missing "status" field' };
            return { ok: true };
        }
    },
    {
        name: 'CRM Columns Availability',
        method: 'GET',
        endpoint: '/api/v1/crm/columns',
        requiresAuth: true,
        expectedStatus: [200, 401],
        validate: (data) => {
            if (Array.isArray(data) && data.length > 0) {
                if (!data[0].id || !data[0].name) return { ok: false, error: 'Invalid column structure' };
            }
            return { ok: true };
        }
    }
];

export class APITester {
    private baseUrl: string;
    private authToken?: string;

    constructor(baseUrl: string = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }

    setAuthToken(token: string) {
        this.authToken = token;
    }

    async runAll(): Promise<APITestResult[]> {
        const results: APITestResult[] = [];
        for (const test of API_TESTS) {
            results.push(await this.runTest(test));
        }
        return results;
    }

    async runTest(test: APITest): Promise<APITestResult> {
        const start = Date.now();
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (test.requiresAuth && this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }

            const response = await axios({
                method: test.method,
                url: `${this.baseUrl}${test.endpoint}`,
                headers,
                data: test.mockBody,
                timeout: 5000,
                validateStatus: () => true
            });

            const responseTime = Date.now() - start;
            const statusOk = test.expectedStatus.includes(response.status);

            if (!statusOk) {
                return {
                    name: test.name,
                    endpoint: test.endpoint,
                    status: 'FAIL',
                    actualStatus: response.status,
                    issue: `Unexpected status code: ${response.status}`,
                    responseTime
                };
            }

            // Body validation
            if (test.validate && response.status === 200) {
                const validation = test.validate(response.data);
                if (!validation.ok) {
                    return {
                        name: test.name,
                        endpoint: test.endpoint,
                        status: 'WARN',
                        actualStatus: response.status,
                        issue: validation.error,
                        responseTime
                    };
                }
            }

            return {
                name: test.name,
                endpoint: test.endpoint,
                status: 'PASS',
                actualStatus: response.status,
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
