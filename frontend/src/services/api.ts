//  src/services/api.ts
import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://api.example.com/api/v1'; 

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- REQUEST INTERCEPTOR ---
api.interceptors.request.use(async (config) => {
  // 1. Attach Auth Token
  const token = await SecureStore.getItemAsync('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // 2. Attach Idempotency Key for Mutations
  // Generates a UUID for every non-GET request to ensure safe outbox retries.
  if (config.method && config.method.toLowerCase() !== 'get') {
    config.headers['Idempotency-Key'] = crypto.randomUUID();
  }
  
  return config;
});

// --- RESPONSE INTERCEPTOR ---
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Log request_id on error states for debugging per strict contracts
    const requestId = error.response?.data?.request_id || 'unknown';
    console.error(`[API Error] RequestID: ${requestId}`, error.response?.data?.error);

    // Handle 401 Unauthorized with a silent refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Attempt to get a new token
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`);
        const newToken = response.data.token;
        
        // Save the new token and update the failed request
        await SecureStore.setItemAsync('userToken', newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Retry the original request with the new token
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed (e.g., session expired completely), force logout
        await SecureStore.deleteItemAsync('userToken');
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// --- LIVE API IMPLEMENTATION OF LISTING SERVICE ---
import type {
  ListingService,
  Listing,
  JobStatus,
  ImageJobResult,
  CatalogueResult,
  PriceResult,
  ExportResult,
} from '../types/contracts';

export const liveApi: ListingService = {
  createListing: async (payload: { preferred_language: string }) => {
    const res = await api.post('/listings', payload);
    return res.data;
  },

  listListings: async (): Promise<Listing[]> => {
    const res = await api.get('/listings');
    return res.data;
  },

  getListing: async (listingId: string): Promise<Listing> => {
    const res = await api.get(`/listings/${listingId}`);
    return res.data;
  },

  completeMediaUpload: async (listingId: string, payload: { kind: string; upload_token: string; client_checksum: string }) => {
    const res = await api.post(`/listings/${listingId}/media`, payload);
    return res.data;
  },

  requestImageAnalysis: async (listingId: string, payload: { media_id: string; photos?: string[] }) => {
    // Aligned to contract: POST /listings/{id}/jobs/image-studio
    const res = await api.post(`/listings/${listingId}/jobs/image-studio`, payload);
    return res.data;
  },

  requestTranscription: async (listingId: string, payload: { audio_media_id: string; declared_language: string }) => {
    // Aligned to contract: POST /listings/{id}/jobs/transcription
    const res = await api.post(`/listings/${listingId}/jobs/transcription`, payload);
    return res.data;
  },

  getJobStatus: async (jobId: string): Promise<JobStatus> => {
    const res = await api.get(`/jobs/${jobId}`);
    return res.data;
  },

  getImageJobResult: async (jobId: string): Promise<ImageJobResult> => {
    // NOTE FOR BACKEND TEAM: Contract specifies GET /jobs/{id} returning status.
    // Clarify if job result is embedded in GET /jobs/{id} upon completion or if
    // this separate GET /jobs/{id}/result endpoint should be provided.
    const res = await api.get(`/jobs/${jobId}/result`);
    return res.data?.result ?? res.data;
  },

  requestCatalogueGeneration: async (listingId: string, payload: any): Promise<CatalogueResult> => {
    // Aligned to contract: POST /listings/{id}/jobs/catalogue
    const res = await api.post(`/listings/${listingId}/jobs/catalogue`, payload);
    return res.data;
  },

  confirmListing: async (
    listingId: string,
    payload: {
      catalogue: any;
      confirmed_fields: string[];
      corrections: { field: string; old_value: any; new_value: any; source: string }[];
    }
  ) => {
    const res = await api.post(`/listings/${listingId}/confirm`, payload);
    return res.data;
  },

  requestPrice: async (listingId: string, payload: any): Promise<PriceResult> => {
    const res = await api.post(`/listings/${listingId}/price`, payload);
    return res.data;
  },

  reviewClaim: async (listingId: string, claim: string, payload: { decision: string; evidence_note: string; reason: string | null }) => {
    const res = await api.post(`/listings/${listingId}/claims/${encodeURIComponent(claim)}/review`, payload);
    return res.data;
  },

  submitForApproval: async (listingId: string) => {
    // Aligned to contract: POST /listings/{id}/submit-for-approval
    const res = await api.post(`/listings/${listingId}/submit-for-approval`);
    return res.data;
  },

  decideApproval: async (listingId: string, payload: { decision: string; reason: string }) => {
    const res = await api.post(`/listings/${listingId}/approval`, payload);
    return res.data;
  },

  requestExport: async (listingId: string, payload: { target: string; schema_version: string }): Promise<ExportResult> => {
    // Aligned to contract: POST /listings/{id}/exports
    const res = await api.post(`/listings/${listingId}/exports`, payload);
    return res.data;
  },
};