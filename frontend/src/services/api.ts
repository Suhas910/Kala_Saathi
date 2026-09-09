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