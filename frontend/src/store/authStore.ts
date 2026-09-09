// src/store/authStore.ts
import { create } from 'zustand';
import { UserRole } from '../types/contracts';

interface AuthState {
  isAuthenticated: boolean;
  role: UserRole | null;
  userId: string | null;
  setAuth: (token: string, role: UserRole, userId: string) => void;
  logout: () => void;
}

// Note: The actual JWT is managed by expo-secure-store. 
// This store strictly manages what the UI needs to render the correct navigation stack.
export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  role: null,
  userId: null,
  setAuth: (token, role, userId) => set({ isAuthenticated: true, role, userId }),
  logout: () => set({ isAuthenticated: false, role: null, userId: null }),
}));