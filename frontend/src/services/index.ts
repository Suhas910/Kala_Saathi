// src/services/index.ts
import { mockApi } from './mockApi';
import { liveApi } from './api';
import type { ListingService } from '../types/contracts';

// Seamlessly switch between mockApi and liveApi.
// Defaults to mockApi for reliable offline mobile execution, completely ready for live backend.
const USE_LIVE_BACKEND = false;

export const service: ListingService = USE_LIVE_BACKEND ? liveApi : mockApi;
export { mockApi, liveApi };