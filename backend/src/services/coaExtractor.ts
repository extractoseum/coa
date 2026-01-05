/* eslint-disable @typescript-eslint/no-var-requires */
const pdfLib = require('pdf-parse');
// Handle both CommonJS export (function) and ESM default export ({ default: function })
const pdf = typeof pdfLib === 'function' ? pdfLib : pdfLib.default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
const path = require('path');
import { Cannabinoid, Terpene, SampleInfo, Technician, COAClientInfo } from '../types/coa';

interface ExtractedData {
    lab_name?: string;
    analysis_date?: string;
    batch_id?: string;
    cannabinoids: Cannabinoid[];
    terpenes?: Terpene[];
    terpenes_status?: 'pass' | 'fail' | 'not_tested';
    sample_info?: SampleInfo;
    technicians?: Technician[];
    client_info?: COAClientInfo;
    thc_compliance_flag: boolean;
    compliance_status: 'pass' | 'fail';
    heavy_metals_status?: 'pass' | 'fail' | 'not_tested';
    pesticides_status?: 'pass' | 'fail' | 'not_tested';
    residual_solvents_status?: 'pass' | 'fail' | 'not_tested';
    foreign_matter_status?: 'pass' | 'fail' | 'not_tested';
    metadata?: any;
}

export class COAExtractor {

    // Known cannabinoid list from n8n logic
    private knownCannabinoids = [
        'CBC', 'CBCA', 'CBCV', 'CBD', 'CBDA', 'CBDB', 'CBDP', 'CBDV', 'CBDVA',
        'CBG', 'CBGA', 'CBL', 'CBLA', 'CBN', 'CBNA', 'CBT',
        'Δ8-THC', 'Δ8-THCA', 'Δ8-THCB', 'Δ8-THC-C8', 'Δ8-THCH', 'Δ8-THCP', 'Δ8-THCV',
        'Δ9-THC', 'Δ9-THCA', 'Δ9-THCB', 'Δ9-THC-C8', 'Δ9-THCH', 'Δ9-THCP', 'Δ9-THCV', 'Δ9-THCVA',
        'Δ4,8-iso-THC', 'Δ8-iso-THC', 'Δ10-THC', 'Δ6a,10a-THC', 'Δ7-THC',
        'THCA', 'THCVA', 'THCOA', 'THCBA', 'THCB', 'THCH', 'THCP', 'THCPV',
        '(6aR,9R,10aR)-HHC', '(6aR,9S,10aR)-HHC', 'HHC',
        '(6aR,9R,10aR)-HHCo', '(6aR,9S,10aR)-HHCo', 'HHCo', 'HHC-o', 'HHC-O',
        '9R-HHCP', '9S-HHCP', 'HHCP',
        '(6aR,9R,10aR)-HHC acetate', '(6aR,9S,10aR)-HHC acetate',
        '9R-HHCP acetate', '9S-HHCP acetate',
        'CBN acetate', 'CBC acetate', 'CBD acetate', 'CBG acetate',
        'Δ8-THC acetate', 'Δ9-THC acetate', 'THCA acetate', 'CBDA acetate', 'CBGA acetate',
        'Total Δ9-THC', 'Total Δ8-THC', 'Total CBD', 'Total CBG', 'Total CBN', 'Total CBC',
        'Total Cannabinoids', 'Total',
    ];

    constructor() {
        // SORT BY LENGTH DESCENDING to prevent substring matches (e.g. match "(6aR...)-HHC" before "HHC")
        this.knownCannabinoids.sort((a, b) => b.length - a.length);
    }

    private logDebug(message: string, data?: any) {
        const logPath = path.join(__dirname, '../../debug_extraction.log');
        const timestamp = new Date().toISOString();
        const content = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) + '\n' : ''}`;
        try {
            fs.appendFileSync(logPath, content);
        } catch (e) {
            console.error("Failed to write to debug log", e);
        }
        console.log(message); // Retain console log
    }


    // ... existing constructor ...

    // Main entry point for multiple files (averaging)
    async extractFromBuffers(buffers: Buffer[]): Promise<ExtractedData> {
        if (buffers.length === 0) throw new Error("No buffers provided");

        // Single file case
        if (buffers.length === 1) {
            return this.extractFromBuffer(buffers[0]);
        }

        // Multiple files: Extract individually and average
        const allData: ExtractedData[] = [];
        for (const buf of buffers) {
            allData.push(await this.extractFromBuffer(buf));
        }

        // Average Cannabinoids
        // Map: Analyte -> { sumPct: number, sumMg: number, count: number, detected: boolean }
        const map = new Map<string, { sumPct: number, sumMg: number, count: number, detected: boolean }>();
        const mergedCannabinoids: Cannabinoid[] = [];

        for (const data of allData) {
            for (const c of data.cannabinoids) {
                if (!map.has(c.analyte)) {
                    map.set(c.analyte, { sumPct: 0, sumMg: 0, count: 0, detected: false });
                }
                const entry = map.get(c.analyte)!;

                // Only average if detected? Or average zeros? 
                // Usually for averaged chromatograms (injection 1, injection 2), you average the RAW results.
                // KCA/Standard logic: detected means > 0.
                // If one injection detects and matches 0, usually average them.

                const pct = parseFloat(c.result_pct) || 0;
                const mg = parseFloat(c.result_mg_g || '0') || 0;

                entry.sumPct += pct;
                entry.sumMg += mg;
                entry.count++;
                if (c.detected) entry.detected = true;
            }
        }

        // Reconstruct list
        for (const [analyte, stats] of map.entries()) {
            if (stats.detected) {
                const avgPct = stats.sumPct / buffers.length; // Divide by TOTAL files, not just detected count (unless implied otherwise)
                const avgMg = stats.sumMg / buffers.length;
                mergedCannabinoids.push({
                    analyte,
                    result_pct: avgPct.toFixed(4), // Keep precision?
                    result_mg_g: avgMg.toFixed(4),
                    detected: true
                });
            }
        }

        // Merge Metadata (Take first or combine?)
        const first = allData[0];
        // Calculate new compliance based on AVERAGES
        const compliance = this.calculateTHCAlert(mergedCannabinoids);

        return {
            lab_name: first.lab_name, // Assume same lab
            analysis_date: first.analysis_date,
            batch_id: first.batch_id, // Assume same batch
            cannabinoids: mergedCannabinoids.sort((a, b) => parseFloat(b.result_pct) - parseFloat(a.result_pct)),
            thc_compliance_flag: !compliance.thcOver1,
            compliance_status: !compliance.thcOver1 ? 'pass' : 'fail',
            // Combine statuses? If any fail, fail all.
            heavy_metals_status: allData.some(d => d.heavy_metals_status === 'fail') ? 'fail' : first.heavy_metals_status,
            pesticides_status: allData.some(d => d.pesticides_status === 'fail') ? 'fail' : first.pesticides_status,
            residual_solvents_status: allData.some(d => d.residual_solvents_status === 'fail') ? 'fail' : first.residual_solvents_status,
            foreign_matter_status: allData.some(d => d.foreign_matter_status === 'fail') ? 'fail' : first.foreign_matter_status,
            metadata: {
                verification: compliance.verification,
                calculatedTotalTHC: compliance.calculatedTotalTHC,
                averaged_files: buffers.length
            }
        }
    }

    async extractFromBuffer(buffer: Buffer): Promise<ExtractedData> {
        const data = await pdf(buffer);
        const text = data.text;

        this.logDebug("--- RAW PDF TEXT START ---", text);
        this.logDebug("--- RAW PDF TEXT END ---");

        // DETECT FORMAT
        if (text.includes("Integration Results") && text.includes("ppm")) {
            this.logDebug("Format Detected: Chromatogram (ppm)");
            return this.extractChromatogram(text);
        }

        // 6. Metadata Extraction (Standard / KCA)
        const batchId = this.extractBatch(text);
        const labName = this.extractLabName(text);
        const analysisDate = this.extractDate(text);

        // 7. Extract Cannabinoids using Table Logic
        const cannabinoids = this.extractCannabinoids(text);

        // 8. Compliance Statuses
        const heavyMetalsStatus = this.checkHeavyMetalsTested(text);
        const pesticidesStatus = this.checkPesticidesTested(text);
        const residualSolventsStatus = this.checkResidualSolventsTested(text);
        const foreignMatterStatus = this.checkForeignMatter(text);
        const terpenesStatus = this.checkTerpenesTested(text);
        const terpenes = this.extractTerpenes(text);
        const sampleInfo = this.extractSampleInfo(text);
        const technicians = this.extractTechnicians(text);
        const clientInfo = this.extractClientInfo(text);

        // 9. THC Alert Calculation
        const compliance = this.calculateTHCAlert(cannabinoids);

        return {
            lab_name: labName,
            analysis_date: analysisDate,
            batch_id: batchId,
            cannabinoids,
            terpenes,
            terpenes_status: terpenesStatus,
            sample_info: sampleInfo,
            technicians,
            client_info: clientInfo,
            heavy_metals_status: heavyMetalsStatus,
            pesticides_status: pesticidesStatus,
            residual_solvents_status: residualSolventsStatus,
            foreign_matter_status: foreignMatterStatus,
            thc_compliance_flag: !compliance.thcOver1, // flag is "is compliant", so !over1
            compliance_status: !compliance.thcOver1 ? 'pass' : 'fail',
            metadata: {
                verification: compliance.verification,
                calculatedTotalTHC: compliance.calculatedTotalTHC
            }
        };
    }

    // NEW Extract logic for Chromatogram (ppm)
    private extractChromatogram(text: string): ExtractedData {
        const results: Cannabinoid[] = [];
        const peaks: any[] = []; // Store all peaks for vector table

        // Extract Injection Details metadata
        const injectionDetails: any = {};

        // Injection Name (also used as batch ID)
        const injectionNameMatch = text.match(/Injection Name:\s*([^\n\r]+)/i);
        if (injectionNameMatch) injectionDetails.injection_name = injectionNameMatch[1].trim();

        // Vial Number
        const vialMatch = text.match(/Vial Number:\s*([^\n\r]+)/i);
        if (vialMatch) injectionDetails.vial_number = vialMatch[1].trim();

        // Injection Type
        const injTypeMatch = text.match(/Injection Type:\s*([^\n\r]+)/i);
        if (injTypeMatch) injectionDetails.injection_type = injTypeMatch[1].trim();

        // Instrument Method
        const instrumentMatch = text.match(/Instrument Method:\s*([^\n\r]+)/i);
        if (instrumentMatch) injectionDetails.instrument_method = instrumentMatch[1].trim();

        // Processing Method
        const processingMatch = text.match(/Processing Method:\s*([^\n\r]+)/i);
        if (processingMatch) injectionDetails.processing_method = processingMatch[1].trim();

        // Injection Date/Time
        const injDateMatch = text.match(/Injection Date\/Time:\s*([^\n\r]+)/i);
        if (injDateMatch) injectionDetails.injection_datetime = injDateMatch[1].trim();

        // Run Time (min)
        const runTimeMatch = text.match(/Run Time \(min\):\s*([\d.]+)/i);
        if (runTimeMatch) injectionDetails.run_time = runTimeMatch[1].trim();

        // Injection Volume
        const injVolMatch = text.match(/Injection Volume:\s*([\d.]+)/i);
        if (injVolMatch) injectionDetails.injection_volume = injVolMatch[1].trim();

        // Channel
        const channelMatch = text.match(/Channel:\s*([^\n\r]+)/i);
        if (channelMatch) injectionDetails.channel = channelMatch[1].trim();

        // Wavelength
        const wavelengthMatch = text.match(/Wavelength:\s*([\d.]+)/i);
        if (wavelengthMatch) injectionDetails.wavelength = wavelengthMatch[1].trim();

        // Bandwidth
        const bandwidthMatch = text.match(/Bandwidth:\s*([\d.]+)/i);
        if (bandwidthMatch) injectionDetails.bandwidth = bandwidthMatch[1].trim();

        // Dilution Factor
        const dilutionMatch = text.match(/Dilution Factor:\s*([\d.]+)/i);
        if (dilutionMatch) injectionDetails.dilution_factor = dilutionMatch[1].trim();

        // Sample Weight
        const sampleWeightMatch = text.match(/Sample Weight:\s*([\d.]+)/i);
        if (sampleWeightMatch) injectionDetails.sample_weight = sampleWeightMatch[1].trim();

        this.logDebug("[Chromatogram] Injection Details Extracted:", injectionDetails);

        // Metadata
        let batchId = injectionDetails.injection_name || '';
        const batchMatch = text.match(/Injection Name:\s*([^\n\r]+)/i);
        if (batchMatch && !batchId) batchId = batchMatch[1].trim();

        // IMPROVED: Parse line by line from Integration Results section
        const lines = text.split(/\r?\n/);
        let inResultsSection = false;
        let totalArea = 0;
        let currentPeak: any = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // Detect start of Integration Results section
            if (/Integration Results/i.test(trimmed)) {
                inResultsSection = true;
                this.logDebug("[Chromatogram] Found Integration Results section");
                continue;
            }

            // Skip header lines (including squashed versions like "minmAU*minppm")
            if (/^No\.\s*Peak Name/i.test(trimmed) ||
                /Retention Time/i.test(trimmed) ||
                /^min\s*mAU/i.test(trimmed) ||
                /mAU\*min/i.test(trimmed) ||
                /^Peak Name/i.test(trimmed)) {
                continue;
            }

            // Stop at Total line but capture the total area
            if (/^Total:/i.test(trimmed)) {
                const totalMatch = trimmed.match(/Total:\s*([\d.]+)/i);
                if (totalMatch) {
                    totalArea = parseFloat(totalMatch[1]);
                    this.logDebug(`[Chromatogram] Total Area: ${totalArea}`);
                }
                break;
            }

            if (!inResultsSection) continue;

            // --- STATEFUL MULTI-LINE PARSING (Chromeleon) ---

            // 1. Check if it's JUST an ID (e.g. "1")
            if (/^\d+$/.test(trimmed)) {
                currentPeak = { peak_no: parseInt(trimmed) };
                continue;
            }

            // 2. Check if it's Name + ALL VALUES SQUASHED (new Chromeleon format)
            // Format: Name + RT + Area + Height + RelArea + RelHeight + Amount
            // Example: CBD6.075179.3791437.27390.0689.42203209.7311
            // Dots:    RT=.XXX, Area=.XXX, Height=.XX-.XXXX, RelA=.XX, RelH=.XX, PPM=.XXXX
            // Strategy: Use dot positions and known decimal counts to extract values
            const dotCount = (trimmed.match(/\./g) || []).length;
            if (dotCount === 6 && currentPeak) {
                // Find all dot positions
                const dots: number[] = [];
                for (let i = 0; i < trimmed.length; i++) {
                    if (trimmed[i] === '.') dots.push(i);
                }

                // Known decimal patterns (from end):
                // dots[5] = PPM dot, 4 decimals after
                // dots[4] = RelH dot, 2 decimals after, then PPM integer starts
                // dots[3] = RelA dot, 2 decimals after, then RelH integer starts
                // dots[2] = Height dot, variable decimals, then RelA integer starts
                // dots[1] = Area dot, 3 decimals after, then Height integer starts
                // dots[0] = RT dot, 3 decimals after, then Area integer starts

                // PPM: from (dots[4] + 3) to end (RelH has 2 decimals)
                const ppmIntStart = dots[4] + 3;
                const ppmStr = trimmed.slice(ppmIntStart);
                const ppm = parseFloat(ppmStr);

                // RelH: from (dots[3] + 3) to (ppmIntStart) (RelA has 2 decimals)
                const relHIntStart = dots[3] + 3;
                const relHStr = trimmed.slice(relHIntStart, ppmIntStart);

                // RelA: from (dots[2] + X) to (relHIntStart) where X = height decimals + 1
                // Height decimals = Area end to dots[2], we need to calculate
                // Area ends at dots[1] + 4 (3 decimals + 1)
                const areaEnd = dots[1] + 4;
                // Height integer starts at areaEnd, Height dot is at dots[2]
                // Height decimals count = (dots[3] - dots[2] - 1) - (relHIntStart - dots[3] - 1)
                // Actually: digits between dots[2] and dots[3] = height_dec + relA_int
                // Since relA has 2 decimals: relA_int length = relHIntStart - (dots[3] + 3 - relA_int_len)...
                // Easier: relA decimal ends at dots[3]+3, so relA value is from X to dots[3]+3
                // where X starts after height decimals

                // Simpler approach: work forward from RT
                // RT: integer digits before dots[0], then ".XXX" (3 decimals)
                // Find where RT integer starts (after name ends)
                // SPECIAL CASE: Handle "Delta 9", "Delta 8" where the number is part of the name
                let rtIntStart = dots[0];
                while (rtIntStart > 0 && /\d/.test(trimmed[rtIntStart - 1])) {
                    rtIntStart--;
                }

                // Check for "Delta X" pattern where X is a single digit followed by RT
                // If the character before rtIntStart is a space, and before that is "Delta",
                // then the first digit is part of the name
                let name = trimmed.slice(0, rtIntStart).trim();
                if (name.toLowerCase() === 'delta' && rtIntStart < dots[0]) {
                    // The digit right after "Delta " is part of the name (Delta 8, Delta 9)
                    // RT typically starts with a single digit (1-15 range for retention times)
                    // So if we have "Delta 98.692..." the "9" is part of name, "8.692" is RT
                    const rtDigits = trimmed.slice(rtIntStart, dots[0]);
                    if (rtDigits.length >= 2) {
                        // First digit is part of name, rest is RT integer
                        name = `Delta ${rtDigits[0]}`;
                        rtIntStart = rtIntStart + 1;
                    }
                }

                const rtEnd = dots[0] + 4; // 3 decimals + dot
                const rtStr = trimmed.slice(rtIntStart, rtEnd);
                const rt = parseFloat(rtStr);

                // Area: from rtEnd to dots[1]+4 (3 decimals)
                const areaStr = trimmed.slice(rtEnd, areaEnd);
                const area = parseFloat(areaStr);

                // Height: from areaEnd to somewhere before dots[3]+3
                // We know RelA ends at relHIntStart, and RelA has 2 decimals (dots[3] + 3)
                // So RelA integer starts at: relHIntStart - (relA integer length)
                // Gap between dots[2] and dots[3]: contains height decimals + relA integer
                // Gap = dots[3] - dots[2] - 1
                // Since relA has fixed 2 decimals at dots[3], relA ends at dots[3]+3
                // So relA spans from (relHIntStart - relAIntLen) to relHIntStart
                // and relAIntLen = relHIntStart - relAStart, where relAStart = dots[2] + heightDec + 1
                // Let's compute: height ends where relA starts
                // relA_start = relHIntStart - (some integer digits)
                // digits in [dots[2]+1 to dots[3]-1] = heightDec + relAInt
                const gapBetween23 = dots[3] - dots[2] - 1;
                // We need to find where height ends. Height decimals are 2-4.
                // Let's try: height has 2-4 decimals. Most common is 2-3.
                // relA integer is usually 1-2 digits (values like 90.06, 2.70)

                // Brute force: try different height decimal counts (2, 3, 4)
                let heightStr = '';
                let relAStr = '';
                let parsed = false;

                for (const heightDec of [2, 3, 4]) {
                    const heightEnd = dots[2] + heightDec + 1;
                    const relAStart = heightEnd;
                    const testRelA = trimmed.slice(relAStart, relHIntStart);

                    // Valid relA should parse as a reasonable number (0-100 range)
                    const testRelANum = parseFloat(testRelA);
                    if (!isNaN(testRelANum) && testRelANum >= 0 && testRelANum <= 100) {
                        heightStr = trimmed.slice(areaEnd, heightEnd);
                        relAStr = testRelA;
                        parsed = true;
                        break;
                    }
                }

                if (parsed && name && !isNaN(rt) && !isNaN(area) && !isNaN(ppm)) {
                    peaks.push({
                        peak_no: currentPeak.peak_no,
                        peak_name: name,
                        retention_time: rt,
                        area: area,
                        amount_ppm: ppm,
                        amount_pct: (ppm / 10000).toFixed(4),
                        is_quantified: true
                    });

                    const pct = ppm / 10000;
                    results.push({
                        analyte: name,
                        result_pct: pct.toFixed(4),
                        result_mg_g: (ppm / 1000).toFixed(4),
                        detected: true,
                        retention_time: rt,
                        area: area
                    });

                    this.logDebug(`[Chromatogram Full-Squashed] Extracted: ${name} (RT: ${rt}, Area: ${area}, PPM: ${ppm})`);
                    currentPeak = null;
                    continue;
                }
            }

            // 2b. Check if it's Name + RT + Area (3 values squashed - older format)
            // Pattern: Name + \d+.\d{3} + \d+.\d{3}
            const nameRtAreaMatch = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9\s\-]*?)(\d+\.\d{3})(\d+\.\d{3})$/);
            if (nameRtAreaMatch && currentPeak) {
                currentPeak.peak_name = nameRtAreaMatch[1].trim();
                currentPeak.retention_time = parseFloat(nameRtAreaMatch[2]);
                currentPeak.area = parseFloat(nameRtAreaMatch[3]);
                continue;
            }

            // 3. Check if it's Amount (ppm) (e.g. "5817.18" or "158.6340")
            // This usually follows the Name/RT/Area line
            const amountMatch = trimmed.match(/^([\d,.]+|n\.a\.)$/i);
            if (amountMatch && currentPeak && currentPeak.peak_name) {
                const ppmStr = amountMatch[1].replace(/,/g, '');
                const isNA = /n\.a\./i.test(ppmStr);
                const ppm = isNA ? null : parseFloat(ppmStr);

                currentPeak.amount_ppm = ppm;

                // Add to peaks collection
                peaks.push({
                    peak_no: currentPeak.peak_no,
                    peak_name: currentPeak.peak_name,
                    retention_time: currentPeak.retention_time,
                    area: currentPeak.area,
                    amount_ppm: ppm,
                    amount_pct: ppm ? (ppm / 10000).toFixed(4) : null,
                    is_quantified: !isNA
                });

                // Add to results for visualization
                const pct = ppm ? ppm / 10000 : 0;
                results.push({
                    analyte: currentPeak.peak_name,
                    result_pct: pct.toFixed(4),
                    result_mg_g: (ppm ? ppm / 1000 : 0).toFixed(4),
                    detected: true, // If it's in the table, it's detected
                    retention_time: currentPeak.retention_time,
                    area: currentPeak.area
                });

                this.logDebug(`[Chromatogram Multi-line] Extracted: ${currentPeak.peak_name} (RT: ${currentPeak.retention_time}, Area: ${currentPeak.area}, PPM: ${ppm})`);
                currentPeak = null;
                continue;
            }

            // --- SINGLE-LINE FALLBACK (Legacy/Standard) ---

            // REGEX 1: Standard row with ppm value
            const rowWithPpm = /^(\d+)\s+([A-Za-z0-9\s\-]+?)\s+(\d+\.\d{3})\s+(\d+\.\d{3})\s+(\d+\.\d{1,4})$/;

            // REGEX 2: Row with n.a. for amount
            const rowWithNA = /^(\d+)\s+([A-Za-z0-9\s\-]+?)\s+(\d+\.\d{3})\s+(\d+\.\d{3})\s+n\.a\.$/i;

            // REGEX 3: Squashed format
            const rowSquashed = /^(\d+)\s+([A-Za-z0-9\s\-]+?)(\d+\.\d{3})(\d+\.\d{3})\s*(\d+\.\d{1,4}|n\.a\.)$/i;

            let match = trimmed.match(rowWithPpm);
            let isNA = false;

            if (!match) {
                match = trimmed.match(rowWithNA);
                if (match) isNA = true;
            }

            if (!match) {
                match = trimmed.match(rowSquashed);
                if (match && /n\.a\./i.test(match[5])) isNA = true;
            }

            if (match) {
                // ... (existing logic for single line)
                let peakNo = parseInt(match[1]);
                let name = match[2].trim();
                let retTimeStr = match[3];
                let areaStr = match[4];
                let ppmStr = isNA ? null : (match[5] ? match[5].replace(/,/g, '') : null);

                const retTimeVal = parseFloat(retTimeStr);
                const areaVal = parseFloat(areaStr);
                const ppm = ppmStr ? parseFloat(ppmStr) : null;

                peaks.push({
                    peak_no: peakNo,
                    peak_name: name,
                    retention_time: retTimeVal,
                    area: areaVal,
                    amount_ppm: ppm,
                    amount_pct: ppm ? (ppm / 10000).toFixed(4) : null,
                    is_quantified: !isNA
                });

                const pct = ppm ? ppm / 10000 : 0;
                results.push({
                    analyte: name,
                    result_pct: pct.toFixed(4),
                    result_mg_g: (ppm ? ppm / 1000 : 0).toFixed(4),
                    detected: true,
                    retention_time: retTimeVal,
                    area: areaVal
                });
                this.logDebug(`[Chromatogram Single-line] Extracted: ${name} (RT: ${retTimeVal}, Area: ${areaVal}, PPM: ${ppm})`);
            }

        }

        // If line-by-line didn't work, try fallback regex strategies
        if (results.length === 0) {
            this.logDebug("[Chromatogram] Line-by-line parsing found no results, trying fallback regex...");
            const flatText = text.replace(/(\r\n|\n|\r)/gm, " ");

            // STRATEGY 1: Squashed format - numbers run together
            // Example: "1  THCBV5.9370.359 158.6340" or "4  Delta 98.7471.896 831.4385"
            // Pattern: ID + spaces + Name + RT(3dec) + Area(3dec) + space + PPM(4dec) OR n.a.
            const rowRegex = /(\d+)\s{1,3}([A-Za-z0-9][A-Za-z0-9\s\-]*?)(\d+\.\d{3})(\d+\.\d{3})\s+(\d+\.\d{4}|n\.a\.)/gi;

            let match;
            while ((match = rowRegex.exec(flatText)) !== null) {
                let name = match[2].trim();
                let retTimeStr = match[3];
                const areaStr = match[4];
                const ppmStr = match[5];

                // Heuristic: Fix "Delta 9" issue where "9" gets absorbed into retention time
                if (parseFloat(retTimeStr) > 30) {
                    const firstDigit = retTimeStr.charAt(0);
                    name = name + " " + firstDigit;
                    retTimeStr = retTimeStr.substring(1);
                    this.logDebug(`[Chromatogram Fallback] Heuristic fix: ${name} (RT: ${retTimeStr})`);
                }

                // Skip junk
                if (name.length > 50 || /Reporte|Chromeleon|Injection|Page|Method/i.test(name)) {
                    continue;
                }

                const retTime = parseFloat(retTimeStr);
                const areaVal = parseFloat(areaStr);
                const isNA = /n\.a\./i.test(ppmStr);
                const ppm = isNA ? null : parseFloat(ppmStr);

                // Store peak data for vector table
                peaks.push({
                    peak_no: peaks.length + 1,
                    peak_name: name,
                    retention_time: retTime,
                    area: areaVal,
                    amount_ppm: ppm,
                    amount_pct: ppm ? (ppm / 10000).toFixed(4) : null,
                    is_quantified: ppm !== null
                });

                if (ppm !== null && !isNaN(ppm)) {
                    const pct = ppm / 10000;
                    const mg_g = ppm / 1000;

                    results.push({
                        analyte: name,
                        result_pct: pct.toFixed(4),
                        result_mg_g: mg_g.toFixed(4),
                        detected: pct > 0,
                        retention_time: retTime,
                        area: areaVal
                    });
                    this.logDebug(`[Chromatogram Fallback] Extracted: ${name} -> ${ppm}ppm (RT: ${retTime}min, Area: ${areaVal})`);
                } else {
                    // For n.a. peaks
                    results.push({
                        analyte: name,
                        result_pct: '0.0000',
                        result_mg_g: '0.0000',
                        detected: true,
                        retention_time: retTime,
                        area: areaVal
                    });
                    this.logDebug(`[Chromatogram Fallback] Extracted (n.a.): ${name} -> n.a. (RT: ${retTime}min, Area: ${areaVal})`);
                }
            }
        }

        // If totalArea was not explicitly found in a "Total:" line, sum up the areas of all detected peaks
        if (totalArea === 0 && peaks.length > 0) {
            totalArea = peaks.reduce((sum, p) => sum + (p.area || 0), 0);
            this.logDebug(`[Chromatogram] Summed Peak Areas for Total: ${totalArea}`);
        }

        // Add area_pct to results for visualization
        if (totalArea > 0) {
            results.forEach(c => {
                if (c.area) {
                    const areaPct = (c.area / totalArea) * 100;
                    // We'll store it in a new property if we want, or in metadata per-peak
                    // But to make it easiest for the frontend without type changes everywhere:
                    (c as any).area_pct = areaPct.toFixed(4);
                }
            });
        }

        if (results.length === 0) {
            this.logDebug("[Chromatogram] No results found. Raw text sample:", text.substring(0, 1000));
        }

        const compliance = this.calculateTHCAlert(results);

        // Extract analysis date from injection datetime if available
        let analysisDate: string | undefined;
        if (injectionDetails.injection_datetime) {
            const dateStr = injectionDetails.injection_datetime;
            analysisDate = dateStr;
        }

        return {
            lab_name: 'Chromeleon',
            analysis_date: analysisDate,
            batch_id: batchId,
            cannabinoids: results,
            thc_compliance_flag: !compliance.thcOver1,
            compliance_status: !compliance.thcOver1 ? 'pass' : 'fail',
            heavy_metals_status: 'not_tested',
            pesticides_status: 'not_tested',
            residual_solvents_status: 'not_tested',
            foreign_matter_status: 'not_tested',
            metadata: {
                verification: compliance.verification,
                calculatedTotalTHC: compliance.calculatedTotalTHC,
                injection_details: injectionDetails,
                peaks: peaks,
                total_area: totalArea
            }
        };
    }


    // --- Helpers from User provided Code ---

    private extractBatch(text: string): string {
        const patterns = [
            /Certificate of Analysis\s*\n([^\n]+)/i,
            /^([A-Z]{2,4}[-.0-9]+\.?\d*)$/m,
            /Batch\s*:\s*([^\n]+)/i,
            /Batch:\s*([^\s]+)/i,
            /Sample ID:\s*SA-\d+-\d+\s*\nBatch:\s*([^\n]+)/i,
        ];
        for (const p of patterns) {
            const m = text.match(p);
            if (m && m[1] && m[1].trim()) {
                const v = m[1].trim();
                // Filter out false positives
                if (!v.includes('Sample') && !v.includes('Type') && v !== '') return v;
            }
        }
        return '';
    }

    private extractLabName(text: string): string {
        // Simple defaults + extraction
        if (text.includes('KCA Laboratories')) return 'KCA Laboratories';
        if (text.includes('Confident Cannabis')) return 'Confident Cannabis';
        return 'Unknown Lab';
    }

    private extractDate(text: string): string | undefined {
        const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4})|(\d{4}-\d{2}-\d{2})/;
        const match = text.match(dateRegex);
        return match ? match[0] : undefined;
    }

    // 3. Helper: normalizeTableLines
    private normalizeTableLines(lines: string[]): string[] {
        const merged: string[] = [];
        // Matches typical number line: LOD/LOQ or Numbers separated by spaces
        const numRe = /^(?:<LO[QD]|\d+(?:\.\d+)?)\s+(?:<LO[QD]|\d+(?:\.\d+)?)(?:\s+(?:ND|<LO[QD]|\d+(?:\.\d+)?)){1,2}$/i;

        for (let i = 0; i < lines.length; i++) {
            const cur = (lines[i] || '').trim().replace(/[Δδ∆]/g, 'Δ').replace(/\s+/g, ' ');

            // Skip empty lines
            if (!cur) continue;

            let j = i + 1;
            let accumulated = cur;
            let consumed = 0;

            // Look ahead up to 5 lines to reconstruct broken cannabinoid names
            while (j < lines.length && consumed < 5) {
                const nextLine = (lines[j] || '').trim().replace(/[Δδ∆]/g, 'Δ').replace(/\s+/g, ' ');

                if (!nextLine) {
                    j++;
                    consumed++;
                    continue;
                }

                // Check if accumulated line now has numbers (complete row)
                const hasNumbers = /(?:\d+\.\d+|\bND\b|<LO[QD])/i.test(accumulated);
                const nextHasOnlyNumbers = numRe.test(nextLine);
                const nextIsShortText = nextLine.length <= 3 && !/\d/.test(nextLine);

                // If current accumulated doesn't have numbers but next line does
                if (!hasNumbers && nextHasOnlyNumbers) {
                    accumulated += ' ' + nextLine;
                    i = j;
                    break;
                }

                // If next line is very short text (like "CV", "D", "G"), merge it
                if (nextIsShortText) {
                    accumulated += nextLine; // No space for short fragments
                    j++;
                    consumed++;
                    i = j - 1;
                    continue;
                }

                // If we have a complete row, stop
                if (hasNumbers) {
                    break;
                }

                // Otherwise keep looking
                j++;
                consumed++;
            }

            merged.push(accumulated);
        }

        this.logDebug("Normalized Lines", merged);
        return merged;
    }

    private extractCannabinoids(text: string): Cannabinoid[] {
        const results: Cannabinoid[] = [];
        const processed = new Set<string>();

        const rawLines = text.split('\n');

        let start = -1;
        let end = rawLines.length;

        // Locate table block with ROBUST logic
        for (let i = 0; i < rawLines.length; i++) {
            const l = rawLines[i];
            if (l.includes('Cannabinoids by')) {
                start = i;
                this.logDebug(`Table Start Found (Header): Line ${i}`, l);
                break;
            }
            // Robust check: Analyte AND LOD on same line OR next line
            if (/Analyte/i.test(l) && (/LOD/i.test(l) || /LOD/i.test(rawLines[i + 1] || ''))) {
                start = i;
                this.logDebug(`Table Start Found (Analyte Row): Line ${i}`, l);
                break;
            }
        }

        if (start === -1) {
            this.logDebug("CRITICAL: Start of table not found!");
            return [];
        }

        for (let i = start; i < rawLines.length; i++) {
            const l = rawLines[i];
            if (/Heavy Metals|Pesticides by|Residual Solvents|Microbials|KCA Laboratories|North Plaza|Summary/i.test(l)) {
                end = i;
                this.logDebug(`Table End Found: Line ${i}`, l);
                break;
            }
        }

        const lines = this.normalizeTableLines(rawLines.slice(start, end));

        // Patterns from user code
        // Name Space LOD Space LOQ Space Result(%) Space Result(mg/g)
        const rowFive = /^(.+?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)$/i;
        // Totals line often: Name Space Res% Space ResMg
        const rowTotals = /^(Total(?: [^0-9]+?)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)$/i;

        for (const raw of lines) {
            const line = raw.trim().replace(/[Δδ∆]/g, 'Δ').replace(/\s+/g, ' ');
            if (!line || /^(Analyte|LOD|LOQ|Result|\(mg\/g\)|ND =|NT =)/i.test(line)) continue;

            let m = line.match(rowFive);
            // If rowFive didn't match, check for totals row
            if (!m) {
                const mt = line.match(rowTotals);
                if (mt) {
                    // Normalize to 5 groups [Full, Name, LOD, LOQ, Res%, ResMg]
                    m = [mt[0], mt[1], '0', '0', mt[2], mt[3]];
                }
            }

            if (!m) {
                this.logDebug(`Row regex failed for line: "${line}"`);
                continue;
            }

            const name = m[1].trim();
            const pct = m[4];
            const mg = m[5];

            // Helper to check validity
            const looksLike = (s: string) => /^(?:Total|CB[ACDLGNTB]|THC|HHC|Δ\d-|\(|9R-|9S-)/i.test(s) || /acetate$/i.test(s);

            // Check if name is known or looks valid
            const valid = this.knownCannabinoids.some(k => k.replace(/[Δ]/g, 'Δ') === name) || looksLike(name);

            // Detected check
            const isDetected = (v: string) => v && !/^ND$|^<LO[QD]$/i.test(v) && !isNaN(parseFloat(v)) && parseFloat(v) > 0;

            if (valid && isDetected(pct) && !processed.has(name)) {
                processed.add(name);
                results.push({
                    analyte: name,
                    result_pct: pct,
                    result_mg_g: mg,
                    detected: true,
                });
                this.logDebug(`[Extracted]: ${name} -> ${pct}%`);
            } else {
                if (valid) this.logDebug(`[Skipped - ND/Dup]: ${name} ${pct}`);
            }
        }

        return results.sort((a, b) => (parseFloat(b.result_pct) || 0) - (parseFloat(a.result_pct) || 0));
    }

    private extractTerpenes(text: string): Terpene[] {
        const results: Terpene[] = [];
        const processed = new Set<string>();

        // Only proceed if Terpenes section is detected
        if (!/Terpenes by|Terpene Profile/i.test(text)) return [];

        const rawLines = text.split('\n');
        let start = -1;
        let end = rawLines.length;

        // Locate start
        for (let i = 0; i < rawLines.length; i++) {
            const l = rawLines[i];
            if (l.includes('Terpene Profile') || l.includes('Terpenes by')) {
                start = i;
                break;
            }
            if (/Analyte/i.test(l) && /Terpenes/i.test(text.substring(Math.max(0, text.indexOf(l) - 200), text.indexOf(l)))) {
                // Context check: ensure we are in terpene section not cannabinoids
                // (Simple check: if we haven't found cannabinoids first, this might conflict, so careful)
                // Better: Rely on 'Terpenes by' header
            }
        }

        if (start === -1) return [];

        // Locate end (Next section)
        for (let i = start + 1; i < rawLines.length; i++) {
            const l = rawLines[i];
            if (/Heavy Metals|Pesticides|Residual Solvents|Microbials|KCA Laboratories|North Plaza|Summary|Cannabinoids/i.test(l)) {
                end = i;
                break;
            }
        }

        const lines = this.normalizeTableLines(rawLines.slice(start, end));

        // Pattern: Name LOD LOQ Res% ResMg
        // Similar to cannabinoids but analytes might have different names
        const rowFive = /^(.+?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)$/i;
        const rowTotals = /^Total Terpenes\s+(ND|<LO[QD]|\d+(?:\.\d+)?)\s+(ND|<LO[QD]|\d+(?:\.\d+)?)$/i;

        for (const raw of lines) {
            const line = raw.trim().replace(/\s+/g, ' ');
            if (!line || /^(Analyte|LOD|LOQ|Result|\(mg\/g\)|ND =|NT =)/i.test(line)) continue;

            let m = line.match(rowFive);

            // Check for total line
            if (!m && rowTotals.test(line)) {
                // Ignore total for array, but good for validation
                continue;
            }

            if (!m) continue;

            const name = m[1].trim();
            const pct = m[4];
            const mg = m[5];

            // Known common terpenes (validation heuristic)
            const isTerpene = /ene|ol|one|oxide|mene|lene/i.test(name) || /Guaiol|Bisabolol|Eucalyptol|Camphene|Carene|Cymene/i.test(name);

            const isDetected = (v: string) => v && !/^ND$|^<LO[QD]$/i.test(v) && !isNaN(parseFloat(v)) && parseFloat(v) > 0;

            if (isTerpene && isDetected(pct) && !processed.has(name)) {
                processed.add(name);
                results.push({
                    analyte: name,
                    result_pct: pct,
                    result_mg_g: mg,
                    detected: true
                });
                this.logDebug(`[Terpene Extracted]: ${name} -> ${pct}%`);
            }
        }

        return results.sort((a, b) => (parseFloat(b.result_pct) || 0) - (parseFloat(a.result_pct) || 0));
    }

    private extractSampleInfo(text: string): SampleInfo {
        const info: SampleInfo = {};

        // 1. Sample Type (Matrix)
        const typeMatch = text.match(/Matrix:\s*([^\n\r]+)/i) || text.match(/Sample Type:\s*([^\n\r]+)/i);
        if (typeMatch) {
            info.sample_type = typeMatch[1].trim();
        }

        // 2. Moisture Content
        if (/Moisture/i.test(text)) {
            // Pattern: Moisture Content 12.5 %
            const moistureMatch = text.match(/Moisture Content\s*[:\-\s]\s*(\d+(?:\.\d+)?)\s*%/i);
            if (moistureMatch) {
                info.moisture_content = parseFloat(moistureMatch[1]);
            }
        }

        // 3. Water Activity
        if (/Water Activity/i.test(text)) {
            // Pattern: Water Activity 0.55 aw
            const awMatch = text.match(/Water Activity\s*[:\-\s]\s*(\d+(?:\.\d+)?)\s*(?:aw)?/i);
            if (awMatch) {
                info.water_activity = parseFloat(awMatch[1]);
            }
        }

        // 4. Unit Mass (g)
        // Pattern: Unit Mass (g): 10.5
        // Pattern 2: Unit Mass (g): <empty>
        const unitMassMatch = text.match(/Unit Mass\s*(?:\(g\))?\s*[:\-\s]\s*(\d+(?:\.\d+)?)/i);
        if (unitMassMatch) {
            info.unit_mass_g = parseFloat(unitMassMatch[1]);
        }

        return info;
    }

    private extractTechnicians(text: string): Technician[] {
        const technicians: Technician[] = [];

        // 1. "Generated By: [Name]\n[Role]\nDate: [Date]"
        // Regex: Generated By:\s*([^\n\r]+)(?:\n([^\n\r]+))?(?:\nDate:\s*(\d{2}\/\d{2}\/\d{4}))?

        // KCA Format:
        // Generated By: Alex Morris
        // Quality Manager
        // Date: 09/22/2025

        const generatedByRegex = /Generated By:\s*([^\n\r]+)(?:\s*\r?\n\s*([^\n\r]+))?(?:\s*\r?\n\s*Date:\s*(\d{2}\/\d{2}\/\d{4}))?/i;
        const genMatch = text.match(generatedByRegex);

        if (genMatch) {
            technicians.push({
                name: genMatch[1].trim(),
                role: genMatch[2] ? genMatch[2].trim() : 'Unknown Role',
                date: genMatch[3] || undefined,
                signature_type: 'Generated By'
            });
        }

        // 2. "Tested By: [Name]\n[Role]\nDate: [Date]"
        const testedByRegex = /Tested By:\s*([^\n\r]+)(?:\s*\r?\n\s*([^\n\r]+))?(?:\s*\r?\n\s*Date:\s*(\d{2}\/\d{2}\/\d{4}))?/i;
        const testMatch = text.match(testedByRegex);

        if (testMatch) {
            technicians.push({
                name: testMatch[1].trim(),
                role: testMatch[2] ? testMatch[2].trim() : 'Unknown Role',
                date: testMatch[3] || undefined,
                signature_type: 'Tested By'
            });
        }

        return technicians;
    }

    private extractClientInfo(text: string): COAClientInfo | undefined {
        // Detect "Client" block
        // Heuristic: Looks for "Client" keyword followed by lines of text before other details

        // Normalize text to process line by line
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Find line index containing "Client" standing alone or as a header
        // Relaxed matching: Allow "Client" or "Analyzed For" with optional colons, case-insensitive
        const clientHeaderIndex = lines.findIndex(l => {
            const normalized = l.toLowerCase();
            return normalized === 'client' ||
                normalized === 'analyzed for' ||
                normalized.startsWith('client:') ||
                normalized.startsWith('analyzed for:');
        });

        if (clientHeaderIndex === -1 || clientHeaderIndex + 1 >= lines.length) {
            return undefined;
        }

        // KCA Labs Structure:
        // Client
        // <Name>
        // <Address Line 1>
        // <Address Line 2 (City, State, Zip)>
        // <Country> (Optional)
        // <License> (Optional)

        // We capture up to 4 lines after the header, stopping if we hit another keyword
        const capturedLines: string[] = [];
        const stopKeywords = ['Sample ID', 'Batch', 'Type', 'Matrix', 'Received', 'Completed', 'Unit Mass'];

        for (let i = clientHeaderIndex + 1; i < lines.length && i < clientHeaderIndex + 6; i++) {
            const line = lines[i];
            // Stop if we hit a keyword or a date-like visual separator
            if (stopKeywords.some(kw => line.startsWith(kw))) break;
            if (line.includes('https://') || line.includes('Lic.#')) {
                // Sometimes license is mixed in, we can treat it as part of client info or handle separately
            }
            capturedLines.push(line);
        }

        if (capturedLines.length === 0) return undefined;

        // Parse captured lines
        // Assumption: Line 0 is Name, Last non-license line is country if it is "USA" or "Mexico"
        const name = capturedLines[0];
        let address = '';
        let city_state_zip = '';
        let country = 'USA'; // Default for KCA Labs
        const licenses: string[] = [];

        if (capturedLines.length > 1) {
            address = capturedLines[1];
        }

        if (capturedLines.length > 2) {
            // Check if line 2 is city/state/zip or address part 2
            city_state_zip = capturedLines[2];
        }

        if (capturedLines.length > 3) {
            if (['USA', 'United States', 'Mexico'].includes(capturedLines[3])) {
                country = capturedLines[3];
            } else {
                // Maybe it's a license line or extra address info
                if (capturedLines[3].includes('Lic')) {
                    licenses.push(capturedLines[3]);
                }
            }
        }

        // Simple cleanup
        return {
            name,
            address,
            city_state_zip,
            country,
            licenses: licenses.length > 0 ? licenses : undefined
        };
    }
    private checkTerpenesTested(text: string): 'pass' | 'fail' | 'not_tested' {
        if (/Terpenes by|Terpene Profile/i.test(text)) {
            if (/Terpenes[\s\S]{0,100}Not Tested/i.test(text)) return 'not_tested';
            return 'pass';
        }
        return 'not_tested';
    }


    private checkHeavyMetalsTested(text: string): 'pass' | 'fail' | 'not_tested' {
        if (/Heavy Metals.*?Tested/i.test(text)) {
            if (/Heavy Metals.*?(Passed|Pass)/i.test(text) || /Heavy Metals[\s\S]{0,100}Passed/i.test(text)) return 'pass';
            return 'pass';
        }
        if (/Heavy Metals by ICP-MS/i.test(text) && /Arsenic|Cadmium|Lead|Mercury/i.test(text)) return 'pass';
        if (/Heavy Metals.*?Passed/i.test(text)) return 'pass';
        if (/Heavy Metals.*?Failed/i.test(text)) return 'fail';

        return 'not_tested';
    }

    private checkPesticidesTested(text: string): 'pass' | 'fail' | 'not_tested' {
        if (/Pesticides.*?Tested/i.test(text)) {
            if (/Pesticides.*?(Passed|Pass)/i.test(text) || /Pesticides[\s\S]{0,100}Passed/i.test(text)) return 'pass';
            return 'pass';
        }
        if (/Pesticides by LC-MS\/MS/i.test(text)) return 'pass';
        if (/Pesticides.*?Passed/i.test(text)) return 'pass';
        return 'not_tested';
    }

    private checkResidualSolventsTested(text: string): 'pass' | 'fail' | 'not_tested' {
        if (/Residual Solvents.*?Tested/i.test(text)) {
            if (/Residual Solvents.*?(Passed|Pass)/i.test(text) || /Residual Solvents[\s\S]{0,100}Passed/i.test(text)) return 'pass';
            return 'pass';
        }
        if (/Residual Solvents by HS-GC-MS/i.test(text)) return 'pass';
        if (/Residual Solvents.*?Passed/i.test(text)) return 'pass';
        return 'not_tested';
    }

    private checkForeignMatter(text: string): 'pass' | 'fail' | 'not_tested' {
        if (/Foreign Matter.*?Tested/i.test(text)) {
            if (/Foreign Matter.*?(Passed|Pass)/i.test(text)) return 'pass';
            return 'pass';
        }
        return 'not_tested';
    }

    private calculateTHCAlert(cannabinoids: Cannabinoid[]): { thcOver1: boolean, calculatedTotalTHC: number, verification: string } {
        let totalTHC = 0;
        let officialTotalTHC = 0;

        // Helper function to check if a cannabinoid is a THC variant
        // All Delta cannabinoids (Δ8, Δ9, Δ10, etc.) and THC variants are considered THC
        const isTHCVariant = (analyte: string): boolean => {
            const upperAnalyte = analyte.toUpperCase();
            // Match: Delta/Δ followed by any number, THC variants, and exclude totals
            return (
                /^Δ\d/.test(analyte) ||                    // Δ8-THC, Δ9-THC, Δ10-THC, etc.
                /^DELTA\s*\d/i.test(analyte) ||            // Delta 8, Delta 9, Delta 10, etc.
                upperAnalyte.includes('THC') ||            // THCA, THCV, THCP, THCB, etc.
                /^D\d+-THC/i.test(analyte)                 // D8-THC, D9-THC format
            ) && !upperAnalyte.startsWith('TOTAL');        // Exclude "Total THC" to avoid double counting
        };

        // Get factor for THC acids (THCA needs 0.877 conversion factor)
        const getTHCFactor = (analyte: string): number => {
            const upperAnalyte = analyte.toUpperCase();
            // THCA, Δ9-THCA, Δ8-THCA, etc. need the decarboxylation factor
            if (upperAnalyte.includes('THCA')) {
                return 0.877;
            }
            return 1.0;
        };

        for (const it of cannabinoids) {
            if (!it || !it.analyte) continue;

            const value = parseFloat(it.result_pct) || 0;

            // Check for official total THC value (from lab)
            if (it.analyte.toUpperCase().startsWith('TOTAL') && it.analyte.toUpperCase().includes('THC')) {
                officialTotalTHC = value;
                continue;
            }

            // Sum all THC variants with appropriate conversion factor
            if (isTHCVariant(it.analyte)) {
                const factor = getTHCFactor(it.analyte);
                totalTHC += value * factor;
                this.logDebug(`[THC Calc] ${it.analyte}: ${value}% × ${factor} = ${(value * factor).toFixed(4)}%`);
            }
        }

        const finalTotalTHC = officialTotalTHC > 0 ? officialTotalTHC : totalTHC;
        const difference = Math.abs((officialTotalTHC || 0) - totalTHC);
        const calculationMatch = difference < 0.5;

        this.logDebug(`[THC Calc] Total: ${totalTHC.toFixed(4)}%, Official: ${officialTotalTHC.toFixed(4)}%, Final: ${finalTotalTHC.toFixed(4)}%`);

        return {
            thcOver1: finalTotalTHC > 1.0,
            calculatedTotalTHC: finalTotalTHC,
            verification: calculationMatch ? 'MATCH' : 'MISMATCH'
        };
    }
}
