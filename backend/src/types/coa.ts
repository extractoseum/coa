export interface Cannabinoid {
    analyte: string;
    result_pct: string; // Keeping as string to preserve exact formatting from PDF if needed, or convert to number
    result_mg_g?: string;
    method?: string;
    detected: boolean;
    category?: string;
    // Chromatogram data for synthetic graph generation
    retention_time?: number; // in minutes
    area?: number; // mAU*min
}

// Data point for chromatogram visualization
export interface ChromatogramPeak {
    name: string;
    retention_time: number; // minutes
    area: number; // mAU*min (height proxy)
    ppm?: number;
}

export interface COA {
    id?: string;
    public_token: string;
    coa_number?: string;
    custom_name?: string;

    // Extracted Data
    lab_report_number?: string;
    lab_name?: string;
    analysis_date?: string; // ISO Date string

    // Product Mapping
    product_sku?: string;
    shopify_product_id?: string;
    shopify_variant_id?: string;
    batch_id?: string;

    // Standardized Data
    cannabinoids: Cannabinoid[];
    metadata?: Record<string, any>;

    // Compliance
    compliance_status: 'pending' | 'pass' | 'fail' | 'revoked';
    thc_compliance_flag: boolean;

    // Files
    pdf_url_original?: string;
    pdf_url_branded?: string;

    created_at?: string;
    updated_at?: string;
}

export interface VerificationResult {
    verified: boolean;
    coa?: COA;
    message?: string;
}
