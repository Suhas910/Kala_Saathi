// --- 1. ROLES & STATES ---
export type UserRole = 'artisan' | 'coordinator' | 'admin';

export type ListingState = 
  | 'draft' 
  | 'processing' 
  | 'awaiting_confirmation' 
  | 'awaiting_approval' 
  | 'approved' 
  | 'export_queued' 
  | 'exported' 
  | 'rejected' 
  | 'failed';

// --- 2. ERROR HANDLING ---
export type ErrorCode = 
  | 'MEDIA_QUALITY_INSUFFICIENT'
  | 'ASR_LOW_CONFIDENCE'
  | 'CATALOGUE_SCHEMA_INVALID'
  | 'PROVENANCE_VERIFICATION_REQUIRED'
  | 'WAGE_RATE_UNAVAILABLE'
  | 'LISTING_STATE_INVALID'
  | 'EXPORT_CONTRACT_INVALID'
  | 'PROVIDER_UNAVAILABLE';

export interface ApiError {
  request_id: string;
  error: {
    code: ErrorCode;
    message: string;
    recoverable: boolean;
    action: string;
  };
}

// --- 3. NETWORK HELPERS ---
// Every api.ts mutation function should wrap its body in this wrapper.
export interface IdempotentRequest<T> {
  idempotency_key: string;
  payload: T;
}

// --- 4. CORE ENTITIES ---
export interface MediaAsset {
  id: string;
  kind: 'image' | 'audio';
  variant: 'original' | 'enhanced';
  status: 'pending' | 'processing' | 'complete' | 'failed';
  url?: string; 
}

export interface Claim {
  claim: string;
  asserted_by_artisan: boolean;
  coordinator_verified: boolean;
  evidence_note: string | null;
}

// Standardized to integer paise
export interface PriceResult {
  calculation_version: string;
  status: 'available' | 'unavailable';
  currency: 'INR';
  wage_source?: {
    state_code: string;
    notification_ref: string;
    effective_from: string;
    source_url: string;
  };
  inputs: {
    material_cost_paise: number;
    labour_hours: number;
    hourly_wage_paise: number;
    skill_level: string;
  };
  floor_amount_paise: number;
  recommended_low_paise: number;
  recommended_high_paise: number;
  explanation: string;
}

// Strictly typed catalogue draft matching backend JSON contracts
export interface CatalogueDraft {
  listing_id: string;
  category: string;
  materials: string[];
  techniques: string[];
  title: { en: string; local: string; local_language: string };
  description: { en: string; local: string };
  labour: { hours: number; skill_level: string; state_code: string };
  material_cost_paise: number;
  provenance: { claims: Claim[]; gi_tag: string | null };
  source: { transcript_id: string; asr_confidence: number };
}

export interface CatalogueResult {
  schema_version: string;
  catalogue: CatalogueDraft;
  field_confidence: Record<string, number>;
  needs_confirmation: string[];
}

export interface Listing {
  id: string;
  artisan_id: string;
  state: ListingState;
  preferred_language: string;
  media: MediaAsset[];
  catalogue: CatalogueResult | null; 
  price: PriceResult | null;
  claims: Claim[];
  created_at: string;
  updated_at: string;
}

// --- 5. JOB STATUS ---
export interface JobStatus {
  job_id: string;
  type: 'image_studio' | 'transcription' | 'catalogue_generation';
  status: 'queued' | 'processing' | 'complete' | 'failed';
  attempt: number;
  created_at: string;
  updated_at: string;
}

// --- 6. EXPORT RESULT ---
export interface ExportResult {
  export_id: string;
  target: string;
  status: 'validated' | 'submitted' | 'exported' | 'failed';
  payload_hash: string;
  contract_validation: {
    passed: boolean;
    schema_source: string;
  };
  network_submission: 'not_attempted' | 'pending' | 'success' | 'failed';
}