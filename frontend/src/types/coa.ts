export interface Cannabinoid {
    analyte: string;
    result_pct: string;
    result_mg_g?: string;
    method?: string;
    detected: boolean;
    category?: string;
    // Chromatogram data
    retention_time?: number;
    area?: number;
}

export interface Badge {
    id: number;
    name: string;
    image_url: string;
    description?: string;
    created_at: string;
}

export interface PurchaseLink {
    label: string;
    url: string;
}

export interface AdditionalDocument {
    type: 'Amparo' | 'Autorización' | 'Instructivo' | 'Otro';
    filename: string;
    url: string;
}

export interface ExtendedMetadata {
    file_urls?: string[];
    original_filenames?: string[];
    // Extended technical metadata
    client_name?: string;
    client_reference?: string;
    received_date?: string;
    sample_condition?: string;
    storage_temp?: string;
    storage_time?: string;
    container_type?: string;
    // Product descriptions
    description_short?: string;
    description_extended?: string;
    [key: string]: any;
}

export interface COA {
    id?: string;
    public_token: string;
    coa_number?: string;
    custom_name?: string;
    lab_report_number?: string;
    lab_name?: string;
    analysis_date?: string;
    product_sku?: string;
    batch_id?: string;
    cannabinoids: Cannabinoid[];
    compliance_status: 'pending' | 'pass' | 'fail' | 'revoked';
    thc_compliance_flag: boolean;
    pdf_url_original?: string;
    metadata?: ExtendedMetadata;

    // Phase 5: Enrichment
    product_image_url?: string;
    watermark_url?: string;
    purchase_links?: PurchaseLink[];
    additional_docs?: AdditionalDocument[];
    badges?: Badge[];

    // Phase 6: Client ownership
    client_id?: string;
    custom_title?: string;
    short_description?: string;
    long_description?: string;
    is_hidden?: boolean;

    // Phase 7: Chemist/signer
    chemist_id?: string;

    // Phase 8: Templates
    template_id?: string;

    // Phase 9: Reviews
    reviews_enabled?: boolean;
    reviews_require_approval?: boolean;
}
