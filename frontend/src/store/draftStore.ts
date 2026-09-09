// src/store/draftStore.ts
import { create } from 'zustand';

interface DraftState {
  activeDraftId: string | null;
  setActiveDraft: (id: string) => void;
  clearDraft: () => void;
}

// Persists the local draftId from the first capture so later actions safely attach to it.
export const useDraftStore = create<DraftState>((set) => ({
  activeDraftId: null,
  setActiveDraft: (id) => set({ activeDraftId: id }),
  clearDraft: () => set({ activeDraftId: null }),
}));