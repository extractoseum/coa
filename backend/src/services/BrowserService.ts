import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

/**
 * Cortex Browser - The "Grounder" Module
 * 
 * Defines the physical capability to interact with the web.
 * Controlled by the AI "Planner" via tool calls.
 */
export class BrowserService {
    private static instance: BrowserService;
    private browser: Browser | null = null;

    private constructor() { }

    public static getInstance(): BrowserService {
        if (!BrowserService.instance) {
            BrowserService.instance = new BrowserService();
        }
        return BrowserService.instance;
    }

    private async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true, // "new" is now default/true
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    /**
     * Executes a browser action plan.
     * @param action The high-level action type
     * @param target The URL or selector to act upon
     */
    public async performAction(action: 'navigate' | 'extract' | 'screenshot', target: string): Promise<any> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            // Set robust viewport
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            if (action === 'navigate' || action === 'extract') {
                console.log(`[CortexBrowser] Navigating to ${target}...`);
                await page.goto(target, { waitUntil: 'networkidle2', timeout: 30000 });
            }

            let result = null;

            if (action === 'extract') {
                const content = await page.content();
                const $ = cheerio.load(content);

                // Extract generic useful data
                const title = $('title').text().trim();
                const description = $('meta[name="description"]').attr('content') || '';
                const h1s = $('h1').map((_, el) => $(el).text().trim()).get();

                // If it looks like a tracking page (Estafeta/Fedex heuristic) try to find status
                // This is a naive heuristic - the "Planner" (AI) should ideally pass selectors if it knows them.
                // For now, we return the raw text of the main body to let the AI analyze it.
                const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 5000); // Limit context

                result = {
                    title,
                    description,
                    h1s,
                    preview: bodyText
                };
            }

            if (action === 'screenshot') {
                // Return base64 for AI vision (if supported later)
                result = await page.screenshot({ encoding: 'base64' });
            }

            return { success: true, action, target, data: result };

        } catch (error: any) {
            console.error('[CortexBrowser] Error:', error);
            return { success: false, error: error.message };
        } finally {
            await page.close(); // Close tab to save memory
        }
    }
}
