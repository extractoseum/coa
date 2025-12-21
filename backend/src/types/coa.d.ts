export interface Cannabinoid {
    analyte: string;
    result_pct: string;
    result_mg_g?: string;
    method?: string;
    detected: boolean;
    category?: string;
}
export interface COA {
    id?: string;
    public_token: string;
    lab_report_number?: string;
    lab_name?: string;
    analysis_date?: string;
    product_sku?: string;
    shopify_product_id?: string;
    shopify_variant_id?: string;
    batch_id?: string;
    cannabinoids: Cannabinoid[];
    metadata?: Record<string, any>;
    compliance_status: 'pending' | 'pass' | 'fail' | 'revoked';
    thc_compliance_flag: boolean;
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
//# sourceMappingURL=coa.d.ts.map